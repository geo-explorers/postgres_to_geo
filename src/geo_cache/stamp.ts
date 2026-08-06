import { gql } from "../graph_ops/client.ts";
import type { HeadStamp } from "./store.ts";

/**
 * The graph's logical clock, read as ONE indexed row.
 *
 * Every mutation to the knowledge plane enters exclusively as an applied edit,
 * and every applied edit creates exactly one `edit_versions` row — so "has the
 * newest edit-version row changed?" is a sound O(1) validator for any cached
 * read (design doc: ~/Documents/geo-query-cache-design.md §2-3).
 *
 * Deliberately NOT max(blockNumber): replays/backfills apply old-block edits
 * later (observed 2026-07-20). The pair (createdAt, editId) tracks INDEXING
 * order, and totalCount catches out-of-order insertions and history rewrites:
 * a decreased count or a head that moved without count moving are anomalies
 * that trigger cheap global invalidation — wrong by being slow, never wrong
 * by being stale.
 */
export async function readHead(): Promise<HeadStamp> {
  const data: any = await gql(`{
    editVersionsConnection(orderBy: CREATED_AT_DESC, first: 1) {
      totalCount
      nodes { editId createdAt }
    }
  }`);
  const conn = data?.editVersionsConnection;
  const head = conn?.nodes?.[0];
  if (!head?.editId || !head?.createdAt || typeof conn?.totalCount !== "number") {
    throw new Error(`readHead: malformed response: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return { editId: head.editId, createdAt: head.createdAt, totalCount: conn.totalCount };
}

export function sameHead(a: HeadStamp, b: HeadStamp): boolean {
  return a.editId === b.editId && a.createdAt === b.createdAt && a.totalCount === b.totalCount;
}

/** True when the graph state cannot be explained by forward-only progress. */
export function isAnomalous(prev: HeadStamp, next: HeadStamp): boolean {
  if (next.totalCount < prev.totalCount) return true; // history rewrite / re-index
  if (next.totalCount === prev.totalCount && next.editId !== prev.editId) return true;
  return false;
}
