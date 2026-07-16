// ─── graph_ops/episode_dedup ─────────────────────────────────────────────────
// Find-and-prune pipeline for duplicate episode entities (the zombie-run
// artifacts). Two pure functions designed to back both Hatchet tasks and the
// local CLI:
//
//   findDuplicateEpisodes(window) → PrunePlan     (read-only)
//   executePrunePlan(plan, opts)  → ops/report    (deletions-only; caller-gated)
//
// Verdicts (mirrors the manually-reviewed backfill methodology):
//   AUTO_PRUNE — same show, same airDate, prune-targets have 0 incoming refs;
//                keep = oldest entity (race artifacts are the later mints)
//   REVIEW     — anything else (airDate mismatch, no show link, incoming refs).
// Same-name episodes on DIFFERENT shows are never grouped (name+show key).

import type { Op } from '@geoprotocol/geo-sdk';
import { publishOps } from '../publish.ts';
import { gql } from './client.ts';
import { deleteEntity, queryBacklinks } from './delete_entity.ts';
import {
  CRYPTO_SPACE, PODCASTS_SPACE, PROP_AIR_DATE, PROP_PODCAST, TYPES_PROP, TYPE_EPISODE,
} from './constants.ts';

export type PruneGroup = {
  name: string;
  show: string;
  keep: string;                  // canonical (oldest) entity id
  prune: string[];               // later mints, oldest→newest
  spaceId: string;
}
export type PrunePlan = {
  window: { since: string; until?: string };
  scanned: number;
  groups: PruneGroup[];          // AUTO_PRUNE only
  review: string[];              // human-readable exclusions
  surplus: number;
}

type Ep = { id: string; name: string; createdAt: number; show: string; airDate: string; spaceId: string };

async function episodesInWindow(spaceId: string, sinceEpoch: number, signal?: AbortSignal): Promise<Ep[]> {
  const out: Ep[] = [];
  let after = '';
  for (let page = 0; page < 100; page++) {
    if (signal?.aborted) throw new Error('dedup.find aborted');
    const d = await gql(`{
      entitiesConnection(filter: {
        spaceIds: { in: ["${spaceId}"] }
        createdAt: { greaterThan: "${sinceEpoch}" }
        relations: { some: { typeId: { is: "${TYPES_PROP}" } toEntityId: { in: ["${TYPE_EPISODE}"] } } }
      }, first: 200${after ? `, after: "${after}"` : ''}) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id name createdAt
          rel: relations(filter: { typeId: { is: "${PROP_PODCAST}" } }) { nodes { toEntityId } }
          vals: values(filter: { propertyId: { is: "${PROP_AIR_DATE}" } }) { nodes { date datetime text } }
        }
      }
    }`);
    const c = d?.entitiesConnection;
    for (const n of c?.nodes ?? []) {
      const v = n.vals?.nodes?.[0] ?? {};
      out.push({
        id: n.id, name: (n.name ?? '').trim(), createdAt: Number(n.createdAt),
        show: n.rel?.nodes?.[0]?.toEntityId ?? '',
        airDate: String(v.date ?? v.datetime ?? v.text ?? '').slice(0, 10),
        spaceId,
      });
    }
    if (!c?.pageInfo?.hasNextPage) break;
    after = c.pageInfo.endCursor;
  }
  return out;
}

/** All episode entities with this exact name (any space) — twins may predate the window. */
async function episodesNamed(name: string, signal?: AbortSignal): Promise<Ep[]> {
  if (signal?.aborted) throw new Error('dedup.find aborted');
  const d = await gql(
    `query($name: String!) {
      entitiesConnection(filter: {
        name: { is: $name }
        relations: { some: { typeId: { is: "${TYPES_PROP}" } toEntityId: { in: ["${TYPE_EPISODE}"] } } }
      }, first: 20) {
        nodes {
          id name createdAt spaceIds
          rel: relations(filter: { typeId: { is: "${PROP_PODCAST}" } }) { nodes { toEntityId } }
          vals: values(filter: { propertyId: { is: "${PROP_AIR_DATE}" } }) { nodes { date datetime text } }
        }
      }
    }`,
    { name },
  );
  return (d?.entitiesConnection?.nodes ?? []).map((n: any) => {
    const v = n.vals?.nodes?.[0] ?? {};
    return {
      id: n.id, name: (n.name ?? '').trim(), createdAt: Number(n.createdAt),
      show: n.rel?.nodes?.[0]?.toEntityId ?? '',
      airDate: String(v.date ?? v.datetime ?? v.text ?? '').slice(0, 10),
      spaceId: (n.spaceIds ?? [])[0] ?? PODCASTS_SPACE,
    };
  });
}

export async function findDuplicateEpisodes(opts: {
  sinceIso: string;
  spaces?: string[];
  signal?: AbortSignal;
}): Promise<PrunePlan> {
  const { sinceIso, spaces = [PODCASTS_SPACE, CRYPTO_SPACE], signal } = opts;
  const sinceEpoch = Math.floor(new Date(sinceIso).getTime() / 1000);

  // 1. Window scan → candidate names (twins usually predate the window).
  const windowed: Ep[] = [];
  for (const s of spaces) windowed.push(...(await episodesInWindow(s, sinceEpoch, signal)));
  const candidateNames = [...new Set(windowed.map(e => e.name).filter(Boolean))];

  // 2. Global resolution per candidate name; group by (name, show).
  const groups: PruneGroup[] = [];
  const review: string[] = [];
  let surplus = 0;
  for (const name of candidateNames) {
    if (signal?.aborted) throw new Error('dedup.find aborted');
    const all = await episodesNamed(name, signal);
    const byShow = new Map<string, Ep[]>();
    for (const e of all) (byShow.get(e.show) ?? byShow.set(e.show, []).get(e.show)!).push(e);
    for (const [show, g] of byShow) {
      if (g.length < 2) continue;
      const s = [...g].sort((a, b) => a.createdAt - b.createdAt);
      if (!show) { review.push(`NO-SHOW-LINK "${name}" [${s.map(e => e.id.slice(0, 8)).join(',')}]`); continue; }
      if (new Set(s.map(e => e.airDate)).size > 1) {
        review.push(`AIRDATE-MISMATCH "${name}" [${s.map(e => `${e.id.slice(0, 8)}@${e.airDate}`).join(',')}]`);
        continue;
      }
      // incoming-reference guard on every prune target
      let referenced = false;
      for (const twin of s.slice(1)) {
        const inc = (await queryBacklinks(twin.id)).length;
        if (inc > 0) { referenced = true; review.push(`HAS-INCOMING(${inc}) "${name}" twin=${twin.id.slice(0, 8)}`); break; }
      }
      if (referenced) continue;
      groups.push({ name, show, keep: s[0].id, prune: s.slice(1).map(e => e.id), spaceId: s[0].spaceId });
      surplus += s.length - 1;
    }
  }
  return { window: { since: sinceIso }, scanned: windowed.length, groups, review, surplus };
}

export type PruneReport = {
  dryRun: boolean;
  groupsExecuted: number;
  groupsSkipped: Array<{ name: string; reason: string }>;
  opsBySpace: Record<string, number>;
  published: boolean;
}

export async function executePrunePlan(plan: PrunePlan, opts: {
  dryRun?: boolean;
  maxDeletions?: number;
  signal?: AbortSignal;
}): Promise<PruneReport> {
  const { dryRun = true, maxDeletions = 50, signal } = opts;

  // Fuse: a scanner bug must not mass-delete.
  if (plan.surplus > maxDeletions) {
    throw new Error(`prune fuse tripped: plan wants ${plan.surplus} deletions > maxDeletions=${maxDeletions} — review before raising the cap`);
  }

  const opsBySpace = new Map<string, Op[]>();
  const skipped: Array<{ name: string; reason: string }> = [];
  let executed = 0;

  for (const g of plan.groups) {
    if (signal?.aborted) throw new Error('dedup.prune aborted — nothing published');
    // TOCTOU re-verification: the graph may have moved since find.
    const alive = await gql(`{ e: entities(filter: { id: { is: "${g.keep}" } }) { spaceIds } }`);
    if (!(alive?.e?.[0]?.spaceIds ?? []).length) { skipped.push({ name: g.name, reason: 'canonical missing' }); continue; }
    let ok = true;
    for (const twin of g.prune) {
      const t = await gql(`{ e: entities(filter: { id: { is: "${twin}" } }) { spaceIds } }`);
      if (!(t?.e?.[0]?.spaceIds ?? []).length) { ok = false; skipped.push({ name: g.name, reason: `twin ${twin.slice(0, 8)} already gone` }); break; }
      const inc = (await queryBacklinks(twin)).length;
      if (inc > 0) { ok = false; skipped.push({ name: g.name, reason: `twin ${twin.slice(0, 8)} gained ${inc} incoming refs` }); break; }
    }
    if (!ok) continue;
    for (const twin of g.prune) {
      const ops = await deleteEntity({
        entityId: twin, spaceId: g.spaceId,
        excludeFromOrphanCheck: [g.keep, g.show],
      });
      opsBySpace.set(g.spaceId, [...(opsBySpace.get(g.spaceId) ?? []), ...ops]);
    }
    executed++;
  }

  if (!dryRun) {
    for (const [space, ops] of opsBySpace) {
      if (!ops.length) continue;
      if (signal?.aborted) throw new Error('dedup.prune aborted — nothing published');
      await publishOps(ops, `Episode dedup sweep: prune ${executed} duplicate group(s)`, space);
    }
  }

  return {
    dryRun,
    groupsExecuted: executed,
    groupsSkipped: skipped,
    opsBySpace: Object.fromEntries([...opsBySpace.entries()].map(([s, o]) => [s, o.length])),
    published: !dryRun,
  };
}
