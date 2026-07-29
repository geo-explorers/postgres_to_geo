// ─── graph_ops/dual_residency_fold ───────────────────────────────────────────
// F3 of the dual-space-residency fix (see PR #30 / investigation 2026-07-28):
// legacy entities resident in BOTH Podcasts and Crypto fold down to the side
// matching their show's classification — crypto-show content keeps Crypto and
// drops the redundant Podcasts copies; everything else keeps Podcasts and
// drops Crypto (the Empire-era direction). Values and outgoing relations of
// the dropped side are deleted; INCOMING relations are kept (move semantics —
// cross-space references resolve by id, the M3-fold doctrine), and orphan
// cleanup is skipped (every relation target of a dual entity keeps its
// kept-side copy, so nothing orphans; skipping avoids walking shared subtrees).
//
// House conventions: findDualResidencyFold() is READ-ONLY and returns a plan;
// executeDualFold() defaults to dryRun, enforces a max-entities fuse, TOCTOU-
// re-verifies each entity is still dual before folding, and the caller's
// publish happens per batch per space.

import type { Op } from '@geoprotocol/geo-sdk';
import { publishOps } from '../publish.ts';
import { gql } from './client.ts';
import { deleteEntity } from './delete_entity.ts';
import { CRYPTO_PODCAST_NAMES } from '../space_classifier.ts';
import { normalizeName } from '../functions.ts';

const POD = 'b5a31f8182b042437ede0f84ee02f104';
const CRY = 'c9f267dcb0d270718c2a3c45a64afd32';
const TYPES_PROP = '8f151ba4de204e3c9cb499ddf96f48f1';
const TYPE_EPISODE = '972d201ad78045689e01543f67b26bee';
const TYPE_CLAIM = '96f859efa1ca4b229372c86ad58b694b';
const PROP_PODCAST = 'f1873bbc381f4604abad76fed4f6d73f';
const REL_NOTABLE_CLAIMS = 'e1371bcda7044396adb7ea7ecc8fe3d4';

export type FoldEntry = {
  id: string;
  kind: 'episode' | 'claim';
  name: string;
  show: string;          // resolved show name ('' when undeterminable)
  keepSpace: string;
  dropSpace: string;
};

export type FoldPlan = {
  generatedAt: string;
  scanned: { episodes: number; claims: number };
  entries: FoldEntry[];
  undeterminable: Array<{ id: string; kind: string; reason: string }>;
};

async function pMap<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency = 8): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker()));
  return results;
}

async function scanType(typeId: string, signal?: AbortSignal): Promise<Array<{ id: string; name: string; spaceIds: string[] }>> {
  const out: Array<{ id: string; name: string; spaceIds: string[] }> = [];
  let after = '';
  for (let page = 0; page < 600; page++) {
    if (signal?.aborted) throw new Error('fold scan aborted');
    const d = await gql(`{
      entitiesConnection(filter: { relations: { some: { typeId: { is: "${TYPES_PROP}" } toEntityId: { in: ["${typeId}"] } } } },
        first: 500${after ? `, after: "${after}"` : ''}) {
        pageInfo { hasNextPage endCursor }
        nodes { id name spaceIds }
      }
    }`);
    const c = d?.entitiesConnection;
    for (const n of c?.nodes ?? []) out.push({ id: n.id, name: n.name ?? '', spaceIds: n.spaceIds ?? [] });
    if (!c?.pageInfo?.hasNextPage) break;
    after = c.pageInfo.endCursor;
  }
  return out;
}

const isDual = (spaceIds: string[]) => spaceIds.includes(POD) && spaceIds.includes(CRY);

/** Show name for an episode (via its podcast relation, any space). */
async function episodeShow(episodeId: string): Promise<string | null> {
  const d = await gql(`{
    relations(filter: { fromEntityId: { is: "${episodeId}" } typeId: { is: "${PROP_PODCAST}" } }, first: 5) {
      toEntity { name }
    }
  }`);
  return d?.relations?.[0]?.toEntity?.name ?? null;
}

/** Episode owning a claim (via the notable-claims backlink, any space). */
async function claimEpisode(claimId: string): Promise<string | null> {
  const d = await gql(`{
    relations(filter: { toEntityId: { is: "${claimId}" } typeId: { is: "${REL_NOTABLE_CLAIMS}" } }, first: 5) {
      fromEntityId
    }
  }`);
  return d?.relations?.[0]?.fromEntityId ?? null;
}

const keepSideForShow = (showName: string): { keep: string; drop: string } => {
  const key = normalizeName(showName);
  return key && CRYPTO_PODCAST_NAMES.has(key)
    ? { keep: CRY, drop: POD }
    : { keep: POD, drop: CRY };
};

/** READ-ONLY: scan episodes + claims, classify each dual entity's fold side. */
export async function findDualResidencyFold(signal?: AbortSignal): Promise<FoldPlan> {
  const episodes = await scanType(TYPE_EPISODE, signal);
  const claims = await scanType(TYPE_CLAIM, signal);
  const dualEpisodes = episodes.filter(e => isDual(e.spaceIds));
  const dualClaims = claims.filter(c => isDual(c.spaceIds));

  const entries: FoldEntry[] = [];
  const undeterminable: FoldPlan['undeterminable'] = [];
  const showByEpisode = new Map<string, string>();

  await pMap(dualEpisodes, async e => {
    const show = await episodeShow(e.id);
    if (!show) { undeterminable.push({ id: e.id, kind: 'episode', reason: 'no podcast relation' }); return; }
    showByEpisode.set(e.id, show);
    const { keep, drop } = keepSideForShow(show);
    entries.push({ id: e.id, kind: 'episode', name: e.name.slice(0, 80), show, keepSpace: keep, dropSpace: drop });
  });

  await pMap(dualClaims, async c => {
    const epId = await claimEpisode(c.id);
    if (!epId) { undeterminable.push({ id: c.id, kind: 'claim', reason: 'no episode backlink (news claim or orphan)' }); return; }
    const show = showByEpisode.get(epId) ?? await episodeShow(epId);
    if (!show) { undeterminable.push({ id: c.id, kind: 'claim', reason: 'episode has no podcast relation' }); return; }
    const { keep, drop } = keepSideForShow(show);
    entries.push({ id: c.id, kind: 'claim', name: c.name.slice(0, 80), show, keepSpace: keep, dropSpace: drop });
  });

  return {
    generatedAt: new Date().toISOString(),
    scanned: { episodes: episodes.length, claims: claims.length },
    entries,
    undeterminable,
  };
}

export type FoldReport = {
  dryRun: boolean;
  folded: number;
  skipped: Array<{ id: string; reason: string }>;
  opsBySpace: Record<string, number>;
  published: boolean;
};

/** Deletions-only fold execution. dryRun default TRUE; maxEntities fuse;
 *  TOCTOU re-verification; publishes per batch per drop-space. */
export async function executeDualFold(plan: FoldPlan, opts: {
  dryRun?: boolean;
  maxEntities?: number;
  batchSize?: number;
  signal?: AbortSignal;
}): Promise<FoldReport> {
  const { dryRun = true, maxEntities = 100, batchSize = 25, signal } = opts;
  if (plan.entries.length > maxEntities) {
    throw new Error(`fold fuse tripped: plan has ${plan.entries.length} entities > maxEntities=${maxEntities} — run in slices (--max) after review`);
  }

  const report: FoldReport = { dryRun, folded: 0, skipped: [], opsBySpace: {}, published: false };

  for (let i = 0; i < plan.entries.length; i += batchSize) {
    const batch = plan.entries.slice(i, i + batchSize);
    const opsBySpace = new Map<string, Op[]>();

    for (const entry of batch) {
      if (signal?.aborted) throw new Error('fold aborted — nothing further published');
      // TOCTOU: the entity must still be dual-resident right now.
      const d = await gql(`{ e: entities(filter: { id: { is: "${entry.id}" } }) { spaceIds } }`);
      const spaceIds: string[] = d?.e?.[0]?.spaceIds ?? [];
      if (!isDual(spaceIds)) { report.skipped.push({ id: entry.id, reason: 'no longer dual-resident' }); continue; }

      const ops = await deleteEntity({
        entityId: entry.id,
        spaceId: entry.dropSpace,
        keepIncomingRelations: true,   // move semantics: references stay valid cross-space
        skipOrphanCleanup: true,       // dual targets keep their kept-side copies; never cascade
      });
      opsBySpace.set(entry.dropSpace, [...(opsBySpace.get(entry.dropSpace) ?? []), ...ops]);
      report.folded += 1;
    }

    for (const [space, ops] of opsBySpace) {
      if (!ops.length) continue;
      report.opsBySpace[space] = (report.opsBySpace[space] ?? 0) + ops.length;
      if (!dryRun) {
        if (signal?.aborted) throw new Error('fold aborted — nothing further published');
        await publishOps(ops, `Dual-residency fold: drop redundant ${space === POD ? 'Podcasts' : 'Crypto'} copies (${batch.length} entities)`, space);
      }
    }
  }

  report.published = !dryRun;
  return report;
}
