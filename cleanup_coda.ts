// ─── Final dedup coda ─────────────────────────────────────────────────────────
// 1. Delete 5 stray Crypto-space relations left by multi-residency twins.
// 2. Prune the newer twin of the two human-reviewed airDate-mismatch pairs.
// 3. Delete the orphaned Algerian twin (its keep was re-pointed to Goalhanger,
//    splitting the pair across show-groups so the sweep can't see it).
// Usage: bun cleanup_coda.ts [--publish]
import { Graph, type Op } from '@geoprotocol/geo-sdk';
import { publishOps } from './src/publish.ts';
import { gql } from './src/graph_ops/client.ts';
import { deleteEntity, queryBacklinks } from './src/graph_ops/delete_entity.ts';

const PODCASTS = 'b5a31f8182b042437ede0f84ee02f104';
const CRYPTO = 'c9f267dcb0d270718c2a3c45a64afd32';
const TYPES = '8f151ba4de204e3c9cb499ddf96f48f1';
const EPISODE = '972d201ad78045689e01543f67b26bee';
const PUBLISH = process.argv.includes('--publish');

const ops: Record<string, Op[]> = { [PODCASTS]: [], [CRYPTO]: [] };

// 1. stray relations (all Crypto)
for (const relId of ['c974cfaacae141de9c95a7472da0527b','fa625f2aaa4e4ed4bdc92727fa776c92','21833f5847ca45d5853fa7437c507e3b','4b89453e3d52467dbde6044752d1cc03','3c4aa7473dbb4d8b8f27b50bf0c7da57']) {
  ops[CRYPTO].push(...Graph.deleteRelation({ id: relId }).ops);
}
console.log(`stray relations: 5 deletions (Crypto)`);

// 2. review pairs — resolve by name, prune the newer
for (const name of [
  '357. Liberator of Latin America: Revolutionary Hero Or Dictator? (Part 4)',
  'Should The Koh-I-Noor Be Returned? Mamdani vs King Charles III EXPLAINED',
]) {
  const d = await gql(`query($n: String!){ entitiesConnection(filter: { name: { is: $n } relations: { some: { typeId: { is: "${TYPES}" } toEntityId: { in: ["${EPISODE}"] } } } }, first: 5) { nodes { id createdAt spaceIds } } }`, { n: name });
  const nodes = (d?.entitiesConnection?.nodes ?? []).sort((a: any, b: any) => Number(a.createdAt) - Number(b.createdAt));
  if (nodes.length !== 2) { console.log(`SKIP "${name.slice(0,40)}": found ${nodes.length} entities`); continue; }
  const newer = nodes[1];
  const inc = (await queryBacklinks(newer.id)).length;
  if (inc > 0) { console.log(`SKIP "${name.slice(0,40)}": newer twin has ${inc} incoming refs`); continue; }
  const space = newer.spaceIds[0];
  const del = await deleteEntity({ entityId: newer.id, spaceId: space, excludeFromOrphanCheck: [nodes[0].id] });
  ops[space] = [...(ops[space] ?? []), ...del];
  console.log(`review pair "${name.slice(0,40)}…": pruning newer ${newer.id.slice(0,8)} (${del.length} ops)`);
}

// 3. the orphaned Algerian twin (Crypto)
const ALGERIAN_TWIN = 'bf8ad31eddae4a43b3477e4eff46d9ac';
const inc = (await queryBacklinks(ALGERIAN_TWIN)).length;
if (inc === 0) {
  const del = await deleteEntity({ entityId: ALGERIAN_TWIN, spaceId: CRYPTO, excludeFromOrphanCheck: ['74713026ed7d4dc48350424faf100a64','38a216beb67e4affa9858259c7b0f9d3','4f5f6ddfd1c644c1a43eddb3012f09a9'] });
  ops[CRYPTO].push(...del);
  console.log(`algerian twin: ${del.length} ops (Crypto)`);
} else console.log(`SKIP algerian twin: ${inc} incoming refs`);

for (const [s, o] of Object.entries(ops)) console.log(`${s === PODCASTS ? 'Podcasts' : 'Crypto'}: ${o.length} ops`);
if (PUBLISH) {
  for (const [s, o] of Object.entries(ops)) if (o.length) await publishOps(o, 'Episode dedup coda: stray relations + reviewed pairs + orphaned twin', s);
  console.log('published');
} else console.log('DRY-RUN');
