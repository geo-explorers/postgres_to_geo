// ─── graph_ops/client ────────────────────────────────────────────────────────
// Retrying, abort-aware wrapper over the worker's gql. Graph-hygiene sweeps
// make thousands of small queries (orphan checks especially); a single
// transient 5xx must not kill a run — but an abort must (zombie rule).

import { gql as rawGql } from '../publish.ts';

export async function gql(query: string, variables?: Record<string, any>, signal?: AbortSignal): Promise<any> {
  const MAX = 8;
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw new Error('gql aborted: run was cancelled or timed out');
    try {
      return await rawGql(query, variables);
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      const transient = /API error: 5\d\d|fetch failed|ECONNRESET|ETIMEDOUT|socket|network/i.test(msg);
      if (!transient || attempt >= MAX - 1) throw err;
      await new Promise(r => setTimeout(r, Math.min(1000 * 2 ** attempt, 60000)));
    }
  }
}
