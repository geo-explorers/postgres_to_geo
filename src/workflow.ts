import { SPACE_IDS } from './constants.ts';
import { type Op } from '@graphprotocol/grc-20';
import PostgreSQLClient from "./postgres-client.ts";
import {
  episodeBreakdown,
  read_in_tables,
  loadGeoEntities
} from './setup_ontology.ts';
import {
  printOps,
  type Entity,
  buildEntityCached,
  publishOps_w_spaces
} from './functions.ts';
import { processEntity } from '../post_entity.ts';
import { classifyEpisodeSpace } from './space_classifier.ts';

export interface WorkflowParams {
  podcast_name: string[];
  limit: number;
  num_episodes: number;
  date_filter: string;
  /** Restrict processing to these PG episode ids (update flows). */
  episode_ids?: number[];
}

export interface WorkflowResult {
  episodes_processed: number;
  ops_created: number;
  duration_ms: number;
}

/**
 * Core workflow function that processes podcast episodes and publishes to Geo protocol
 * Extracted from main_entity.ts for reusability
 */
export async function processPodcastWorkflow(
  params: WorkflowParams,
  opts: { signal?: AbortSignal } = {},
): Promise<WorkflowResult> {
  const { signal } = opts;
  // Zombie guard: once Hatchet cancels/times out this run, the signal aborts.
  // Checked after the corpus sweep, per episode, and immediately before publish —
  // a dead run must stop consuming and must NEVER publish.
  const assertAlive = (where: string) => {
    if (signal?.aborted) throw new Error(`Run cancelled/timed out — aborting at ${where} (nothing published)`);
  };
  const startTime = Date.now();
  const pgClient = new PostgreSQLClient();

  const ops: Array<Op> = [];
  const processingCache: Record<string, Entity> = {};
  const imageCache: Record<string, Entity> = {};
  const offset = 0;
  // Create a fresh entity cache for this request to avoid stale data from previous API calls
  const localEntityCache: Record<string, Record<string, any>> = {};

  try {
    console.log('Loading geo entities...');
    const { geoEntities, scoringContext } = await loadGeoEntities(undefined, signal);
    assertAlive('after corpus load');

    console.log('Reading tables from PostgreSQL...');
    const tables = await read_in_tables({
      pgClient: pgClient,
      offset: offset,
      limit: params.limit,
      podcast_name: params.podcast_name,
      num_episodes: params.num_episodes,
      date_filter: params.date_filter,
      episode_ids: params.episode_ids
    });

    console.log(`Found ${tables.episodes.length} episodes`);
    console.log(`Found ${tables.claims.length} claims`);

    console.log('Formatting episodes...');
    const formattedEpisodes = tables.episodes.map(p =>
      buildEntityCached(p, episodeBreakdown, classifyEpisodeSpace({ episode: p, tables }), tables, geoEntities, localEntityCache, scoringContext)
    );

    console.log('Formatting done. Processing entities...');

    for (const episode of formattedEpisodes) {
      assertAlive('episode loop');
      const addOps = await processEntity({
        currentOps: ops,
        processingCache: processingCache,
        imageCache: imageCache,
        entity: episode
      });
      ops.push(...addOps.ops);
    }

    console.log(`Generated ${ops.length} ops`);

    console.log('Publishing ops...');
    assertAlive('pre-publish');
    await publishOps_w_spaces(ops);

    const duration = Date.now() - startTime;

    return {
      episodes_processed: formattedEpisodes.length,
      ops_created: ops.length,
      duration_ms: duration
    };
  } catch (error) {
    console.error('Workflow error:', error);
    throw error;
  } finally {
    // Always close the database connection
    await pgClient.close();
    console.log('PostgreSQL connection closed');
  }
}
