// One-off repair: episode "379. Algerian Revolution" (74713026, the dedup KEEP)
// was linked to the Blockworks Empire by transition-window zombies. Re-point its
// Podcasts relation to the Goalhanger entity; delete its duplicate Crypto-space
// relation. (The twin's own relation dies with the twin in the next sweep.)
import { Graph, type Op } from '@geoprotocol/geo-sdk';
import { publishOps } from './src/publish.ts';

const PROP_PODCAST = 'f1873bbc381f4604abad76fed4f6d73f';
const EPISODE = '74713026ed7d4dc48350424faf100a64';
const GOALHANGER = '4f5f6ddfd1c644c1a43eddb3012f09a9';
const PODCASTS = 'b5a31f8182b042437ede0f84ee02f104';
const CRYPTO = 'c9f267dcb0d270718c2a3c45a64afd32';
const PUBLISH = process.argv.includes('--publish');

const podcastsOps: Op[] = [
  ...Graph.deleteRelation({ id: 'aba610ce80a24d36a5db50370ef31f73' }).ops,
  ...Graph.createRelation({ fromEntity: EPISODE, toEntity: GOALHANGER, type: PROP_PODCAST }).ops,
];
const cryptoOps: Op[] = Graph.deleteRelation({ id: '5c97d0388c034ce99da82c115841cf41' }).ops;

console.log(`Podcasts: ${podcastsOps.length} ops (re-point episode → Goalhanger)`);
console.log(`Crypto: ${cryptoOps.length} ops (delete duplicate relation)`);
if (PUBLISH) {
  await publishOps(podcastsOps, 'Repair: re-point 379 Algerian Revolution to Empire: World History', PODCASTS);
  await publishOps(cryptoOps, 'Repair: remove duplicate cross-space podcast relation', CRYPTO);
  console.log('published');
} else console.log('DRY-RUN');
