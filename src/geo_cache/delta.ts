import { decodeEditAuto } from "@geoprotocol/grc-20";
import { gql } from "../graph_ops/client.ts";
import { getBlobIndex, putBlobIndex, type BlobIndexRow, type Footprint, type HeadStamp } from "./store.ts";

/**
 * Delta-decode: turn "the head moved" into the precise set of touched targets
 * by replaying the graph's own changelog, instead of re-running any cached
 * query. Cost scales with CHANGE VOLUME, not cache size.
 *
 * Per edit:
 *  - DAO edits always have a proposal action (`contentId = editId`) exposing
 *    `contentUri` → fetch the blob → decode → exact entity ids touched.
 *  - Personal-space publishes have NO proposal, but their author IS the target
 *    space (`editVersion.createdById`; verified with the 2026-07-31 probe
 *    edit) — so their whole footprint is that one space, no blob needed.
 *  - Anything unresolvable degrades to "touches its space(s) entirely", never
 *    to "touches nothing": over-approximation is the invariant.
 */

export interface EditDelta {
  editId: string;
  createdAt: string;
  /** Spaces this edit wrote into (always known, possibly over-approximated). */
  spaceIds: string[];
  /** Exact entity ids touched, when the blob decoded. undefined ⇒ unknown. */
  entityIds?: string[];
  /** Type entities assigned by TYPES-relation ops (new-entity detection). */
  createdTypeIds?: string[];
  decoded: boolean;
}

const TYPES_PROPERTY_ID = "8f151ba4de204e3c9cb499ddf96f48f1";
const API_ORIGIN = (process.env.GEO_API_URL ?? "https://api-testnet.geobrowser.io/graphql").replace(/\/graphql$/, "");
// Filebase first: it is the gateway Geo's own apps read from (pod #75 /
// news #51); ipfs.io only as a slow fallback. The api-origin has no /ipfs
// route (probed 404, 2026-08-05).
const IPFS_GATEWAYS = [
  (cid: string) => process.env.GEO_IPFS_GATEWAY ? `${process.env.GEO_IPFS_GATEWAY}/${cid}` : `https://mature-tomato-basilisk.myfilebase.com/ipfs/${cid}`,
  (cid: string) => `https://ipfs.io/ipfs/${cid}`,
];

export async function listEditsSince(stamp: HeadStamp, limit = 500): Promise<Array<{ editId: string; createdAt: string; createdById: string }>> {
  const data: any = await gql(
    `query($after: Datetime!) {
      editVersions(filter: { createdAt: { greaterThan: $after } }, orderBy: CREATED_AT_ASC, first: ${limit}) {
        editId createdAt createdById
      }
    }`,
    { after: stamp.createdAt },
  );
  return data?.editVersions ?? [];
}

async function fetchBlob(uri: string): Promise<Uint8Array | null> {
  const cid = uri.replace(/^ipfs:\/\//, "");
  for (const toUrl of IPFS_GATEWAYS) {
    try {
      const res = await fetch(toUrl(cid), { signal: AbortSignal.timeout(8_000) });
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    } catch {
      /* try next gateway */
    }
  }
  return null;
}

/** Pull entity ids out of a decoded edit's ops, defensively across op shapes. */
/** grc-20 `Id`s are raw 16-byte Uint8Arrays — normalize ids of either shape
 *  (bytes or dashed/dashless string) to lowercase 32-hex. */
function idToHex(x: unknown): string {
  if (x instanceof Uint8Array) {
    return Array.from(x, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  if (typeof x === "string") return x.replace(/-/g, "").toLowerCase();
  return "";
}

function extractTargets(edit: any): { entityIds: Set<string>; createdTypeIds: Set<string> } {
  const entityIds = new Set<string>();
  const createdTypeIds = new Set<string>();
  const norm = idToHex;
  const ops: any[] = Array.isArray(edit?.ops) ? edit.ops : [];
  for (const op of ops) {
    // Entity-shaped ops: createEntity/updateEntity/deleteEntity/restoreEntity
    // all target `id`; relation ops additionally reference `from`/`to`.
    for (const candidate of [op?.id, op?.from, op?.to, op?.entity]) {
      const n = norm(candidate);
      if (n.length >= 32) entityIds.add(n);
    }
    // A TYPES-relation creation marks a (possibly new) typed entity.
    const relType = norm(op?.relationType ?? op?.typeId ?? op?.propertyId ?? (typeof op?.type === "string" && op.type.length >= 32 ? op.type : ""));
    if (relType === TYPES_PROPERTY_ID) {
      const to = norm(op?.to);
      if (to) createdTypeIds.add(to);
    }
  }
  return { entityIds, createdTypeIds };
}

export async function resolveDeltas(
  edits: Array<{ editId: string; createdAt: string; createdById: string }>,
): Promise<EditDelta[]> {
  if (edits.length === 0) return [];

  // A PUBLISH proposal action references its edit ONLY by contentUri (CID);
  // `contentId` is null and the editId↔CID link lives inside the blob itself
  // (verified 2026-08-05). So: fetch the blobs of all proposals created in a
  // generous window before the oldest edit, decode them, and join edits to
  // proposals by the DECODED edit id. The 7-day lookback covers propose→apply
  // gaps (worst observed: ~3 days during the July replay); if the proposal
  // query saturates its cap, unmatched edits degrade to GLOBAL, never to
  // "personal" — over-approximation is the invariant.
  const PROPOSAL_LOOKBACK_SEC = 48 * 3600; // covers propose→apply lag (worst normal ~hours; July replay-class events are caught by the anomaly guard instead)
  const PAGE = 500;
  const MAX_PAGES = 4;
  const oldestEditSec = Math.floor(new Date(edits[0].createdAt + "Z").getTime() / 1000);
  const proposals: any[] = [];
  let after: string | null = null;
  let proposalsSaturated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const pr: any = await gql(
      `query($after: String!, $cursor: Cursor) {
        proposalsConnection(filter: { createdAt: { greaterThan: $after } }, first: ${PAGE}, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id spaceId createdAt
            proposalVersions(orderBy: PROPOSAL_VERSION_DESC, first: 5) {
              actions: proposalActionsByProposalIdAndProposalVersion { actionType contentUri }
            }
          }
        }
      }`,
      { after: String(oldestEditSec - PROPOSAL_LOOKBACK_SEC), cursor: after },
    );
    const conn = pr?.proposalsConnection;
    proposals.push(...(conn?.nodes ?? []));
    if (!conn?.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
    if (page === MAX_PAGES - 1) proposalsSaturated = true; // window truncated
  }

  // Decode each distinct PUBLISH blob ONCE EVER: consult the persistent
  // blob_index first, fetch+decode only unseen URIs (bounded concurrency),
  // persist results. Validator cost is proportional to NEW edits, not history.
  const uris: string[] = [];
  const uriSpace = new Map<string, string>();
  for (const p of proposals) {
    for (const v of p.proposalVersions ?? []) {
      for (const a of v.actions ?? []) {
        if (a?.actionType === "PUBLISH" && a.contentUri && !uriSpace.has(a.contentUri)) {
          uris.push(a.contentUri);
          uriSpace.set(a.contentUri, p.spaceId);
        }
      }
    }
  }
  const indexed = await getBlobIndex(uris);
  const unseen = uris.filter((u) => !indexed.has(u));
  const CONCURRENCY = 6;
  for (let i = 0; i < unseen.length; i += CONCURRENCY) {
    await Promise.all(unseen.slice(i, i + CONCURRENCY).map(async (uri) => {
      const row: BlobIndexRow = {
        contentUri: uri, editId: null, spaceId: uriSpace.get(uri) ?? null,
        entityIds: null, createdTypeIds: null, decoded: false,
      };
      const blob = await fetchBlob(uri);
      if (blob) {
        try {
          const edit = (await decodeEditAuto(blob)) as any;
          const decodedId = idToHex(edit?.id);
          if (decodedId) {
            const { entityIds, createdTypeIds } = extractTargets(edit);
            row.editId = decodedId;
            row.entityIds = [...entityIds];
            row.createdTypeIds = [...createdTypeIds];
            row.decoded = true;
          }
        } catch { /* leave undecoded */ }
      }
      indexed.set(uri, row);
      await putBlobIndex(row);
    }));
  }
  const byEditId = new Map<string, { spaceId: string; entityIds: string[]; createdTypeIds: string[] }>();
  for (const row of indexed.values()) {
    if (row.decoded && row.editId) {
      byEditId.set(row.editId, {
        spaceId: row.spaceId ?? "",
        entityIds: row.entityIds ?? [],
        createdTypeIds: row.createdTypeIds ?? [],
      });
    }
  }

  // Fallback safety: `createdById` is only a usable footprint when it IS a
  // real space (personal publishes: author == target space). Some proposal-less
  // edits carry non-space author ids (observed 2026-08-06) — those must degrade
  // to GLOBAL, never to a phantom footprint that matches nothing.
  const fallbackIds = [...new Set(
    edits.filter((e) => !byEditId.has(idToHex(e.editId))).map((e) => e.createdById),
  )];
  const knownSpaces = new Set<string>();
  if (fallbackIds.length > 0) {
    const sp: any = await gql(
      `query($ids: [UUID!]!) { spaces(filter: { id: { in: $ids } }) { id } }`,
      { ids: fallbackIds },
    );
    for (const row of sp?.spaces ?? []) knownSpaces.add(idToHex(row.id));
  }

  const deltas: EditDelta[] = [];
  for (const e of edits) {
    const match = byEditId.get(idToHex(e.editId));
    if (match) {
      deltas.push({
        editId: e.editId,
        createdAt: e.createdAt,
        spaceIds: [match.spaceId],
        entityIds: match.entityIds,
        createdTypeIds: match.createdTypeIds,
        decoded: true,
      });
    } else if (proposalsSaturated) {
      // Can't prove it isn't a DAO edit whose proposal fell past the cap.
      deltas.push({ editId: e.editId, createdAt: e.createdAt, spaceIds: [], decoded: false });
    } else if (knownSpaces.has(idToHex(e.createdById))) {
      // No proposal anywhere in the window ⇒ personal-space publish; the
      // author space IS the target space (probe-verified 2026-07-31).
      deltas.push({ editId: e.editId, createdAt: e.createdAt, spaceIds: [e.createdById], decoded: false });
    } else {
      // Author is not a space we can resolve — footprint unknowable.
      deltas.push({ editId: e.editId, createdAt: e.createdAt, spaceIds: [], decoded: false });
    }
  }
  return deltas;
}

/** Does this edit's delta invalidate an entry with this footprint? */
export function hits(delta: EditDelta, fp: Footprint): boolean {
  if (fp.spaceIds.length === 0) return true; // GLOBAL footprint
  if (delta.spaceIds.length === 0) return true; // edit of unknown location — over-approximate
  const fpSpaces = new Set(fp.spaceIds.map((s) => s.replace(/-/g, "")));
  const spaceHit = delta.spaceIds.some((s) => fpSpaces.has(s.replace(/-/g, "")));
  if (!spaceHit) return false;
  if (!delta.decoded) return true; // in-space but opaque — assume hit
  const fpTypes = new Set(fp.typeIds.map((t) => t.replace(/-/g, "")));
  if ((delta.createdTypeIds ?? []).some((t) => fpTypes.has(t))) return true; // new entity of a cached type
  if (!fp.entityIds || fp.entityIds.length === 0) return true; // space-level footprint
  const members = new Set(fp.entityIds.map((x) => x.replace(/-/g, "")));
  return (delta.entityIds ?? []).some((x) => members.has(x));
}
