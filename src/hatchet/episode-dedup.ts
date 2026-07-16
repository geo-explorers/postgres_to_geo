import { z } from "zod";
import { ConcurrencyLimitStrategy, type Duration } from "@hatchet-dev/typescript-sdk/v1";
import { hatchet } from "./client.ts";
import {
  findDuplicateEpisodes,
  executePrunePlan,
} from "../graph_ops/episode_dedup.ts";

/**
 * episodes.dedup — reusable duplicate-episode sweep (find → prune).
 *
 * find:  read-only; windowed scan → global (name+show) resolution → PrunePlan
 *        with AUTO_PRUNE groups (same show + same airDate + zero incoming refs,
 *        keep = oldest) and a REVIEW list for everything else.
 * prune: deletions-only executor with TOCTOU re-verification per group, a
 *        max_deletions fuse, dry_run defaulting to TRUE, and cancellation
 *        checks before anything irreversible.
 * sweep: find + prune in one run — what the daily cron triggers (dry-run).
 *
 * All three share the publisher's concurrency group so a sweep can never run
 * concurrently with podcast.publish — the races that produced the duplicates
 * cannot involve the tool that removes them.
 */

const CONCURRENCY = {
  maxRuns: 1,
  limitStrategy: ConcurrencyLimitStrategy.GROUP_ROUND_ROBIN,
  expression: "'podcast-publish'", // same global queue as podcast.publish
};
const EXECUTION_TIMEOUT = (process.env.DEDUP_EXECUTION_TIMEOUT ?? "60m") as Duration;
const SCHEDULE_TIMEOUT = (process.env.DEDUP_SCHEDULE_TIMEOUT ?? "420m") as Duration; // may queue behind a long publish

const FindInput = z.object({
  since: z.string().datetime().optional(),
  window_hours: z.number().int().min(1).max(24 * 365).default(48),
});

// Full structural schema — the SDK converts inputValidator to JSON Schema at
// worker registration, so z.custom() is not allowed (it crashed the worker).
const PruneGroupSchema = z.object({
  name: z.string(),
  show: z.string(),
  keep: z.string(),
  prune: z.array(z.string()),
  spaceId: z.string(),
});
const PrunePlanSchema = z.object({
  window: z.object({ since: z.string(), until: z.string().optional() }),
  scanned: z.number(),
  groups: z.array(PruneGroupSchema),
  review: z.array(z.string()),
  surplus: z.number(),
});
const PruneInput = z.object({
  plan: PrunePlanSchema,
  dry_run: z.boolean().default(true),
  max_deletions: z.number().int().min(1).max(500).default(50),
});

const SweepInput = z.object({
  window_hours: z.number().int().min(1).max(24 * 365).default(48),
  dry_run: z.boolean().default(true),
  max_deletions: z.number().int().min(1).max(500).default(50),
});

type FindIn = z.infer<typeof FindInput>;
type PruneIn = z.infer<typeof PruneInput>;
type SweepIn = z.infer<typeof SweepInput>;

// Console/dashboard triggers deliver RAW JSON — zod defaults and validation do
// NOT apply on that path (verified: '{}' reached the fn with window_hours
// undefined and crashed Date.toISOString). Treat input as untrusted.
function sinceFrom(input: { since?: string; window_hours?: number }): string {
  if (input.since) {
    const d = new Date(input.since);
    if (Number.isNaN(d.getTime())) throw new Error(`invalid 'since' date: ${JSON.stringify(input.since)}`);
    return d.toISOString();
  }
  const hours = Number(input.window_hours);
  const h = Number.isFinite(hours) && hours > 0 ? hours : 48;
  return new Date(Date.now() - h * 3600_000).toISOString();
}
function boundedMax(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 500 ? Math.floor(n) : 50;
}

export const episodeDedupFind = hatchet.task({
  name: "episodes.dedup.find",
  retries: 0,
  executionTimeout: EXECUTION_TIMEOUT,
  scheduleTimeout: SCHEDULE_TIMEOUT,
  inputValidator: FindInput,
  concurrency: CONCURRENCY,
  fn: async (input: FindIn, ctx) => {
    return await findDuplicateEpisodes({
      sinceIso: sinceFrom(input),
      signal: ctx.abortController.signal,
    });
  },
});

export const episodeDedupPrune = hatchet.task({
  name: "episodes.dedup.prune",
  retries: 0,
  executionTimeout: EXECUTION_TIMEOUT,
  scheduleTimeout: SCHEDULE_TIMEOUT,
  inputValidator: PruneInput,
  concurrency: CONCURRENCY,
  fn: async (input: PruneIn, ctx) => {
    if (!input?.plan || !Array.isArray(input.plan.groups)) {
      throw new Error("episodes.dedup.prune requires a 'plan' (the output of episodes.dedup.find)");
    }
    return await executePrunePlan(input.plan, {
      dryRun: input.dry_run ?? true,
      maxDeletions: boundedMax(input.max_deletions),
      signal: ctx.abortController.signal,
    });
  },
});

export const episodeDedupSweep = hatchet.task({
  name: "episodes.dedup.sweep",
  retries: 0,
  executionTimeout: EXECUTION_TIMEOUT,
  scheduleTimeout: SCHEDULE_TIMEOUT,
  inputValidator: SweepInput,
  concurrency: CONCURRENCY,
  // Daily quiet-hour sweep. REPORTING ONLY by default: cron input is the zod
  // default (dry_run: true) — flipping to real deletions is a deliberate,
  // manual trigger until the report history earns automation.
  on: { cron: "0 4 * * *" },
  fn: async (input: SweepIn, ctx) => {
    const signal = ctx.abortController.signal;
    const plan = await findDuplicateEpisodes({ sinceIso: sinceFrom(input), signal });
    const report = await executePrunePlan(plan, {
      dryRun: input.dry_run ?? true,
      maxDeletions: boundedMax(input.max_deletions),
      signal,
    });
    return { plan, report };
  },
});
