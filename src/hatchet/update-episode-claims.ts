import { z } from "zod";
import { ConcurrencyLimitStrategy } from "@hatchet-dev/typescript-sdk/v1";
import type { Duration } from "@hatchet-dev/typescript-sdk/v1";
import { hatchet } from "./client.ts";
import PostgreSQLClient, { DB_ID, TABLES } from "../postgres-client.ts";
import { publishOps_w_spaces } from "../functions.ts";
import { processPodcastWorkflow } from "../workflow.ts";
import {
  buildClaimDeletionOps,
  queryEpisodeClaimRelations,
  resolveEpisodeEntity,
} from "../graph_ops/update_episode_claims.ts";

/**
 * podcast.update_episode_claims — replace episodes' on-chain claims.
 *
 * For each batch of episodes:
 *   1. DELETE phase: resolve each episode's graph entity (exact name + Episode
 *      type), collect its notable_claims subtree, publish deletion ops.
 *   2. REBUILD phase: run the standard export workflow restricted to the batch
 *      (read_in_tables episode_ids filter) — claims are recreated from the
 *      CURRENT Postgres state with the production ontology, byte-identical to
 *      a normal publish. Requires the caller to have refreshed Postgres first
 *      (pg-migrations reextract flow).
 *
 * Episodes that resolve to 0 graph entities skip deletion (nothing published
 * yet) but still rebuild; 2+ matches (duplicates) are reported as failures —
 * run episode dedup first for those.
 *
 * Shares the 'podcast-publish' concurrency group with podcast.publish and the
 * dedup tasks: at most one publisher runs at a time, so no wallet/corpus races.
 * retries=0: the delete phase is not idempotent-safe to blind-retry (a re-run
 * after partial publish is safe, but should be operator-initiated).
 */
const UpdateEpisodeClaimsInput = z.object({
  episode_ids: z.array(z.number().int().positive()).min(1),
  batch_size: z.number().int().min(1).max(50).default(10),
});

type UpdateInput = z.infer<typeof UpdateEpisodeClaimsInput>;

export interface UpdateEpisodeClaimsResult {
  episodes_updated: number;
  episodes_failed: number;
  claims_deleted: number;
  ops_created: number;
  errors: string[];
  duration_ms: number;
}
// Structural clone that satisfies the SDK's JsonObject constraint.
type UpdateResult = { [K in keyof UpdateEpisodeClaimsResult]: UpdateEpisodeClaimsResult[K] };

const EXECUTION_TIMEOUT = (process.env.UPDATE_CLAIMS_EXECUTION_TIMEOUT ?? "120m") as Duration;
const SCHEDULE_TIMEOUT = (process.env.UPDATE_CLAIMS_SCHEDULE_TIMEOUT ?? "480m") as Duration;

interface EpisodeRow {
  id: string;
  name: string;
  podcast_name: string;
}

export const updateEpisodeClaims = hatchet.task({
  name: "podcast.update_episode_claims",
  retries: 0,
  executionTimeout: EXECUTION_TIMEOUT,
  scheduleTimeout: SCHEDULE_TIMEOUT,
  inputValidator: UpdateEpisodeClaimsInput,
  concurrency: {
    maxRuns: 1,
    limitStrategy: ConcurrencyLimitStrategy.GROUP_ROUND_ROBIN,
    expression: "'podcast-publish'", // same global queue as podcast.publish / dedup
  },
  fn: async (input: UpdateInput, ctx): Promise<UpdateResult> => {
    const startTime = Date.now();
    const signal = ctx.abortController.signal;
    const result: UpdateEpisodeClaimsResult = {
      episodes_updated: 0,
      episodes_failed: 0,
      claims_deleted: 0,
      ops_created: 0,
      errors: [],
      duration_ms: 0,
    };

    const pgClient = new PostgreSQLClient();
    try {
      const rows = await pgClient.query<EpisodeRow>(`
        SELECT e.id, e.name, p.name AS podcast_name
        FROM "${DB_ID}".${TABLES.EPISODES} e
        JOIN "${DB_ID}".${TABLES.PODCASTS} p ON p.id = e.podcast_id
        WHERE e.id IN (${input.episode_ids.map((id) => Number(id)).join(",")})
      `);
      const missing = input.episode_ids.filter(
        (id) => !rows.some((r) => Number(r.id) === id)
      );
      for (const id of missing) {
        result.episodes_failed++;
        result.errors.push(`episode ${id}: not found in Postgres`);
      }

      for (let i = 0; i < rows.length; i += input.batch_size) {
        if (signal.aborted) throw new Error("cancelled");
        const batch = rows.slice(i, i + input.batch_size);

        // ── Phase 1: delete existing on-chain claims ──
        const deleteOps = [];
        const rebuild: EpisodeRow[] = [];
        for (const episode of batch) {
          try {
            const { episodeEntityId, matches } = await resolveEpisodeEntity(episode.name);
            if (matches > 1) {
              result.episodes_failed++;
              result.errors.push(
                `episode ${episode.id}: ${matches} graph entities named "${episode.name}" — run episode dedup first`
              );
              continue;
            }
            if (episodeEntityId) {
              const relations = await queryEpisodeClaimRelations(episodeEntityId);
              const plan = await buildClaimDeletionOps(episodeEntityId, relations);
              deleteOps.push(...plan.ops);
              result.claims_deleted += plan.claimsDeleted;
            }
            rebuild.push(episode);
          } catch (err) {
            result.episodes_failed++;
            result.errors.push(
              `episode ${episode.id}: delete-phase failed — ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        if (signal.aborted) throw new Error("cancelled");
        if (deleteOps.length > 0) {
          console.log(`Publishing ${deleteOps.length} deletion ops for batch of ${batch.length}...`);
          await publishOps_w_spaces(deleteOps);
          result.ops_created += deleteOps.length;
        }

        // ── Phase 2: rebuild via the standard export path ──
        if (rebuild.length > 0) {
          const stats = await processPodcastWorkflow(
            {
              podcast_name: [...new Set(rebuild.map((e) => e.podcast_name))],
              episode_ids: rebuild.map((e) => Number(e.id)),
              num_episodes: 1000000,
              limit: 1000000,
              date_filter: "",
            },
            { signal }
          );
          result.ops_created += stats.ops_created;
          result.episodes_updated += stats.episodes_processed;
        }
      }
    } finally {
      await pgClient.close();
    }

    result.duration_ms = Date.now() - startTime;
    return result as UpdateResult;
  },
});
