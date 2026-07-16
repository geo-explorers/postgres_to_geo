// ─── graph_ops: shared Geo ids ───────────────────────────────────────────────
// The reusable graph-hygiene module. Primitives here are ported from the
// geo-merge-topics tooling (the migration-era merge/fold/verify scripts) as
// they become needed by worker workflows; geo-merge-topics remains the
// provenance archive.

export const TYPES_PROP = '8f151ba4de204e3c9cb499ddf96f48f1';
export const TYPE_EPISODE = '972d201ad78045689e01543f67b26bee';
export const PROP_PODCAST = 'f1873bbc381f4604abad76fed4f6d73f';
export const PROP_AIR_DATE = '77999397f78d44a7bbc5d93a617af47c';

export const PODCASTS_SPACE = 'b5a31f8182b042437ede0f84ee02f104';
export const CRYPTO_SPACE = 'c9f267dcb0d270718c2a3c45a64afd32';

// Voting data is never migrated, unset, redirected or deleted by any graph op.
export const EXCLUDED_VALUE_PROPERTY_IDS = new Set<string>([
  '85a4668a42fa4f488969c0a9de0c294b', // Score
]);
export const EXCLUDED_RELATION_TYPE_IDS = new Set<string>([
  '19a4cfff45f24150abf2af0f43eb2eec', // Rank Votes
]);
