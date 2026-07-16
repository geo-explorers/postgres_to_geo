// ─── graph_ops/delete_entity ─────────────────────────────────────────────────
// Ported from geo-merge-topics src/entity_ops.ts (battle-tested through the
// crypto migration M1–M3 batches). Deviations from the original:
//   - returns ops only; the CALLER publishes (composable in Hatchet tasks)
//   - no opsBatch/caches plumbing (callers here operate on small entity sets)
// Semantics preserved: space-scoped deletion (values unset + outgoing/incoming
// relations removed in ONE space), voting data never touched (Score values are
// not unset; Rank Votes relations are not deleted), optional recursive orphan
// cleanup of relation targets that lose their last external reference.

import { Graph, type Op } from '@geoprotocol/geo-sdk';
import { gql } from '../publish.ts';
import { EXCLUDED_RELATION_TYPE_IDS, EXCLUDED_VALUE_PROPERTY_IDS } from './constants.ts';

export type RelationRecord = {
  id: string;
  typeId: string;
  toEntityId: string;
  fromEntityId: string;
  spaceId: string;
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

export async function queryEntityData(entityId: string, spaceId: string): Promise<{
  values: Array<{ propertyId: string }>;
  relations: RelationRecord[];
}> {
  const d = await gql(`{
    values(filter: { entityId: { is: "${entityId}" } spaceId: { is: "${spaceId}" } }) { propertyId }
    relations(filter: { fromEntityId: { is: "${entityId}" } spaceId: { is: "${spaceId}" } }, first: 1000) {
      id typeId toEntityId fromEntityId spaceId
    }
  }`);
  return { values: d?.values ?? [], relations: d?.relations ?? [] };
}

export async function queryBacklinks(entityId: string, spaceId?: string): Promise<RelationRecord[]> {
  const d = await gql(`{
    relations(filter: { toEntityId: { is: "${entityId}" }${spaceId ? ` spaceId: { is: "${spaceId}" }` : ''} }, first: 1000) {
      id typeId toEntityId fromEntityId spaceId
    }
  }`);
  return d?.relations ?? [];
}

export interface DeleteEntityOptions {
  entityId: string;
  spaceId: string;
  /** Keep incoming relations (moves do this so references stay valid). Default false. */
  keepIncomingRelations?: boolean;
  /** Skip the recursive orphan cleanup of relation targets. Default false. */
  skipOrphanCleanup?: boolean;
  /** Entities never considered orphans (e.g. the canonical in a merge). */
  excludeFromOrphanCheck?: string[];
  /** Internal: entities already being deleted in this cascade (cycle guard). */
  deletingIds?: Set<string>;
}

/** Generate deletion ops for one entity's residency in one space. */
export async function deleteEntity(options: DeleteEntityOptions): Promise<Op[]> {
  const {
    entityId, spaceId,
    keepIncomingRelations = false,
    skipOrphanCleanup = false,
    excludeFromOrphanCheck = [],
  } = options;
  const deletingIds = options.deletingIds ?? new Set<string>();
  deletingIds.add(entityId);
  const isBeingDeleted = (id: string) => deletingIds.has(id);

  const { values, relations } = await queryEntityData(entityId, spaceId);
  const ops: Op[] = [];

  // Unset all value properties — except voting data, which is never ours to touch.
  const propertyIds = [...new Set(values.map(v => v.propertyId))].filter(
    p => !EXCLUDED_VALUE_PROPERTY_IDS.has(p),
  );
  if (propertyIds.length > 0) {
    ops.push(...Graph.updateEntity({ id: entityId, unset: propertyIds.map(p => ({ property: p })) }).ops);
  }

  // Delete outgoing relations (votes never touched).
  const toEntityIds: string[] = [];
  for (const r of relations) {
    if (EXCLUDED_RELATION_TYPE_IDS.has(r.typeId)) continue;
    ops.push(...Graph.deleteRelation({ id: r.id }).ops);
    toEntityIds.push(r.toEntityId);
  }

  // Delete incoming relations unless the caller preserves references (move-style).
  if (!keepIncomingRelations) {
    for (const r of await queryBacklinks(entityId, spaceId)) {
      if (EXCLUDED_RELATION_TYPE_IDS.has(r.typeId)) continue;
      ops.push(...Graph.deleteRelation({ id: r.id }).ops);
    }
  }

  // Recursive orphan cleanup: relation targets that lose their last external
  // reference die with the entity (e.g. a pruned episode's claim subtree).
  if (!skipOrphanCleanup && toEntityIds.length > 0) {
    const uniqueToIds = [...new Set(toEntityIds)].filter(
      id => !excludeFromOrphanCheck.includes(id) && !isBeingDeleted(id),
    );
    const checks = await pMap(uniqueToIds, async toId => {
      const backlinks = await queryBacklinks(toId);
      const external = backlinks.filter(bl => !isBeingDeleted(bl.fromEntityId));
      return { toId, isOrphan: external.length === 0 };
    });
    const orphanIds = checks.filter(c => c.isOrphan && !deletingIds.has(c.toId)).map(c => c.toId);
    if (orphanIds.length > 0) {
      for (const id of orphanIds) deletingIds.add(id);
      const visited = [...excludeFromOrphanCheck, entityId, ...orphanIds];
      const results = await pMap(orphanIds, toId =>
        deleteEntity({
          entityId: toId, spaceId,
          skipOrphanCleanup: false,
          excludeFromOrphanCheck: visited,
          deletingIds,
        }),
      );
      for (const r of results) ops.push(...r);
    }
  }

  return ops;
}
