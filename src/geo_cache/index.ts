import { getEntry, putEntry, type Bucket, type Footprint } from "./store.ts";
import { readHead, sameHead } from "./stamp.ts";

/**
 * Consumer API: cache-or-fetch with the edit-head as the truth clock.
 *
 * The stamp is read BEFORE the fetch: edits landing during a long fetch are
 * newer than the stamp, so the validator cron (or the inline re-check below)
 * flags the entry instead of a torn result surviving silently.
 *
 * `maxValidatedAgeMs`: a valid entry whose last validation is older than this
 * gets one inline head comparison before being trusted — so correctness does
 * not depend on the cache.validate cron being alive (defense in depth; the
 * cron makes hits cheap, this makes them safe).
 */
export interface GetOrFetchParams<T> {
  key: string;
  bucket?: Bucket;
  footprint: Footprint;
  fetch: () => Promise<T>;
  /** Attach exact member ids after a fetch for per-entity invalidation. */
  footprintFromResult?: (result: T) => Partial<Footprint>;
  maxValidatedAgeMs?: number;
}

export interface GetOrFetchResult<T> {
  value: T;
  source: "cache" | "fetch";
}

export async function getOrFetch<T>(params: GetOrFetchParams<T>): Promise<GetOrFetchResult<T>> {
  const maxAge = params.maxValidatedAgeMs ?? 15 * 60_000;
  const entry = await getEntry<T>(params.key);

  if (entry && entry.status === "valid") {
    const age = Date.now() - new Date(entry.validatedAt).getTime();
    if (age <= maxAge) {
      return { value: entry.blob, source: "cache" };
    }
    // Validation is stale — one cheap inline head check decides.
    try {
      const head = await readHead();
      if (sameHead(head, entry.stamp)) {
        const { touchValidated } = await import("./store.ts");
        await touchValidated([params.key]);
        return { value: entry.blob, source: "cache" };
      }
    } catch (err) {
      // Head unreadable: fail toward refetch, never toward trusting stale.
      console.warn(`geo_cache: inline head check failed for ${params.key}:`, err);
    }
  }

  const stampBefore = await readHead();
  const value = await params.fetch();
  const extra = params.footprintFromResult ? params.footprintFromResult(value) : {};
  await putEntry({
    key: params.key,
    bucket: params.bucket ?? "standing",
    footprint: { ...params.footprint, ...extra },
    stamp: stampBefore,
    blob: value,
  });
  return { value, source: "fetch" };
}

export { readHead } from "./stamp.ts";
export { listEntries, markAllStale } from "./store.ts";
