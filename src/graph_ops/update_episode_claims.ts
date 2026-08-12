// ─── graph_ops/update_episode_claims ─────────────────────────────────────────
// Claim surgery for one episode: find the episode entity on the graph, collect
// its notable_claims subtree (claim entities + the relation edge-entities), and
// produce deletion ops for all of it. The CALLER publishes the ops and then
// re-publishes the episode through the standard export path (workflow.ts with
// episode_ids), which recreates the claims with the production ontology.
//
// Deletion reuses graph_ops/delete_entity (battle-tested): per claim it unsets
// values, removes both relation directions (including the episode→claim edge),
// and orphan-cleans targets that lose their last reference — shared topics
// survive because they keep external backlinks.

import { type Op } from '@geoprotocol/geo-sdk';
import { gql } from './client.ts';
import { deleteEntity } from './delete_entity.ts';
import { propertyToIdMap, typeToIdMap } from '../constants.ts';

const NOTABLE_CLAIMS_TYPE_ID = propertyToIdMap['notable_claims'];
const EPISODE_TYPE_ID = typeToIdMap['episode'];

export interface EpisodeClaimRelation {
  id: string;
  entityId: string | null;
  toEntityId: string;
  spaceId: string;
}

export interface EpisodeResolution {
  episodeEntityId: string | null;
  /** 0 = not published yet (nothing to delete), 2+ = ambiguous (needs dedup). */
  matches: number;
}

/** Resolve an episode's graph entity by exact name + Episode type. */
export async function resolveEpisodeEntity(name: string): Promise<EpisodeResolution> {
  const escaped = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const d = await gql(`{
    entities(
      filter: {
        name: { is: "${escaped}" }
        typeIds: { anyEqualTo: "${EPISODE_TYPE_ID}" }
      }
      first: 5
    ) { id }
  }`);
  const ids: string[] = (d?.entities ?? []).map((e: any) => e.id);
  return { episodeEntityId: ids.length === 1 ? ids[0] : null, matches: ids.length };
}

/** All notable_claims relations from an episode entity (any space). */
export async function queryEpisodeClaimRelations(
  episodeEntityId: string
): Promise<EpisodeClaimRelation[]> {
  const d = await gql(`{
    relations(
      filter: {
        fromEntityId: { is: "${episodeEntityId}" }
        typeId: { is: "${NOTABLE_CLAIMS_TYPE_ID}" }
      }
      first: 1000
    ) { id entityId toEntityId spaceId }
  }`);
  return d?.relations ?? [];
}

export interface ClaimDeletionPlan {
  /** Deletion ops grouped by the space each claim resides in. Ops carry no
   *  space themselves — the caller must publish each group with
   *  `publishOps(ops, editName, spaceId)` (the graph_ops convention; the
   *  export pipeline's publishOps_w_spaces only routes its own space-tagged
   *  op format and silently no-ops on plain SDK ops). */
  opsBySpace: Record<string, Op[]>;
  claimsDeleted: number;
}

/**
 * Deletion ops for every existing claim of an episode.
 *
 * Per relation: delete the claim entity (removes the episode→claim edge via
 * its incoming-relations pass, plus the claim's own topics edges), then the
 * relation's edge-entity (typed claim_relation, carries per-edge topics).
 * The episode itself is excluded from orphan checks so it can never be
 * swept up by the cascade.
 */
export async function buildClaimDeletionOps(
  episodeEntityId: string,
  relations: EpisodeClaimRelation[]
): Promise<ClaimDeletionPlan> {
  const opsBySpace: Record<string, Op[]> = {};
  const deletingIds = new Set<string>();
  let claimsDeleted = 0;
  const push = (spaceId: string, ops: Op[]) => {
    (opsBySpace[spaceId] ??= []).push(...ops);
  };

  for (const rel of relations) {
    push(
      rel.spaceId,
      await deleteEntity({
        entityId: rel.toEntityId,
        spaceId: rel.spaceId,
        excludeFromOrphanCheck: [episodeEntityId],
        deletingIds,
      })
    );
    claimsDeleted++;

    if (rel.entityId && !deletingIds.has(rel.entityId)) {
      push(
        rel.spaceId,
        await deleteEntity({
          entityId: rel.entityId,
          spaceId: rel.spaceId,
          excludeFromOrphanCheck: [episodeEntityId],
          deletingIds,
        })
      );
    }
  }

  return { opsBySpace, claimsDeleted };
}
