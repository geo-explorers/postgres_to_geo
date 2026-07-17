// Empire residue cleanup — the graph leg of the 2026-07-17 root cause
// (see deferred-twins.csv "Empire re-link (feed residue + classifier)").
// Run AFTER PR #26 (classifier + URL-ambiguity fix) is deployed, otherwise
// the next publish run re-creates what this deletes.
//
//   bun cleanup_empire_residue.ts            # dry run (default)
//   bun cleanup_empire_residue.ts --execute  # publish
//
// 1. Blockworks Empire @Podcasts: unset the conflated-era rss_feed_url
//    (…/empirepodcast — Goalhanger's feed, the value that made URL matching
//    ambiguous) and the leftover history-show description.
// 2. Episode 74713026 ("379. Algerian Revolution…") @Crypto: delete the whole
//    Crypto residency — the classifier misroute re-emitted ~30 claim/topic/
//    listen-on relation copies there (values + relations, votes untouched,
//    orphan cleanup refcount-protected).
// 3. Delete stray relation b923db66 (episode 379 → Blockworks) @Podcasts.

import { Graph, type Op } from '@geoprotocol/geo-sdk';
import { publishOps } from './src/publish.ts';
import { gql } from './src/graph_ops/client.ts';
import { deleteEntity } from './src/graph_ops/delete_entity.ts';

const PODCASTS = 'b5a31f8182b042437ede0f84ee02f104';
const CRYPTO = 'c9f267dcb0d270718c2a3c45a64afd32';
const BW_EMPIRE = '38a216beb67e4affa9858259c7b0f9d3';
const GH_EMPIRE = '4f5f6ddfd1c644c1a43eddb3012f09a9';
const EP_379 = '74713026ed7d4dc48350424faf100a64';
const STRAY_REL = 'b923db66ac0a413382eeccac388e78c2';
const PROP_RSS = 'a5776138deb8436f8c983eccd100d98f';
const PROP_DESCRIPTION = '9b1f76ff9711404c861e59dc3fa7d037';

const execute = process.argv.includes('--execute');

// ── TOCTOU pre-checks: verify the residue is still what we diagnosed ────────
const state = await gql(`{
  bw: entity(id: "${BW_EMPIRE}") { values { nodes { spaceId propertyId text } } }
  ep: entity(id: "${EP_379}") { spaceIds }
  rel: relations(filter: { id: { is: "${STRAY_REL}" } }) { id spaceId toEntityId }
}`);

const bwPodcastValues = (state.bw?.values?.nodes ?? []).filter((v: any) => v.spaceId === PODCASTS);
const staleRss = bwPodcastValues.find((v: any) => v.propertyId === PROP_RSS);
const staleDesc = bwPodcastValues.find((v: any) => v.propertyId === PROP_DESCRIPTION);
const epInCrypto = (state.ep?.spaceIds ?? []).includes(CRYPTO);
const strayRel = state.rel?.[0];

if (staleRss && !/empirepodcast/.test(String(staleRss.text))) {
  throw new Error(`refusing: BW rss @Podcasts is "${staleRss.text}", not the expected Goalhanger feed`);
}
if (strayRel && strayRel.toEntityId !== BW_EMPIRE) {
  throw new Error(`refusing: relation ${STRAY_REL} does not point at Blockworks Empire`);
}

console.log(`stale rss @Podcasts: ${staleRss ? `"${staleRss.text}"` : 'already gone'}`);
console.log(`stale description @Podcasts: ${staleDesc ? `present (${String(staleDesc.text).slice(0, 50)}…)` : 'already gone'}`);
console.log(`episode 379 Crypto residency: ${epInCrypto ? 'present' : 'already gone'}`);
console.log(`stray relation ${STRAY_REL.slice(0, 8)}: ${strayRel ? `present @${strayRel.spaceId.slice(0, 8)}` : 'already gone'}`);

// ── build ops per space ──────────────────────────────────────────────────────
const podcastsOps: Op[] = [];
const cryptoOps: Op[] = [];

const unset = [
  ...(staleRss ? [{ property: PROP_RSS }] : []),
  ...(staleDesc ? [{ property: PROP_DESCRIPTION }] : []),
];
if (unset.length) {
  podcastsOps.push(...Graph.updateEntity({ id: BW_EMPIRE, unset }).ops);
}

if (strayRel) {
  podcastsOps.push(...Graph.deleteRelation({ id: STRAY_REL }).ops);
}

if (epInCrypto) {
  cryptoOps.push(...await deleteEntity({
    entityId: EP_379,
    spaceId: CRYPTO,
    excludeFromOrphanCheck: [BW_EMPIRE, GH_EMPIRE],
  }));
}

console.log(`\nplanned ops: Podcasts=${podcastsOps.length} Crypto=${cryptoOps.length}`);

if (!execute) {
  console.log('dry run — pass --execute to publish');
  process.exit(0);
}

if (podcastsOps.length) {
  await publishOps(podcastsOps, 'Empire residue cleanup: stale conflated-era feed/description + stray episode link', PODCASTS);
}
if (cryptoOps.length) {
  await publishOps(cryptoOps, 'Empire residue cleanup: remove misrouted history episode from Crypto space', CRYPTO);
}
console.log('published');
