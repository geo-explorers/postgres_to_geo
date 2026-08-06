import { z } from "zod";
import { ConcurrencyLimitStrategy } from "@hatchet-dev/typescript-sdk/v1";
import { hatchet } from "./client.ts";
import { readHead, sameHead, isAnomalous } from "../geo_cache/stamp.ts";
import { listEditsSince, resolveDeltas, hits } from "../geo_cache/delta.ts";
import {
  listEntries,
  markStale,
  markAllStale,
  touchValidated,
  getMeta,
  setMeta,
  type HeadStamp,
} from "../geo_cache/store.ts";

/**
 * Background maintenance for the geo_cache store.
 *
 * cache.validate — the heart. One head read decides everything: unchanged ⇒
 * every entry stays valid (the common case, one indexed row); moved ⇒
 * delta-decode the new edits and mark only footprint-hit entries stale.
 * Anomalous movement (history rewrite / re-index) ⇒ global invalidation.
 *
 * Console/dashboard triggers deliver RAW JSON — zod defaults do NOT apply on
 * that path (learned the hard way on episodes.dedup.*), so inputs are treated
 * as untrusted at runtime too.
 */

const ValidateInput = z.object({
  dry_run: z.boolean().default(false),
});

const META_HEAD = "validated_head";

type ValidateIn = z.infer<typeof ValidateInput>;

export const cacheValidate = hatchet.task({
  name: "geo_cache.validate",
  retries: 0,
  executionTimeout: (process.env.CACHE_VALIDATE_TIMEOUT ?? "5m") as any,
  inputValidator: ValidateInput,
  on: { cron: "*/5 * * * *" },
  concurrency: {
    expression: "'geo-cache-validate'",
    maxRuns: 1,
    limitStrategy: ConcurrencyLimitStrategy.CANCEL_IN_PROGRESS,
  },
  fn: async (rawInput: ValidateIn, _ctx) => {
    // Console triggers bypass zod — treat as untrusted at runtime.
    const input = { dry_run: (rawInput as any)?.dry_run === true };
    const head = await readHead();
    const prev = (await getMeta<HeadStamp>(META_HEAD)) ?? null;

    if (prev && sameHead(prev, head)) {
      const entries = await listEntries();
      const validKeys = entries.filter((e) => e.status === "valid").map((e) => e.key);
      if (!input.dry_run) await touchValidated(validKeys);
      return { outcome: "head-unchanged", validated: validKeys.length, head };
    }

    if (prev && isAnomalous(prev, head)) {
      const n = input.dry_run ? -1 : await markAllStale(`anomalous head movement ${prev.totalCount}→${head.totalCount}`);
      if (!input.dry_run) await setMeta(META_HEAD, head);
      return { outcome: "anomaly-global-invalidate", staled: n, prev, head };
    }

    // First run ever: just record the head; entries carry their own stamps.
    if (!prev) {
      if (!input.dry_run) await setMeta(META_HEAD, head);
      return { outcome: "initialized", head };
    }

    const edits = await listEditsSince(prev);
    const deltas = await resolveDeltas(edits);
    const entries = await listEntries();
    const stale: string[] = [];
    const survived: string[] = [];
    for (const e of entries) {
      if (e.status !== "valid") continue;
      const hit = deltas.some((d) => hits(d, e.footprint as any));
      (hit ? stale : survived).push(e.key);
    }
    if (!input.dry_run) {
      await markStale(stale, `delta: ${deltas.length} edits since ${prev.createdAt}`);
      await touchValidated(survived);
      await setMeta(META_HEAD, head);
    }
    return {
      outcome: "delta-validated",
      edits: edits.length,
      decoded: deltas.filter((d) => d.decoded).length,
      staled: stale,
      survived: survived.length,
      head,
    };
  },
});

const ReportInput = z.object({});

export const cacheReport = hatchet.task({
  name: "geo_cache.report",
  retries: 0,
  executionTimeout: "2m" as any,
  inputValidator: ReportInput,
  on: { cron: "30 4 * * *" },
  fn: async (_input: z.infer<typeof ReportInput>, _ctx) => {
    const entries = await listEntries();
    const head = (await getMeta<HeadStamp>(META_HEAD)) ?? null;
    return {
      entries: entries.map((e: any) => ({
        key: String(e.key),
        bucket: String(e.bucket),
        status: String(e.status),
        bytes: e.bytes == null ? null : Number(e.bytes),
        fetchedAt: e.fetchedAt ? String(e.fetchedAt) : null,
        validatedAt: e.validatedAt ? String(e.validatedAt) : null,
        lastHitAt: e.lastHitAt ? String(e.lastHitAt) : null,
      })),
      validatedHead: head,
    };
  },
});
