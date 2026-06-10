import { config } from "./config.ts";



export const testnetWalletAddress = config.W_ADDRESS;
export const mainnetWalletAddress = config.SW_ADDRESS;

export const SPACE_IDS = {
  root: "2a98e6b4372844a49b8e02e15f0677c8",
  podcasts: "b5a31f8182b042437ede0f84ee02f104",
}

// === Topic selection priority constants ===
// Used by `buildEntityCached` to deterministically pick between multiple
// existing Geo topics that share a canonical name. See root_cause_analysis.md
// and the cross-space-topic-dups report for the surfacing of this bug.

// The Root (Geo) space — canonical topics live here. NOTE: this is NOT the
// same as the stale `SPACE_IDS.root` above (which predates the canonical-topic
// concept and is left intact in case other tooling references it).
export const ROOT_GEO_SPACE_ID = "a19c345ab9866679b001d7d2138d88a1";

// The 13 canonical SPACE ids (per some-ids.md). At runtime we resolve each
// space's `topicId` to discover which entity IDs represent these canonical
// spaces — the rule-1 priority check is against that discovered set.
export const CANONICAL_SPACE_IDS = new Set<string>([
  "c9f267dcb0d270718c2a3c45a64afd32",  // Crypto
  "41e851610e13a19441c4d980f2f2ce6b",  // AI
  "52c7ae149838b6d47ce0f3b2a5974546",  // Health
  "19f11bc6f1a62ac434936af814d1f8b5",  // Pharma
  "870e3b3068661e6280fad2ab456829bc",  // Technology
  "89bd89bf28ff8a0963faf92a8c905e20",  // World affairs
  "4582fbbee28a16589154f7e36f1ee3c5",  // U.S. Politics
  "d69608290513c2a91102c939b3265bd7",  // Industries
  "ec349623f33236aee13c12dcd629ee81",  // Education
  "9b611b848b12491b9b6b43f3cf019b8b",  // Software
  "84a679ce188f061ac9a92380bac2bab5",  // Places
  "784bfddae3f3976118c561bf28195b44",  // Documentation
  "b5a31f8182b042437ede0f84ee02f104",  // Podcasts
]);

// Dataset spaces — topics here are NEVER selected (per the priority rules).
// Identified only by ID; the GraphQL `SpaceTypes` enum has no DATASET value.
export const DATASET_SPACE_IDS = new Set<string>([
  "5908c73ad336472ccbd983491d2d17e4",  // Crypto datasets
  "941964642f4d3e70ef48f54a3915277d",  // AI datasets
  "44eb138f564fbed6ed9ce543de1b849c",  // Health datasets
  "da96a4c26e718bfa6c27c3b1f3c316cd",  // World affairs datasets
  "1b3d2963d14de99d4e440000125edb65",  // U.S. Politics datasets
]);

// Tag entities. A topic is "featured" / "curated" iff it has a relation
// pointing to one of these (typeId is irrelevant — toEntityId is what counts).
export const FEATURED_TAG_ENTITY_ID = "b69b8b1659df4e6d99d79956a30e8932";
export const CURATED_TAG_ENTITY_ID  = "7f796eb5bfc5449c98649bf7d996a2ca";

// Score property. A topic "has a score" iff its values array contains a
// value with this propertyId. The "Score" property is "net upvotes minus
// downvotes for an entity within a space."
export const SCORE_PROPERTY_ID = "85a4668a42fa4f488969c0a9de0c294b";

// Threaded through `buildEntityCached` for deterministic candidate selection
// when multiple Geo topics share a canonical name. Populated once per workflow
// run by `loadGeoEntities`. See root_cause_analysis.md / cross_space_topic_dups.csv.
//
// Lives in constants.ts (not setup_ontology.ts) to avoid a circular import
// between setup_ontology.ts and functions.ts.
export interface ScoringContext {
  // Entity IDs that represent canonical spaces (e.g. the entity for the Crypto
  // space). Resolved at startup by querying each canonical space's `topicId`.
  canonicalSpaceTopicIds: Set<string>;
  // Space IDs whose `type === 'PERSONAL'`. Any candidate that belongs to any
  // of these is filtered out before sort.
  personalSpaceIds: Set<string>;
}

export const EMPTY_SCORING_CONTEXT: ScoringContext = {
  canonicalSpaceTopicIds: new Set(),
  personalSpaceIds: new Set(),
};

export const propertyToIdMap: Record<string, string> = {
  "name": "a126ca530c8e48d5b88882c734c38935",
  "description": "9b1f76ff9711404c861e59dc3fa7d037",
  "avatar": "1155befffad549b7a2e0da4777b8792c",
  "cover": "34f535072e6b42c5a84443981a77cfa2",
  "types": "8f151ba4de204e3c9cb499ddf96f48f1",
  "web_url": "eed38e74e67946bf8a42ea3e4f8fb5fb",
  "x_url": "0d6259784b3c4b57a86fde45c997c73c",
  "date_founded": "41aa3d9847b64a97b7ec427e575b910e",
  "sources": "49c5d5e1679a4dbdbfd33f618f227c94",
  "source_db_identifier": "5e92c8a417144ee79a09389ef4336aeb",
  "propertiesSourced": "198150d08f4e410a93299aab3ac3c1e3",
  "relationsSourced": "2596082ff4d34a619b6a831e253cb345",
  "format": "396f8c72dfd04b5791ea09c1b9321b2f",
  "topics": "806d52bc27e94c9193c057978b093351",
  "roles": "8fcfe5ef3d9147bd83223830a998d26b",
  "renderable_type": "2316bbe1c76f463583f23e03b4f1fe46",
  "supporting_quotes": "f9eeaf9d9eb741b1ac5d257c6e82e526",
  "text_blocks": "beaba5cba67741a8b35377030613fc70",
  "data_blocks": "beaba5cba67741a8b35377030613fc70",
  "tabs": "4d9cba1c4766469881cd3273891a018b",
  "data_source_type": "1f69cc9880d444abad493df6a7b15ee4",
  "filter": "14a46854bfd14b1882152785c2dab9f3",
  "markdown_content": "e3e363d1dd294ccb8e6ff3b76d99bc33",
  "relation_entity_types": "f394b9b4420d4ab4bceb81ded11df4d5",
  "listen_on": "1367bac7dcea4b8086ada4a4cdd7c2cb",
  "hosts": "c72d9abbbca84e86b7e8b71e91d2b37e",
  "guests": "cb60a1a66fb548c9b936200c5c271330",
  "contributors": "fce8953f56af4e42a869725ed0b024f0",
  "episode_number": "9b5eced95c30473b8404f474a777db3a",
  "air_date": "77999397f78d44a7bbc5d93a617af47c",
  "audio_url": "87f919d5560b408cbe8d318e2c5c098b",
  "duration": "76996accd10f4cd59ac94a705b8e03b4",
  "rss_feed_url": "a5776138deb8436f8c983eccd100d98f",
  "explicit": "9da6760c22ce4c29ab57a67a27f340a1",
  "podcast": "f1873bbc381f4604abad76fed4f6d73f",
  "source_database_key": "9f1e43fd63e34bde97b9b3d88c57031b",
  "attributed_to": "a10391b7c278490e82d7a5077c5c2510",
  "targets": "98e370019a584830a7a967a3f41c6bb4",
  "start_offset": "a1d1cb557b184238ba0ec78ba7f289fb",
  "end_offset": "79a677b597f84ca8a1cf24eef7837b61",
  "notable_quotes": "8d4ae49c226d40868ec3af5d5b2a65d0",
  "notable_claims": "e1371bcda7044396adb7ea7ecc8fe3d4",
  "broader_topics": "b35bd6d39fb64f3a8aeaf5a9b91b5ef6",
  "subtopics": "39e40cadb23d4f63ab2faea1596436c7"
};
//'"bool" | "float64" | "text" | "point" | "date" | "time" | "datetime" | "schedule"
export const propertyToDataTypeMap: Record<string, string> = {
  "name": "text",
  "description": "text",
  "avatar": "relation",
  "cover": "relation",
  "types": "relation",
  "web_url": "text",
  "x_url": "text",
  "date_founded": "date",
  "sources": "relation",
  "source_db_identifier": "text",
  "propertiesSourced": "relation",
  "relationsSourced": "relation",
  "format": "text",
  "topics": "relation",
  "roles": "relation",
  "renderable_type": "relation",
  "supporting_quotes": "relation",
  "text_blocks": "relation",
  "data_blocks": "relation",
  "tabs": "relation",
  "data_source_type": "relation",
  "filter": "text",
  "markdown_content": "text",
  "relation_entity_types": "relation",
  "listen_on": "relation",
  "hosts": "relation",
  "guests": "relation",
  "contributors": "relation",
  "episode_number": "integer",
  "air_date": "datetime",
  "audio_url": "text",
  "duration": "float",
  "rss_feed_url": "text",
  "explicit": "boolean",
  "podcast": "relation",
  "source_database_key": "text",
  "attributed_to": "relation",
  "targets": "relation",
  "start_offset": "integer",
  "end_offset": "integer",
  "notable_quotes": "relation",
  "notable_claims": "relation",
  "broader_topics": "relation",
  "subtopics": "relation",
};

/*


source_db_key: "d1fa97b32ab44f18bd5a91868a63a392",
attributed_to: "4c537c0324b244ceba44ee9e0bf406bb",
notable_quotes: "dc637db03066403ca0211d9eeea02d61",
notable_claims: "4b29893392e84b91ac4073d0da7834f3",
targets: "b08235e4725f450b899f913b915ff58e",
start_offset: "d2ac07e6ea4449b8b1bdd2984ebdf5c6",
end_offset: "e449e3c7c25b4182b4ced941b64b7b79",
broader_topics: "db8481b9ecc54a548073dae3b6f5a8f6",
subtopics: "a093cd2e09fa4c91a1c0d0bdcc68b439",
*/

export const typeToIdMap: Record<string, string> = {
  "person": "7ed45f2bc48b419e8e4664d5ff680b0d",
  "project": "484a18c5030a499cb0f2ef588ff16d50",
  "source": "706779bf537744a68694ea06cf87a3a2",
  "topic": "5ef5a5860f274d8e8f6c59ae5b3e89e2",
  "role": "e4e366e9d5554b6892bf7358e824afd2",
  "claim": "96f859efa1ca4b229372c86ad58b694b",
  "quote": "043a171c69184dc3a7dbb8471ca6fcc2",
  "text_block": "76474f2f00894e77a0410b39fb17d0bf",
  "data_block": "b8803a8665de412bbb357e0c84adf473",
  "page": "480e3fc267f3499385fbacdf4ddeaa6b",
  "podcast": "4c81561d1f9541319cdddd20ab831ba2",
  "podcast_appearance": "791b9eef81ed4389a9c0e991f38783cc",
  "selector": "813ca865db9b486490dec6764febaab3",
  "episode": "972d201ad78045689e01543f67b26bee",
  "claim_relation": "31ce915d47bc4f28bd7842a10cb5d14c"
};

//podcast: "69732974c632490d81a312ea567b2a8e",
//episode: "11feb0f9fb3b442c818ab5e97ffde26a",
//podcast_appearance: "53841c1119c6473da093b60968149f60",
//selector: "75e2a120d2834d27a3bb6e8e748a30c2",

export const renderableTypeToIdMap: Record<string, string> = {
  url: "283127c96142468492ed90b0ebc7f29a",
};

