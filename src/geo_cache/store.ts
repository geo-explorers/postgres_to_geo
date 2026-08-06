import PostgreSQLClient from "../postgres-client.ts";

/**
 * Postgres-backed store for cached Geo query results.
 *
 * Lives in its own `geo_cache` schema, self-bootstrapped by the worker on
 * first use (same pattern as Hatchet managing its own tables): cache state is
 * worker infrastructure, not domain data, so it deliberately stays out of the
 * pg-migrations-managed schemas.
 *
 * An entry is valid iff `status = 'valid'` AND its stamp still matches the
 * graph's edit head. The stamp is taken BEFORE the fetch that produced the
 * blob: any edit that lands during a long multi-page fetch is then newer than
 * the stamp, so the validator re-checks it — torn reads self-heal instead of
 * silently persisting (loadGeoEntities' historical failure mode).
 */

export type Bucket = "pinned" | "standing" | "adhoc";

export type Footprint = {
  /** Spaces this entry's data can come from. Empty ⇒ GLOBAL (any edit hits). */
  spaceIds: string[];
  /** Type entities this entry selects by (creations of these types hit it). */
  typeIds: string[];
  /** Member entity ids, when known — enables per-entity precision. */
  entityIds?: string[];
}

export type HeadStamp = {
  editId: string;
  createdAt: string;
  totalCount: number;
}

export type CacheEntry<T = unknown> = {
  key: string;
  bucket: Bucket;
  status: "valid" | "stale" | "refreshing";
  footprint: Footprint;
  stamp: HeadStamp;
  blob: T;
  fetchedAt: Date;
  validatedAt: Date;
}

const db = new PostgreSQLClient();
let schemaReady = false;

export async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await db.query(`CREATE SCHEMA IF NOT EXISTS geo_cache`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS geo_cache.entries (
      key          text PRIMARY KEY,
      bucket       text NOT NULL DEFAULT 'standing',
      status       text NOT NULL DEFAULT 'valid',
      footprint    jsonb NOT NULL,
      stamp        jsonb NOT NULL,
      blob         jsonb,
      bytes        bigint,
      fetched_at   timestamptz NOT NULL DEFAULT now(),
      validated_at timestamptz NOT NULL DEFAULT now(),
      last_hit_at  timestamptz
    )`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS geo_cache.blob_index (
      content_uri     text PRIMARY KEY,
      edit_id         text,
      space_id        text,
      entity_ids      jsonb,
      created_type_ids jsonb,
      decoded         boolean NOT NULL,
      indexed_at      timestamptz NOT NULL DEFAULT now()
    )`);
  await db.query(`CREATE INDEX IF NOT EXISTS blob_index_edit_id ON geo_cache.blob_index (edit_id)`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS geo_cache.meta (
      k text PRIMARY KEY,
      v jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  schemaReady = true;
}

export async function getEntry<T>(key: string): Promise<CacheEntry<T> | null> {
  await ensureSchema();
  const rows = await db.query<any>(
    `SELECT key, bucket, status, footprint, stamp, blob,
            fetched_at AS "fetchedAt", validated_at AS "validatedAt"
     FROM geo_cache.entries WHERE key = $1`,
    [key],
  );
  if (rows.length === 0) return null;
  // Touch asynchronously; a hit-stat failure must never fail a read.
  db.query(`UPDATE geo_cache.entries SET last_hit_at = now() WHERE key = $1`, [key]).catch(() => {});
  return rows[0] as CacheEntry<T>;
}

export async function putEntry<T>(params: {
  key: string;
  bucket: Bucket;
  footprint: Footprint;
  stamp: HeadStamp;
  blob: T;
}): Promise<void> {
  await ensureSchema();
  const json = JSON.stringify(params.blob);
  await db.query(
    `INSERT INTO geo_cache.entries (key, bucket, status, footprint, stamp, blob, bytes, fetched_at, validated_at)
     VALUES ($1, $2, 'valid', $3, $4, $5, $6, now(), now())
     ON CONFLICT (key) DO UPDATE SET
       bucket = EXCLUDED.bucket, status = 'valid', footprint = EXCLUDED.footprint,
       stamp = EXCLUDED.stamp, blob = EXCLUDED.blob, bytes = EXCLUDED.bytes,
       fetched_at = now(), validated_at = now()`,
    [params.key, params.bucket, JSON.stringify(params.footprint), JSON.stringify(params.stamp), json, json.length],
  );
}

export async function markStale(keys: string[], reason: string): Promise<void> {
  if (keys.length === 0) return;
  await ensureSchema();
  await db.query(
    `UPDATE geo_cache.entries SET status = 'stale' WHERE key = ANY($1)`,
    [keys],
  );
  console.log(`geo_cache: marked stale (${reason}): ${keys.join(", ")}`);
}

export async function markAllStale(reason: string): Promise<number> {
  await ensureSchema();
  const rows = await db.query<{ key: string }>(
    `UPDATE geo_cache.entries SET status = 'stale' WHERE status = 'valid' RETURNING key`,
  );
  console.log(`geo_cache: GLOBAL invalidation (${reason}): ${rows.length} entries`);
  return rows.length;
}

export async function touchValidated(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await db.query(`UPDATE geo_cache.entries SET validated_at = now() WHERE key = ANY($1)`, [keys]);
}

export async function listEntries(): Promise<Array<Omit<CacheEntry, "blob">>> {
  await ensureSchema();
  return (await db.query<any>(
    `SELECT key, bucket, status, footprint, stamp, bytes,
            fetched_at AS "fetchedAt", validated_at AS "validatedAt", last_hit_at AS "lastHitAt"
     FROM geo_cache.entries ORDER BY key`,
  )) as any;
}

export async function getMeta<T>(k: string): Promise<T | null> {
  await ensureSchema();
  const rows = await db.query<{ v: T }>(`SELECT v FROM geo_cache.meta WHERE k = $1`, [k]);
  return rows[0]?.v ?? null;
}

export async function setMeta(k: string, v: unknown): Promise<void> {
  await ensureSchema();
  await db.query(
    `INSERT INTO geo_cache.meta (k, v, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`,
    [k, JSON.stringify(v)],
  );
}

export type BlobIndexRow = {
  contentUri: string;
  editId: string | null;
  spaceId: string | null;
  entityIds: string[] | null;
  createdTypeIds: string[] | null;
  decoded: boolean;
};

export async function getBlobIndex(uris: string[]): Promise<Map<string, BlobIndexRow>> {
  if (uris.length === 0) return new Map();
  await ensureSchema();
  const rows = await db.query<any>(
    `SELECT content_uri AS "contentUri", edit_id AS "editId", space_id AS "spaceId",
            entity_ids AS "entityIds", created_type_ids AS "createdTypeIds", decoded
     FROM geo_cache.blob_index WHERE content_uri = ANY($1)`,
    [uris],
  );
  return new Map(rows.map((r: any) => [r.contentUri, r as BlobIndexRow]));
}

export async function putBlobIndex(row: BlobIndexRow): Promise<void> {
  await ensureSchema();
  await db.query(
    `INSERT INTO geo_cache.blob_index (content_uri, edit_id, space_id, entity_ids, created_type_ids, decoded)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (content_uri) DO UPDATE SET
       edit_id = EXCLUDED.edit_id, space_id = EXCLUDED.space_id,
       entity_ids = EXCLUDED.entity_ids, created_type_ids = EXCLUDED.created_type_ids,
       decoded = EXCLUDED.decoded, indexed_at = now()`,
    [row.contentUri, row.editId, row.spaceId,
     row.entityIds ? JSON.stringify(row.entityIds) : null,
     row.createdTypeIds ? JSON.stringify(row.createdTypeIds) : null,
     row.decoded],
  );
}
