import { v4 as uuidv4 } from 'uuid';
import * as fs from "fs";
import md5 from 'crypto-js/md5.js';
import {Id, Base58, SystemIds, Graph, Position, type Op, IdUtils} from "@geoprotocol/geo-sdk";
import dotenv from "dotenv";
import { validate as uuidValidate } from 'uuid';

import {
  propertyToIdMap,
  propertyToDataTypeMap,
  testnetWalletAddress,
  ROOT_GEO_SPACE_ID,
  DATASET_SPACE_IDS,
  FEATURED_TAG_ENTITY_ID,
  CURATED_TAG_ENTITY_ID,
  SCORE_PROPERTY_ID,
  EMPTY_SCORING_CONTEXT,
  type ScoringContext,
} from './constants.ts';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { publishOps } from './publish.ts';


function normalizeName_tmp(name: string): string {
    return String(name)
        .toLowerCase()
        .trim()
        .replace(/\./g, '')         // remove periods
        .replace(/&/g, 'and')       // convert & to "and"
        .replace(/[\s\-]+/g, ' ')   // normalize spaces and hyphens
        .normalize('NFD')            // normalize accents
        .replace(/[\u0300-\u036f]/g, ''); // remove diacritics
}

export function normalizeName(name: string = ""): string | null {
    if (!name) return null;

    let normalized = name
        .toLowerCase()
        .replace(/\b(dr|mr|ms|mrs|the)\b/g, "") // drop common prefixes/articles
        .replace(/&/g, "and")                   // convert & to "and"
        .replace(/\./g, "")                      // remove periods
        .replace(/[^a-z0-9\s]/g, "")            // strip other punctuation
        .replace(/\b(u\s?s)\b/g, "us")          // normalize U S / U.S. → US
        .replace(/\s+/g, " ")                    // collapse spaces
        .trim();

    return normalized;
}

export function normalizeName_v1(name: string = ""): string | null {
    if (name) {
        return name
            .toLowerCase()
            .replace(/\b(dr|mr|ms|mrs|the)\b/g, "") // drop common prefixes/articles
            .replace(/[^a-z0-9\s]/g, "")            // strip punctuation
            .replace(/\s+/g, " ")                   // collapse spaces
            .trim();
    } else {
        return null;
    }
}

export const normalizeUrl = (url: string) =>
    url.endsWith('/') ? url.slice(0, -1) : url;

function normalizeUrl_for_matching(url: string): string {
    let u = url.trim().toLowerCase();

    u = u.replace(/^https?:\/\//, ""); // remove http/https
    u = u.replace(/^www\./, "");       // remove www.
    u = u.replace(/\/$/, "");          // remove trailing slash

    return u;
}

export function cleanText(input: string): string {
  // Remove invisible/control characters from the start and end
  return input
    .replace(/^[^\P{C}\P{Z}\S]+|[^\P{C}\P{Z}\S]+$/gu, '') // Strip non-printing characters at edges
    .trim(); // Also trim standard whitespace
}

export async function searchOps({
  ops,
  property,
  propType,
  searchText,
  typeId
}: {
  ops: Array<Op>;
  property: string;
  propType: string;
  searchText?: string;
  typeId?: string;
}) {
    if (!searchText) {
      return null;
    }
    let match: any;
    if (propType == "URL") {
        match = ops.find(op =>
            (op.type === "createEntity" || op.type === "updateEntity") &&
            Array.isArray((op as any).values) &&
            (op as any).values.some(
                (v: { property: string; value: string }) =>
                v.property == property &&
                normalizeUrl(v.value) == normalizeUrl(searchText)
            )
        );
    } else {
        match = ops.find(op =>
            (op.type === "createEntity" || op.type === "updateEntity") &&
            Array.isArray((op as any).values) &&
            (op as any).values.some(
                (v: { property: string; value: string }) =>
                v.property == property &&
                String(v.value)?.toLowerCase() == searchText?.toLowerCase()
            )
        );
    }



    if (match) {
        if (typeId) {
            const matchType = ops.find(op =>
                op.type == "createRelation" &&
                (op as any).fromEntity == match?.id &&
                (op as any).relationType == SystemIds.TYPES_PROPERTY &&
                (op as any).toEntity == typeId
            );
            if (matchType) {
                //console.log("Match found", match.id)
                return match.id
            } else {
                return null
            }

        } else {
            return match.id;
        }
    } else {
        return null
    }
}

export async function hasBeenEdited(ops: Array<Op>, entityId: string): Promise<boolean> {

    let match;
    match = ops.find(op =>
        (op.type === "createEntity" || op.type === "updateEntity") &&
        (op as any).id === entityId
    );

    if (match) {
        return true;
    }

    match = ops.find(op =>
        op.type === "createRelation" &&
        (op as any).fromEntity === entityId
    );

    if (match) {
        return true;
    } else {
        return false;
    }
}

// --- Normalize UUID Functions

export function isUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

export function isValid(id: string): boolean {
  if (id.length !== 22 && id.length !== 21) {
    return false;
  }

  try {
    const decoded = Base58.decodeBase58ToUUID(id);
    return uuidValidate(decoded);
  } catch (error) {
    return false;
  }
}

export function deterministicIdFromString(input: string): string {
    // Step 1: Hash input using MD5
    const hash = md5(input).toString(); // 32 hex chars
  
    // Step 2: Format into UUIDv4 style manually
    let uuid = [
      hash.substring(0, 8),
      hash.substring(8, 12),
      '4' + hash.substring(13, 16),            // Set version 4 (UUID v4)
      ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + hash.substring(18, 20), // Set variant
      hash.substring(20, 32)
    ].join('-');
  
    // Step 3: Remove dashes
    return uuid;//.replace(/-/g, '');
  }

export function normalizeToUUID_STRING(id: string): string {
    if (isUUID(id)) {
      return id;
    }
    //const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{22}$/; // Common Base58 UUID format
    //const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{21,22}$/;
  
    if (isValid(id)) {
      try {
        return Base58.decodeBase58ToUUID(id);
      } catch (e) {
        // Fall through if decoding fails
      }
    }
  
    return deterministicIdFromString(id);
  }

export function normalizeToUUID(id: string): Id {
    return Id(normalizeToUUID_STRING(id))
  }

export function valuePropertyExistsOnGeo(spaceId: string, entityOnGeo: any, propertyId: string): boolean {
    let geoProperties;

    if (entityOnGeo) {
        geoProperties = entityOnGeo?.values?.filter(
            (item: any) => 
                item.spaceId === spaceId &&
                item.propertyId === propertyId
        );

        if (geoProperties.length > 0) { //Note if it is greater than 1, we may be dealing with a multi space entity and I need to make sure I am in the correct space...
            return true;
        }
    }
    
    return false;
}

export function relationPropertyExistsOnGeo(spaceId: string, entityOnGeo: any, propertyId: string): boolean {
    let geoProperties = [];

    if (entityOnGeo) {
        geoProperties = entityOnGeo?.relations?.filter(
            (item: any) => 
                item.spaceId === spaceId &&
                item.typeId === propertyId
        );
        if (geoProperties.length > 0) { //Not true bc I am filtering by spaceId -> Note if it is greater than 1, we may be dealing with a multi space entity and I need to make sure I am in the correct space...
            return true;
        }
    }
    
    return false;
}

//export async function processNewRelation(currenOps: Array<Op>, spaceId: string, entityOnGeo: any, geoId: string, toEntityId: string, propertyId: string, position?: string, reset_position?: boolean, relationEntity?: string,): Promise<[Array<Op>, string]> {
export function processNewRelation({
  currenOps,
  spaceId,
  entityOnGeo,
  fromEntityId,
  toEntityId,
  propertyId,
  //position,
  last_position,
  //reset_position,
  relationEntity
}: {
  currenOps: Array<Op>;
  spaceId: string;
  entityOnGeo?: any;
  fromEntityId: string;
  toEntityId: string;
  propertyId: string;
  //position?: string;
  last_position?: string;
  //reset_position?: boolean;
  relationEntity?: string;
}): { ops: Array<Op>; relationEntityId: string; position: string;} {
  //TODO SHOULD I INSTEAD BE SENDING THE LAST POSITION IN AND THEN I COULD COMPARE WHETHER I NEED TO RESET THIS ONE?

    let geoProperties;
    const ops: Array<Op> = [];
    let addOps;
    let position;

    if (!relationEntity) {
      relationEntity = IdUtils.generate();
    }
    if (last_position) {
      position = Position.generateBetween(last_position, null)
    } else {
      position = Position.generateBetween(null, null)
    }

    // Search in the current ops whether relation exists...
    const match = currenOps.find(op =>
        op.type === "createRelation" &&
        (op as any).fromEntity === fromEntityId &&
        (op as any).relationType === propertyId &&
        (op as any).toEntity === toEntityId
    );
    if (match) {
        return { ops: ops, relationEntityId: (match as any).entityId, position: (match as any).position };
    }
 
    const args = arguments[0];
    if (!("entityOnGeo" in args)) {
      console.log("SEARCHING UNDEFINED")
        //entityOnGeo = await searchEntity({
        //    entityId: fromEntityId,
        //    spaceId: spaceId
        //});
    }
    if (entityOnGeo) {
        
        geoProperties = entityOnGeo?.relations?.filter(
            (item) => 
                item.spaceId == spaceId &&
                item.typeId == propertyId &&
                item.toEntityId == toEntityId
        );
        if (!geoProperties) {
            geoProperties = []
        }

        if (geoProperties.length == 0) {
            addOps = Graph.createRelation({
                toEntity: toEntityId,
                fromEntity: fromEntityId,
                type: propertyId,
                position: position,
                entityId: relationEntity
            });
            ops.push(...addOps.ops);
        } else {
            if ((last_position) && (Position.compare(geoProperties?.[0]?.position, last_position) != 1)){
                console.error("WRITE CODE TO UPDATE RELATION POSITION")
                
                //addOps = Graph.createRelation({
                //  id: geoProperties?.[0]?.id,
                //  position: position,
                //})

                //Update position of relation to correctly set one.
                //geoProperties?.[0]?.id
            } 
            if ((geoProperties.length > 1)) {
                console.error("DUPLICATE relations found on: ", fromEntityId)
                for (let i = 1; i < geoProperties.length; i++) {
                    addOps = Graph.deleteRelation({id: geoProperties?.[i]?.id})
                    ops.push(...addOps.ops);
                    console.log("DUPLICATES REMOVED")
                }
            }
            relationEntity = geoProperties?.[0]?.entityId;
            if (!relationEntity) {
                relationEntity = "RELATION EXISTS - ERROR FINDING RELATION ENTITY"
                console.error(relationEntity)
                console.log(geoProperties)
                
            }
            //console.log(`pre-existing relation found ${toEntityId}`)
            return { ops: ops, relationEntityId: relationEntity, position: geoProperties?.[0]?.position };
        }
    } else {
        //console.log("From entity: ", normalizeToUUID(fromEntityId))
        //console.log("To entity: ", normalizeToUUID(toEntityId))
        //console.log("Type: ", normalizeToUUID(propertyId))
        addOps = Graph.createRelation({
            toEntity: toEntityId,
            fromEntity: fromEntityId,
            type: propertyId,
            position: position,
            entityId: relationEntity
        });
        ops.push(...addOps.ops);
    }


    return { ops: ops, relationEntityId: relationEntity, position: position };
}



export async function addSpace(ops: Op | Op[], spaceId: string): Promise<Op[]> {
  const addIfMissing = (op: Op): Op => {
    if (Array.isArray(op)) {
      throw new Error('Received array instead of Op in addIfMissing');
    }
    return 'spaceId' in op ? op : { ...op, spaceId };
  };

  return Array.isArray(ops)
    ? ops.map(addIfMissing)
    : [addIfMissing(ops)];
}

export async function filterOps(ops: Op | Op[], spaceId: string): Promise<Op[]> {
  const clean = (op: Op): Op => {
    const { spaceId: _, ...rest } = op;
    return rest;
  };

  if (Array.isArray(ops)) {
    return ops.filter(op => op.spaceId === spaceId).map(clean);
  } else {
    return ops.spaceId === spaceId ? [clean(ops)] : [];
  }
}

export async function getSpaces(ops: Op[]): Promise<string[]> {
  const opsArray = Array.isArray(ops) ? ops : [ops];
  const spaceIds = opsArray
    .map(op => op.spaceId)
    .filter((id): id is string => typeof id === 'string');

  return Array.from(new Set(spaceIds));
}

//export async function addSources(currentOps: Op[], entityId: string, sourceEntityId: string, propertiesSourced: string[], source_url?: string, source_db_id?: string, toEntity?: string) {

export const getConcatenatedPlainText = (textArray?: any[]): string | undefined => {
    if (!Array.isArray(textArray) || textArray.length === 0) {
      return undefined;
    }
  
    return textArray
      .map(item => item?.plain_text ?? "")
      .join("")
      .trim() || undefined;
  };

export function readAllOpsFromFolder(): any[] {
  const folderPath = path.join(__dirname, '..', 'ethcc_testnet_ops'); // go up one level
  const allFiles = fs.readdirSync(folderPath);

  const opsFiles = allFiles.filter(file => /^ethcc_ops_\d+\.txt$/.test(file));

  let allOps: any[] = [];

  for (const file of opsFiles) {
    const filePath = path.join(folderPath, file);
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const ops = JSON.parse(fileContent);
      allOps.push(...ops);  // Assumes each file contains an array of ops
      console.log(`Read ${ops.length} ops from ${file}`);
    } catch (err) {
      console.error(`Failed to read or parse ${file}:`, err);
    }
  }

  return allOps;
}


// Convert import.meta.url to a __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to check if an object is a UUID byte array (16 bytes, keys 0-15)
function isUuidByteArray(obj: any): boolean {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  if (keys.length !== 16) return false;
  for (let i = 0; i < 16; i++) {
    if (!(String(i) in obj) || typeof obj[String(i)] !== 'number') return false;
  }
  return true;
}

// Convert UUID byte array to hex string without dashes
function uuidBytesToString(obj: any): string {
  let hex = '';
  for (let i = 0; i < 16; i++) {
    hex += obj[String(i)].toString(16).padStart(2, '0');
  }
  return hex;
}

// Recursively convert UUID byte arrays to strings in an object
function convertUuidBytes(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') {
    // If it's a string UUID with dashes, remove them
    if (typeof obj === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(obj)) {
      return obj.replace(/-/g, '');
    }
    return obj;
  }
  if (isUuidByteArray(obj)) {
    return uuidBytesToString(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(convertUuidBytes);
  }
  const result: any = {};
  for (const key of Object.keys(obj)) {
    result[key] = convertUuidBytes(obj[key]);
  }
  return result;
}

export function printOps(ops: any, outputDir: string, fn: string) {
  //const outputDir = path.join(__dirname, '');
  console.log("NUMBER OF OPS: ", ops.length);

  if (ops.length > 0) {
    // Get existing filenames in the directory
    const existingFiles = fs.readdirSync(outputDir);

    // Convert UUID byte arrays to strings and remove dashes from UUID strings
    const convertedOps = convertUuidBytes(ops);

    // Create output text
    const outputText = JSON.stringify(convertedOps, (_, v) => typeof v === "bigint" ? v.toString() : v, 2);
    

    // Write to file
    const filename = fn;
    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, outputText);

    console.log(`OPS PRINTED to ${filename}`);
  } else {
    console.log("NO OPS TO PRINT");
  }
}

export async function publishOps_w_spaces(ops: any) {
    if ((ops.length > 0) && (true)) {
        const iso = new Date().toISOString();
        let txHash;
        const spaces = await getSpaces(ops);
        

        for (const space of spaces) { 
            txHash = await publishOps(await filterOps(ops, space), `Upload ${iso}`, space)
    
            console.log(`Your transaction hash for ${space} is:`, txHash);
            console.log(iso);
            
            console.log(`Number of ops published in ${space}: `, (await filterOps(ops, space)).length)
        }   
        console.log(`Total ops: ${ops.length}`);
    } else {
        const spaces = await getSpaces(ops);
        console.log("Spaces", spaces);
        for (const space of spaces) {
            console.log(`Number of ops published in ${space}: `, (await filterOps(ops, space)).length)
            console.log(await filterOps(ops, space))
        }
    }
}


export type Value = {
  spaceId: string;
  property: string;
  value: string | number | boolean;
  type?: string;
};

export type Relation = {
  spaceId: string;
  type: string;
  toEntity: Entity;
  entity: Entity;
};

export type Entity = {
    internal_id: string;
    id: string;
    entityOnGeo: any
    name: string;
    values: Value[]
    relations: Relation[]
};

// --- Helpers ---

export function extractUrls(values: any[] = [], isApi: boolean = false): { url: string; propertyId: string }[] {
  const propKey = isApi ? "propertyId" : "property";

  return values
    .filter(v =>
      typeof v.value === "string" &&
      (/^https?:\/\//i.test(v.value) || /\.(com|org|net|io|co|fm)$/i.test(v.value))
    )
    .map(v => ({
      url: v.value,
      propertyId: v[propKey],
    }));
}



export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

export function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}


// --- Main matcher ---

export type LocalEntity = {
  internal_id: string;
  name?: string;
  values: { property: string; value: string }[];
  relations: any[];
  toEntity?: LocalEntity;
};

export type ApiEntity = {
  id: string;
  name: string | null;
  values: { propertyId: string; value?: string; string?: string }[];
  relations: any[];
};

export const isUrl = (str: string) => {
  if (!str || typeof str !== "string") return false;
  const domainPattern = /\.(com|org|net|io|gov|edu|co|fm|tv|me)(\/|$)/i;
  return str.startsWith("http://") || str.startsWith("https://") || domainPattern.test(str);
};


export function matchEntities(
  local: LocalEntity[],
  api: ApiEntity[],
): Record<string, string> {
  const matches: Record<string, string> = {};

  for (const localEntity of local) {
    // 1. Match on source db identifiers (via relations)
    let match;
    if (localEntity.relations) {
      for (const rel of localEntity.relations) {
        match = api.find(api =>
          api.relations?.some(r =>
            r.typeId == propertyToIdMap["sources"] &&
            r.toEntity.name == rel.toEntity.name &&
            Array.isArray(r?.entity?.values) &&
            r.entity.values.some(v =>
              v.propertyId == propertyToIdMap["source_db_identifier"] &&
              v.value === rel.entity.values.filter(v => v.property == propertyToIdMap["source_db_identifier"]).value
            )
          )
        );
        if (match) break;
      }
    }
    if (match) {
      matches[localEntity.internal_id] = match.id;
      continue;
    }

    // 2️⃣ Match on URLs
    const matchedByUrl = api.find(apiEnt =>
      localEntity.values.some(localVal => isUrl(localVal.value)) &&
      apiEnt.values.some(apiVal => isUrl(apiVal.value || apiVal.string || ""))
    );

    if (matchedByUrl) {
      matches[localEntity.internal_id] = matchedByUrl.id;
      continue;
    }

    // 3️⃣ Fallback: match on combination of remaining values
    const matchedByValues = api.find(apiEnt =>
      localEntity.values.every(localVal =>
        apiEnt.values.some(
          apiVal =>
            (apiVal.value === localVal.value || apiVal.string === localVal.value) &&
            !isUrl(localVal.value)
        )
      )
    );

    if (matchedByValues) {
      matches[localEntity.internal_id] = matchedByValues.id;
    }
  }

  return matches;
}



// Cache to store already-built entities by table + id
export const entityCache: Record<string, Record<string, any>> = {};

// Index for O(1) normalized-name lookups into geoEntities.
// Keyed by the geoRows array reference, maps normalized name -> array of matching geoEntities.
const geoNameIndexCache = new WeakMap<any[], Map<string, any[]>>();

function getGeoNameIndex(geoRows: any[]): Map<string, any[]> {
  let index = geoNameIndexCache.get(geoRows);
  if (index) return index;

  index = new Map<string, any[]>();
  for (const entity of geoRows) {
    const normalized = normalizeName(entity.name);
    if (!normalized) continue;
    let bucket = index.get(normalized);
    if (!bucket) {
      bucket = [];
      index.set(normalized, bucket);
    }
    bucket.push(entity);
  }
  geoNameIndexCache.set(geoRows, index);
  return index;
}

// =========================================================================
// Deterministic candidate selection — used by buildEntityCached when more
// than one Geo entity shares the canonical name we're looking up.
//
// Priority (top wins, falls through to next rule on ties):
//   1. Canonical space  — entity is the topic-representation of a canonical
//                         Geo space (e.g. the Crypto space's topic entity).
//   2. Canonical topic  — entity is in the Root (Geo) space.
//   3. Featured topic   — entity has a relation to the Featured tag entity.
//   4. Scored topic     — entity has a `Score` value. Both-scored = pick
//                         higher and log a [BOTH_SCORED] structured warning.
//   5. Curated topic    — entity has a relation to the Curated tag entity.
//   6. Backlink count   — more backlinks wins (capped at 100; ties fall through).
//   7. More data        — values.length + relations.length, more wins.
//   8. Older topic      — earlier createdAt wins.
//   9. UUID ascending   — absolute deterministic floor.
//
// Filters (applied BEFORE sort — these candidates are excluded entirely):
//   - isValidCandidate(p) returns false (existing type/sources check)
//   - any of p.spaceIds is in DATASET_SPACE_IDS
//   - any of p.spaceIds is in ctx.personalSpaceIds
// =========================================================================

function isInDatasetSpace(p: any): boolean {
  const sids = p?.spaceIds;
  if (!Array.isArray(sids)) return false;
  for (const s of sids) if (DATASET_SPACE_IDS.has(String(s))) return true;
  return false;
}

function isInPersonalSpace(p: any, ctx: ScoringContext): boolean {
  const sids = p?.spaceIds;
  if (!Array.isArray(sids)) return false;
  for (const s of sids) if (ctx.personalSpaceIds.has(String(s))) return true;
  return false;
}

function isCanonicalSpace(p: any, ctx: ScoringContext): boolean {
  return ctx.canonicalSpaceTopicIds.has(String(p?.id ?? ""));
}

function isCanonicalTopic(p: any): boolean {
  const sids = p?.spaceIds;
  if (!Array.isArray(sids)) return false;
  return sids.includes(ROOT_GEO_SPACE_ID);
}

function hasRelationTo(p: any, targetEntityId: string): boolean {
  const rels = p?.relations;
  if (!Array.isArray(rels)) return false;
  for (const r of rels) {
    if (String(r?.toEntityId ?? "") === targetEntityId) return true;
  }
  return false;
}

function isFeatured(p: any): boolean {
  return hasRelationTo(p, FEATURED_TAG_ENTITY_ID);
}

function isCurated(p: any): boolean {
  return hasRelationTo(p, CURATED_TAG_ENTITY_ID);
}

/**
 * Returns the entity's score (net upvotes minus downvotes) or null if the
 * Score property is not set. Score values can be stored as integer, float,
 * decimal, or text — we read the normalized `value` first, then fall back to
 * the raw fields. Returns null if no parseable number is found.
 */
function getScore(p: any): number | null {
  const values = p?.values;
  if (!Array.isArray(values)) return null;
  for (const v of values) {
    if (String(v?.propertyId ?? "") !== SCORE_PROPERTY_ID) continue;
    // After flatten_api_response, the normalized form lives in `value`
    if (v.value != null && v.value !== "") {
      const n = Number(v.value);
      if (Number.isFinite(n)) return n;
    }
    // Defensive fallback for un-flattened entities (e.g. backlink targets)
    for (const k of ["integer", "float", "decimal", "text"] as const) {
      if (v?.[k] != null && v[k] !== "") {
        const n = Number(v[k]);
        if (Number.isFinite(n)) return n;
      }
    }
    // Property was present but unreadable — treat as "scored, value unknown"
    return null;
  }
  return null;
}

function hasScore(p: any): boolean {
  const values = p?.values;
  if (!Array.isArray(values)) return false;
  for (const v of values) {
    if (String(v?.propertyId ?? "") === SCORE_PROPERTY_ID) return true;
  }
  return false;
}

function getBacklinkCount(p: any): number {
  // backlinks comes from the GraphQL `backlinks(first: 100)` field — capped at 100.
  // searchEntities_w_backlinks flattens it; searchEntities leaves it as `{ nodes }`.
  const bl = p?.backlinks;
  if (Array.isArray(bl)) return Math.min(bl.length, 100);
  const nodes = bl?.nodes;
  if (Array.isArray(nodes)) return Math.min(nodes.length, 100);
  return 0;
}

function getDataCount(p: any): number {
  const vlen = Array.isArray(p?.values) ? p.values.length : 0;
  const rlen = Array.isArray(p?.relations) ? p.relations.length : 0;
  return vlen + rlen;
}

function getCreatedAtNumeric(p: any): number {
  const c = p?.createdAt;
  if (c == null) return Number.POSITIVE_INFINITY; // unknown age sorts last
  const n = Number(c);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

/**
 * Builds the comparator used to sort filtered candidates worst-first → best-first
 * is a misnomer; `Array.sort` with this comparator places the BEST candidate at
 * index 0. Returns negative when a should be ranked higher (earlier) than b.
 *
 * `canonicalName` is passed only so the [BOTH_SCORED] warning can include it.
 */
function buildPriorityComparator(ctx: ScoringContext, canonicalName: string): (a: any, b: any) => number {
  return (a: any, b: any): number => {
    // 1. canonical space
    const aCs = isCanonicalSpace(a, ctx);
    const bCs = isCanonicalSpace(b, ctx);
    if (aCs !== bCs) return aCs ? -1 : 1;

    // 2. canonical topic
    const aCt = isCanonicalTopic(a);
    const bCt = isCanonicalTopic(b);
    if (aCt !== bCt) return aCt ? -1 : 1;

    // 3. featured
    const aFt = isFeatured(a);
    const bFt = isFeatured(b);
    if (aFt !== bFt) return aFt ? -1 : 1;

    // 4. scored
    const aHs = hasScore(a);
    const bHs = hasScore(b);
    if (aHs !== bHs) return aHs ? -1 : 1;
    if (aHs && bHs) {
      const aScore = getScore(a) ?? 0;
      const bScore = getScore(b) ?? 0;
      // Both candidates have a score — emit a structured warning so we can
      // surface these for Armando's review in the daily report.
      const higher = aScore >= bScore ? a : b;
      const lower  = aScore >= bScore ? b : a;
      const higherScore = aScore >= bScore ? aScore : bScore;
      const lowerScore  = aScore >= bScore ? bScore : aScore;
      try {
        console.warn(JSON.stringify({
          event: "BOTH_SCORED",
          canonical: canonicalName,
          picked_id: higher.id,
          picked_score: higherScore,
          other_id: lower.id,
          other_score: lowerScore,
        }));
      } catch { /* logging best-effort */ }
      if (aScore !== bScore) return aScore > bScore ? -1 : 1;
      // identical scores — fall through to next rule
    }

    // 5. curated
    const aCu = isCurated(a);
    const bCu = isCurated(b);
    if (aCu !== bCu) return aCu ? -1 : 1;

    // 6. backlinks
    const aBl = getBacklinkCount(a);
    const bBl = getBacklinkCount(b);
    if (aBl !== bBl) return bBl - aBl;

    // 7. data count
    const aDc = getDataCount(a);
    const bDc = getDataCount(b);
    if (aDc !== bDc) return bDc - aDc;

    // 8. age — older wins
    const aAge = getCreatedAtNumeric(a);
    const bAge = getCreatedAtNumeric(b);
    if (aAge !== bAge) return aAge - bAge;

    // 9. UUID floor
    return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
  };
}

/**
 * Apply the filters + priority comparator to an array of name-matching
 * candidates. Returns the chosen entity, or undefined if every candidate was
 * filtered out. Centralised so both the exact-name fast path and the fuzzy
 * fallback can share the logic.
 *
 * `isValid` is the type/sources check from the caller's closure — kept as the
 * first filter because it depends on per-call state (existingSources).
 */
function selectBestCandidate(
  candidates: any[],
  ctx: ScoringContext,
  isValid: (p: any) => boolean,
  canonicalName: string,
): any | undefined {
  if (!Array.isArray(candidates) || candidates.length === 0) return undefined;
  const filtered: any[] = [];
  for (const p of candidates) {
    if (!isValid(p)) continue;
    if (isInDatasetSpace(p)) continue;
    if (isInPersonalSpace(p, ctx)) continue;
    filtered.push(p);
  }
  if (filtered.length === 0) return undefined;
  if (filtered.length === 1) return filtered[0];
  filtered.sort(buildPriorityComparator(ctx, canonicalName));
  return filtered[0];
}

export function buildEntityCached(
  row: any,
  breakdown: any,
  spaceId: string,
  tables: Record<string, any[]>,
  geoEntities: Record<string, any[]>,
  cache: Record<string, Record<string, any>>,
  scoringContext: ScoringContext = EMPTY_SCORING_CONTEXT,
): any {

  const tableName = breakdown.table;

  // --- cache check (by PG row.id) ---
  cache[tableName] = cache[tableName] || {};
  if (cache[tableName][row.id]) {
    return cache[tableName][row.id];
  }

  // --- cache check (by normalized name) ---
  // Different PG rows can collapse to the same canonical name. Example: tags 17339
  // "U.S.-Iran conflict" (hyphen) and 19302 "U.S.–Iran conflict" (em-dash) both
  // normalize to "usiran conflict". The row.id cache above can't catch these
  // because the ids differ. Without this secondary cache, two rows with the same
  // canonical name produce two distinct entity objects with two random
  // internal_ids; if neither resolves to an existing Geo entity via the
  // geoEntities lookup (e.g. the first time the canonical is published), both
  // get minted as new entities → within-run duplicate.
  //
  // Safe for nameless entity types (e.g. claim_relation, where value_fields=[]):
  // the `if (row.name)` guard below falls through to existing row.id behavior
  // unchanged — no regression for entities that don't have a name.
  const nameCacheKey = `__name__${tableName}`;
  cache[nameCacheKey] = cache[nameCacheKey] || {};
  if (row.name) {
    const localNameKey = normalizeName(row.name);
    if (localNameKey && cache[nameCacheKey][localNameKey]) {
      return cache[nameCacheKey][localNameKey];
    }
  }

  let geo_id: string | null = null;
  let entityOnGeo: any = null;

  const geoRows = geoEntities[tableName] ?? [];


  const existingSources: any[] = [];
  let match: any;
  let sourceMatch;

  // TODO - 
  // Filter to see whether there are sources relations being passed in [look at all sourced in the list]
  // - If so, look to see whether those source entities exist on Geo
  // - if so check for the source_db_identifier
  // If not, remove any entiites that have sources relations to those source entities already
  // Then check for a type + url property or type + name match in the remaining set of entities
  // IF entity exists on Geo then...
  // - CHECK AND SEE WHETHER RELATION ENTITIES EXIST ON GEO IF THIS ENTITY EXISTS ON GEO

  // --- build values ---
  const values = (breakdown.value_fields ?? []).flatMap((field: string) => {
    const val = row[field];
    if (val == null) return [];

    const dataType = propertyToDataTypeMap[field] || "text";
    let formattedValue: any;

    // Format value based on data type
    if (dataType === "float64" || dataType === "float") {
      formattedValue = typeof val === "number" ? val : parseFloat(val);
    } else if (dataType === "int64" || dataType === "integer64" || dataType === "integer") {
      formattedValue = typeof val === "number" ? val : parseInt(val, 10);
    } else if (dataType === "boolean") {
      formattedValue = typeof val === "boolean" ? val : val === "true" || val === true;
    } else if (dataType === "date") {
      // Keep as ISO string for dates
      formattedValue = typeof val === "object" && val instanceof Date
        ? val.toISOString().split('T')[0]  // Just the date part: YYYY-MM-DD
        : String(val);
    } else if (dataType === "datetime") {
      formattedValue = typeof val === "object" && val instanceof Date
        ? val.toISOString()
        : String(val);
    } else if (dataType === "time") {
      // Extract just the time part with timezone: HH:MM:SS.sssZ
      if (typeof val === "object" && val instanceof Date) {
        formattedValue = val.toISOString().split('T')[1]; // e.g., "08:00:00.000Z"
      } else if (typeof val === "string" && val.includes("T")) {
        formattedValue = val.split("T")[1]; // Extract time from ISO string
      } else {
        formattedValue = String(val);
      }
    } else {
      // Default to string for text and other types
      formattedValue = typeof val === "object" && val instanceof Date
        ? val.toISOString()
        : String(val);
    }

    return [{
      spaceId,
      property: propertyToIdMap[field],
      value: formattedValue,
      type: dataType,
    }];
  });

   // 🔹 STEP 1: Separate out source-type relations
  const sourceRelations = (breakdown.relations ?? []).filter(
    (rel: any) => rel.type === "sources"
  );
  const otherRelations = (breakdown.relations ?? []).filter(
    (rel: any) => rel.type !== "sources"
  );
  
  // --- build relations (handles both toEntity and entity sides) ---
  const relations = (sourceRelations ?? []).flatMap((rel: any) => {
    //const relatedItems = row[rel.type] ?? []; // now [{ to_id, entity_id }, ...]
    const relatedItems = Array.isArray(row[rel.type]) ? row[rel.type] : row[rel.type] ? [row[rel.type]] : []; // now [{ to_id, entity_id }, ...]
      return relatedItems.flatMap((relatedItem: any) => {
        if (rel.image) {
          //console.log(`${rel.type} IMAGE FOUND`, relatedItem)
          return [
            {
              spaceId,
              type: propertyToIdMap[rel.type],
              toEntity: {
                internal_id: IdUtils.generate(),
                id: null,
                entityOnGeo: null,
                name: relatedItem,
                values: [],
                relations: [],
              },
              entity: null,
            },
          ];

        } else {

          const { to_id, entity_id } = relatedItem;

          // Build a scoped copy of geoEntities
          let scopedGeoEntities = geoEntities;

          // --- NEW: narrow geoEntities if needed ---
          if ((rel.type != "sources") && (rel.toEntityBreakdown?.not_unique && match)) {
            const allowedIds = new Set(
              (match.relations ?? [])
                .filter(r => r?.toEntityId)
                .map(r => String(r.toEntityId))
            );

            // shallow clone geoEntities, but replace only the relevant table with filtered subset
            scopedGeoEntities = {
              ...geoEntities,
              [rel.toEntityBreakdown.table]: (geoEntities[rel.toEntityBreakdown.table] ?? []).filter(
                g => allowedIds.has(String(g.id))
              ),
            };
          }
          if ((rel.type != "sources") && (rel.toEntityBreakdown?.not_unique && !match)) {
            scopedGeoEntities = {
              ...geoEntities,
              [rel.toEntityBreakdown.table]: [],
            };
          }

          // lookup the child entity using to_id
          const relatedRow = tables[rel.toEntityBreakdown.table].find(
          (r: any) => r.id == to_id
          );
          if (!relatedRow) return [];

          // build toEntity side
          const childEntity = buildEntityCached(
              relatedRow,
              rel.toEntityBreakdown,
              spaceId,
              tables,
              scopedGeoEntities,
              cache,
              scoringContext,
          );

          // build entity side if entityBreakdown is provided
          let entitySide: any = null;
          if (rel.entityBreakdown) {
              const entityRow = tables[rel.entityBreakdown.table].find(
                  (r: any) => r.id == entity_id
              );
              if (entityRow) {
                  entitySide = buildEntityCached(
                  entityRow,
                  rel.entityBreakdown,
                  spaceId,
                  tables,
                  geoEntities,
                  cache,
                  scoringContext,
                  );
              }
          }


          if (rel.type == "sources" && childEntity.entityOnGeo) { //Todo - Check that this doesnt pull anything in if the child entity is empty (even if it just has a type...)
              //console.log("SOURCE FOUND")
              const hasSourceDbIdentifier = childEntity?.entityOnGeo?.values?.some(
                v => v.propertyId === String(propertyToIdMap["source_db_identifier"])
              );
              if (hasSourceDbIdentifier) {
                existingSources.push(childEntity.entityOnGeo.id)
              }
              
              //console.log(childEntity.entityOnGeo)
              if (!match) {                  
                  const sourceTypeId = String(propertyToIdMap["sources"]);
                  const sourceDbPropId = String(propertyToIdMap["source_db_identifier"]);
                  const sourceDbValue = String(
                    entitySide?.values?.find(v => String(v.property) == sourceDbPropId)?.value || ""
                  );
                  match = geoRows.find(p =>
                      p.relations?.some(r =>
                          String(r.typeId) == sourceTypeId &&
                          String(r.toEntityId) == String(childEntity.entityOnGeo.id) &&
                          Array.isArray(r?.entity?.values) &&
                          r.entity.values.some(v =>
                              String(v.propertyId) == sourceDbPropId &&
                              String(v.value) == sourceDbValue
                          )
                      )
                  );
              }
              
          }
          

      return [
        {
          spaceId,
          type: propertyToIdMap[rel.type],
          toEntity: childEntity,
          entity: entitySide,
        },
      ];
      }
    });
});

  // --- type relations ---
  for (const type of breakdown.types) {
    relations.push({
      spaceId,
      type: SystemIds.TYPES_PROPERTY,
      toEntity: {
        internal_id: IdUtils.generate(),
        id: type,
        entityOnGeo: null,
        name: null,
        values: [],
        relations: [],
      },
      entity: null,
    });
  }

  //TODO - Instead of exact name match, check for url properties first...
  // Can get this from the values array matching against the other values array in the geoAPI response. This is the area that I can do a confidence score matching like chatGPT recommended

// 2. Match on URL + property
if (!match) {
  /*
  const localUrls = extractUrls(values, false);

  match = geoRows.find(p => {
    const apiUrls = extractUrls(p.values, true);

    return (
      // must have correct type
      p.relations?.some(r =>
        String(r.typeId) == String(SystemIds.TYPES_PROPERTY) &&
        String(r.toEntityId) == String(breakdown.types[0])
      ) &&

      // must not have a source already in existingSources
      p.relations?.every(r =>
        !(String(r.typeId) == String(normalizeToUUID(propertyToIdMap["sources"])) &&
          existingSources.includes(String(r.toEntityId)))
      ) &&

      // must share a URL AND property
      localUrls.some(local =>
        apiUrls.some(api => String(api.url) == String(local.url) && String(api.propertyId) == String(local.propertyId))
      )
    );
  });
  */
  const localUrls = extractUrls(values, false);

  match = geoRows.find(p => {
    const apiUrls = extractUrls(p.values, true);

    return (
      // must have correct type
      p.relations?.some(r =>
        String(r.typeId) === String(SystemIds.TYPES_PROPERTY) &&
        String(r.toEntityId) === String(breakdown.types[0])
      ) &&

      // must not have a source already in existingSources
      p.relations?.every(r =>
        !(
          String(r.typeId) === String(propertyToIdMap["sources"]) &&
          existingSources.includes(String(r.toEntityId))
        )
      ) &&

      // must share a URL AND property (normalized!)
      localUrls.some(local =>
        apiUrls.some(api =>
          normalizeUrl_for_matching(api.url) === normalizeUrl_for_matching(local.url) &&
          String(api.propertyId) === String(local.propertyId)
        )
      )
    );
  });
  //console.log(localUrls);
}

// 3. Match on name similarity
if (!match && row.name) {
    const localName = normalizeName(row.name);

    // Helper: check type validity + exclude existingSources + URL/property alignment
    const isValidCandidate = (p: any): boolean => {
        // enforce type + exclude existingSources
        const valid =
            p.relations?.some(r =>
                String(r.typeId) == String(SystemIds.TYPES_PROPERTY) &&
                String(r.toEntityId) == String(breakdown.types[0])
            ) &&
            p.relations?.every(r =>
                !(String(r.typeId) == String(propertyToIdMap["sources"]) &&
                existingSources.includes(String(r.toEntityId)))
            );

        if (!valid) return false;

        // check URL/property alignment
        for (const localVal of values) {
            if (typeof localVal.value !== "string") continue;

            const localIsUrl = (
                /^https?:\/\//i.test(String(localVal.value)) ||
                /\.(com|org|net|io|co|fm)$/i.test(String(localVal.value))
            );
            if (!localIsUrl) continue;

            const apiVal = p.values?.find(v =>
                String(v.propertyId) === String(localVal.property)
            );

            if (apiVal && typeof apiVal.value === "string") {
                const apiIsUrl = (
                    /^https?:\/\//i.test(String(apiVal.value)) ||
                    /\.(com|org|net|io|co|fm)$/i.test(String(apiVal.value))
                );

                if (apiIsUrl) {
                    const localNorm = normalizeUrl_for_matching(localVal.value);
                    const apiNorm   = normalizeUrl_for_matching(apiVal.value);

                    if (localNorm !== apiNorm) {
                        return false; // URL mismatch
                    }
                }
            }
        }

        return true;
    };

    // --- Fast path: O(1) exact normalized-name lookup via index ---
    // When multiple Geo entities share the same canonical name, we no longer
    // pick "whichever pagination delivered first". Instead we apply the
    // deterministic priority rules (see selectBestCandidate above): personal
    // and dataset-space entities are filtered out, then survivors are sorted
    // by canonical-space → canonical-topic → featured → scored → curated →
    // backlinks → data count → age → UUID. Same data, same pick, every run.
    if (localName) {
        const nameIndex = getGeoNameIndex(geoRows);
        const exactCandidates = nameIndex.get(localName);
        if (exactCandidates && exactCandidates.length > 0) {
            const chosen = selectBestCandidate(
                exactCandidates,
                scoringContext,
                isValidCandidate,
                localName,
            );
            if (chosen) match = chosen;
        }
    }

    // --- Slow path: fuzzy scan fallback (only when exact lookup found nothing) ---
    if (!match && localName && !breakdown.skip_fuzzy_match) {
        let bestScore = 0;
        let bestMatch: any = null;

        for (const p of geoRows) {
            if (!isValidCandidate(p)) continue;

            const apiName = normalizeName(p.name);
            // Skip exact matches — already handled by index lookup above
            if (apiName === localName) continue;

            const score = stringSimilarity(localName, apiName);

            if (score > bestScore) {
                bestScore = score;
                bestMatch = p;
            }
        }

        if (bestScore > 0.9) match = bestMatch; // adjust threshold as needed
    }
}

  if (match) {
    geo_id = match.id;
    entityOnGeo = match;
  }

  const other_relations = (otherRelations ?? []).flatMap((rel: any) => {
      //const relatedItems = row[rel.type] ?? []; // now [{ to_id, entity_id }, ...]
      const relatedItems = Array.isArray(row[rel.type]) ? row[rel.type] : row[rel.type] ? [row[rel.type]] : []; // now [{ to_id, entity_id }, ...]
        return relatedItems.flatMap((relatedItem: any) => {
          if (rel.image) {
            //console.log(`${rel.type} IMAGE FOUND`, relatedItem)
            return [
              {
                spaceId,
                type: propertyToIdMap[rel.type],
                toEntity: {
                  internal_id: IdUtils.generate(),
                  id: null,
                  entityOnGeo: null,
                  name: relatedItem,
                  values: [],
                  relations: [],
                },
                entity: null,
              },
            ];

          } else {

            const { to_id, entity_id } = relatedItem;

            // Build a scoped copy of geoEntities
            let scopedGeoEntities = geoEntities;

            // --- NEW: narrow geoEntities if needed ---
            if ((rel.type != "sources") && (rel.toEntityBreakdown?.not_unique && match)) {
              const allowedIds = new Set(
                (match.relations ?? [])
                  .filter(r => r?.toEntityId)
                  .map(r => String(r.toEntityId))
              );

              // shallow clone geoEntities, but replace only the relevant table with filtered subset
              scopedGeoEntities = {
                ...geoEntities,
                [rel.toEntityBreakdown.table]: (geoEntities[rel.toEntityBreakdown.table] ?? []).filter(
                  g => allowedIds.has(String(g.id))
                ),
              };
            }
            if ((rel.type != "sources") && (rel.toEntityBreakdown?.not_unique && !match)) {
              scopedGeoEntities = {
                ...geoEntities,
                [rel.toEntityBreakdown.table]: [],
              };
            }

            // lookup the child entity using to_id
            const relatedRow = tables[rel.toEntityBreakdown.table].find(
            (r: any) => r.id == to_id
            );
            if (!relatedRow) return [];

            // build toEntity side
            const childEntity = buildEntityCached(
                relatedRow,
                rel.toEntityBreakdown,
                spaceId,
                tables,
                scopedGeoEntities,
                cache,
                scoringContext,
            );

            // build entity side if entityBreakdown is provided
            let entitySide: any = null;
            if (rel.entityBreakdown) {
                const entityRow = tables[rel.entityBreakdown.table].find(
                    (r: any) => r.id == entity_id
                );
                if (entityRow) {
                    entitySide = buildEntityCached(
                    entityRow,
                    rel.entityBreakdown,
                    spaceId,
                    tables,
                    geoEntities,
                    cache,
                    scoringContext,
                    );
                }
            }

            
            if (rel.type == "sources" && childEntity.entityOnGeo) { //Todo - Check that this doesnt pull anything in if the child entity is empty (even if it just has a type...)
                //console.log("SOURCE FOUND")
                const hasSourceDbIdentifier = childEntity?.entityOnGeo?.values?.some(
                  v => v.propertyId === String(propertyToIdMap["source_db_identifier"])
                );
                if (hasSourceDbIdentifier) {
                  existingSources.push(childEntity.entityOnGeo.id)
                }
                
                //console.log(childEntity.entityOnGeo)
                if (!match) {                  
                    const sourceTypeId = String(propertyToIdMap["sources"]);
                    const sourceDbPropId = String(propertyToIdMap["source_db_identifier"]);
                    const sourceDbValue = String(
                      entitySide?.values?.find(v => String(v.property) == sourceDbPropId)?.value || ""
                    );
                    match = geoRows.find(p =>
                        p.relations?.some(r =>
                            String(r.typeId) == sourceTypeId &&
                            String(r.toEntityId) == String(childEntity.entityOnGeo.id) &&
                            Array.isArray(r?.entity?.values) &&
                            r.entity.values.some(v =>
                                String(v.propertyId) == sourceDbPropId &&
                                String(v.value) == sourceDbValue
                            )
                        )
                    );
                }
                
            }
            

        return [
          {
            spaceId,
            type: propertyToIdMap[rel.type],
            toEntity: childEntity,
            entity: entitySide,
          },
        ];
        }
      });
  });
  relations.push(...other_relations)


  // --- final entity ---
  const entity = {
    internal_id: IdUtils.generate(),
    id: geo_id,
    entityOnGeo: entityOnGeo,
    name: row.name,
    values,
    relations,
  };

  // --- cache save (by PG row.id) ---
  cache[tableName][row.id] = entity;

  // --- cache save (by normalized name) ---
  // See the matching "cache check (by normalized name)" block above for rationale.
  if (row.name) {
    const localNameKey = normalizeName(row.name);
    if (localNameKey) cache[nameCacheKey][localNameKey] = entity;
  }

  return entity;
}


export function normalizeValue_grc_update(v: any): string {
  if (v.value) return String(v.value);     // input style
  if (v.text) return String(v.text);   // Geo API style
  if (v.integer) return String(v.integer);
  if (v.float) return String(v.float);
  if (v.decimal) return String(v.decimal);
  if (v.boolean) return String(v.boolean);
  if (v.date) return String(v.date);
  if (v.datetime) return String(v.datetime);
  if (v.time) return String(v.time);
  if (v.point) return String(v.point); //JSON.stringify(v.point); // if needed
  //if (v.unit !== undefined) return String(v.unit);
  //if (v.language !== undefined) return String(v.language);
  return "";
}


export function normalizeValue(v: any): any { //Todo normalize date, datetime, time
  if (v.value) return String(v.value);     // input style
  if (v.text) return String(v.text);   // Geo API style
  if (v.integer) return Number(v.integer);
  if (v.float) return Number(v.float);
  if (v.decimal) return Number(v.decimal);
  if (v.boolean) return Boolean(v.boolean);
  if (v.date) return String(v.date);
  if (v.datetime) return String(v.datetime);
  if (v.time) return String(v.time); 
  if (v.point) return String(v.point); //JSON.stringify(v.point); // if needed
  //if (v.unit !== undefined) return String(v.unit);
  //if (v.language !== undefined) return String(v.language);
  return "";
}
export function returnType(v: any): string { //Todo normalize date, datetime, time
  //if (v.value) return String(v.value);     // input style
  if (v.text) return "text";   // Geo API style
  if (v.integer) return "integer";
  if (v.float) return "float";
  if (v.decimal) return "decimal";
  if (v.boolean) return "boolean";
  if (v.date) return "date";
  if (v.datetime) return "datetime";
  if (v.time) return "time"; 
  if (v.point) return "point"; //JSON.stringify(v.point); // if needed
  //if (v.unit !== undefined) return String(v.unit);
  //if (v.language !== undefined) return String(v.language);
  return "";
}

export function flattenEntity(entity: any): any {
  if (!entity) return null;

  return {
    ...entity,
    // flatten values
    values: (entity.values?.nodes ?? []).map((v: any) => ({
      spaceId: v.spaceId,
      propertyId: v.propertyId,
      value: normalizeValue(v),
      type: returnType(v),
    })),
    // flatten relations recursively
    relations: (entity.relations?.nodes ?? []).map((r: any) => ({
      ...r,
      entity: r.entity ? flattenEntity(r.entity) : null,
    })),
  };
}

export function flatten_api_response(response: any[]): any[] {
  if (!Array.isArray(response)) return [];
  return response.map(item => ({
    ...item,
    values: (item.values?.nodes ?? []).map((v: any) => ({
      spaceId: v.spaceId,
      propertyId: v.propertyId,
      value: normalizeValue(v),
      type: returnType(v),
    })),
    relations: (item.relations?.nodes ?? []).map((r: any) => ({
      ...r,
      entity: r.entity ? flattenEntity(r.entity) : null,
    })),
  }));
}

export function flatten_api_response_w_backlinks(response: any[]): any[] {
  if (!Array.isArray(response)) return [];
  return response.map(item => ({
    ...item,
    values: (item.values?.nodes ?? []).map((v: any) => ({
      spaceId: v.spaceId,
      propertyId: v.propertyId,
      value: normalizeValue(v),
      type: returnType(v),
    })),
    relations: (item.relations?.nodes ?? []).map((r: any) => ({
      ...r,
      entity: r.entity ? flattenEntity(r.entity) : null,
    })),
    backlinks: (item.backlinks?.nodes ?? []).map((r: any) => ({
      ...r,
      entity: r.entity ? flattenEntity(r.entity) : null,
    })),
  }));
}





// --- Search Helpers ---

const mainnet_query_url = "https://hypergraph.up.railway.app/graphql";
//const testnet_query_url = "https://geo-conduit.up.railway.app/graphql";
//const testnet_query_url = "https://hypergraph-v2-testnet.up.railway.app/graphql"
const testnet_query_url = "https://api-testnet.geobrowser.io/graphql"
const testnet_query_url_grc_update = "https://testnet-api.geobrowser.io/graphql"
const QUERY_URL = testnet_query_url_grc_update;

export async function fetchWithRetry(query: string, variables: any, retries = 5, delay = 1000, timeout = 30000) {
    for (let i = 0; i < retries; i++) {
        let response: Response;
        try {
            response = await fetch(QUERY_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ query, variables }),
                signal: AbortSignal.timeout(timeout),
            });
        } catch (err: any) {
            // Network-level errors (socket closed, DNS failure, timeout, etc.)
            if (i < retries - 1) {
                const jitteredDelay = delay * (2 ** i) * (0.5 + Math.random() * 0.5);
                console.log(`Retry # ${i} (network error: ${err.message}), waiting ${Math.round(jitteredDelay)}ms`);
                await new Promise(resolve => setTimeout(resolve, jitteredDelay));
                continue;
            }
            console.error(`fetchWithRetry failed after ${retries} retries (network error: ${err.message}):\n  Variables: ${JSON.stringify(variables)}\n  Query: ${query}`);
            throw err;
        }

        if (response.ok) {
            const json = await response.json();
            // Detect GraphQL-level errors that return HTTP 200 but null data
            if (json.errors && !json.data) {
                const errMsg = `GraphQL errors with null data: ${JSON.stringify(json.errors)}`;
                if (i < retries - 1) {
                    const jitteredDelay = delay * (2 ** i) * (0.5 + Math.random() * 0.5);
                    console.log(`Retry # ${i} (GraphQL error), waiting ${Math.round(jitteredDelay)}ms: ${errMsg}`);
                    await new Promise(resolve => setTimeout(resolve, jitteredDelay));
                    continue;
                }
                console.error(`fetchWithRetry failed after ${retries} retries (GraphQL error): ${errMsg}`);
                throw new Error(errMsg);
            }
            return json;
        }

        if (i < retries - 1) {
            if (response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504) {
                const jitteredDelay = delay * (2 ** i) * (0.5 + Math.random() * 0.5);
                console.log(`Retry # ${i} (status ${response.status}), waiting ${Math.round(jitteredDelay)}ms`);
                await new Promise(resolve => setTimeout(resolve, jitteredDelay));
            } else {
                console.error(`fetchWithRetry failed (status ${response.status}):\n  Variables: ${JSON.stringify(variables)}\n  Query: ${query}`);
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
        } else {
            console.error(`fetchWithRetry failed after ${retries} retries (status ${response.status}):\n  Variables: ${JSON.stringify(variables)}\n  Query: ${query}`);
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
    }
}



export async function searchEntities_old({
  name, // Note: For V1, can assume always have name and type, but it is possible that there will not be a name to associate this with? 
  type,
  spaceId,
  property,
  searchText,
  typeId,
  notTypeId
}: {
  name?: string;
  type: string[];
  spaceId?: string[];
  property?: string;
  searchText?: string | string[];
  typeId?: string;
  notTypeId?: string;
}) {
  
  await new Promise(resolve => setTimeout(resolve, 200));

  const query = `
    query GetEntities(
      ${name ?  '$name: String!': ''}
      ${spaceId ? '$spaceId: [UUID!]' : ''}
      $type: [UUID!]
    ) {
      entities(
        filter: {
          ${name ? 'name: {isInsensitive: $name},' : ''}  
          ${spaceId ? 'spaceIds: {containedBy: $spaceId},' : ''}  
          relations: {some: {typeId: {is: "8f151ba4-de20-4e3c-9cb4-99ddf96f48f1"}, toEntityId: {in: $type}}},
        }
      ) {
        id
        name
        values {
            nodes {
                spaceId
                propertyId
                string
                language
                time
                number
                unit
                boolean
                point
            }
        }
        relations {
            nodes {
                id
                spaceId
                fromEntityId
                toEntityId
                typeId
                verified
                position
                toSpaceId
                entityId
                entity {
                  id
                  name
                  values {
                      nodes {
                          spaceId
                          propertyId
                          string
                          language
                          time
                          number
                          unit
                          boolean
                          point
                      }
                  }
                  relations {
                      nodes {
                          id
                          spaceId
                          fromEntityId
                          toEntityId
                          typeId
                          verified
                          position
                          toSpaceId
                          entityId
                      }
                  }
                }
            }
        }
      }
    }
  `;


  const variables: Record<string, any> = {
    name: name,
    type: type,
    spaceId: spaceId
  };


  const data = await fetchWithRetry(query, variables);
  const entities = data?.data?.entities;
  return entities

  if (entities?.length === 1) {
    return entities[0]?.id;
  } else if (entities?.length > 1) {
    console.error("DUPLICATE ENTITIES FOUND...");
    console.log(entities);
    return entities[0]?.id;
  }

  return null;
}

export async function searchEntities({
  name, // Note: For V1, can assume always have name and type, but it is possible that there will not be a name to associate this with?
  type,
  spaceId,
  property,
  searchText,
  typeId,
  notTypeId
}: {
  name?: string;
  type: string[];
  spaceId?: string[];
  property?: string;
  searchText?: string | string[];
  typeId?: string;
  notTypeId?: string;
}) {
  const PAGE_SIZES = [1000, 500, 250, 100];

  for (const pageSize of PAGE_SIZES) {
    try {
      let allEntities: any[] = [];
      let cursor: string | null = null;

      while (true) {
        await new Promise(resolve => setTimeout(resolve, 200));

        const query = `
          query GetEntities(
            ${name ?  '$name: String!': ''}
            ${spaceId ? '$spaceId: [UUID!]' : ''}
            $type: [UUID!]
            $first: Int!
            $after: Cursor
          ) {
            entitiesConnection(
              first: $first
              after: $after
              filter: {
                ${name ? 'name: {isInsensitive: $name},' : ''}
                ${spaceId ? 'spaceIds: {containedBy: $spaceId},' : ''}
                relations: {some: {typeId: {is: "8f151ba4de204e3c9cb499ddf96f48f1"}, toEntityId: {in: $type}}},
              }
            ) {
              totalCount
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                id
                name
                spaceIds
                createdAt
                values {
                    nodes {
                        spaceId
                        propertyId
                        text
                        language
                        date
                        datetime
                        time
                        integer
                        float
                        decimal
                        unit
                        boolean
                        point
                    }
                }
                relations(first: 1000) {
                    nodes {
                        id
                        spaceId
                        fromEntityId
                        toEntityId
                        typeId
                        verified
                        position
                        toSpaceId
                        entityId
                        entity {
                          id
                          name
                          values {
                              nodes {
                                  spaceId
                                  propertyId
                                  text
                                  language
                                  date
                                  datetime
                                  time
                                  integer
                                  float
                                  decimal
                                  unit
                                  boolean
                                  point
                              }
                          }
                          relations {
                              nodes {
                                  id
                                  spaceId
                                  fromEntityId
                                  toEntityId
                                  typeId
                                  position
                                  toSpaceId
                                  entityId
                              }
                          }
                        }
                    }
                }
                backlinks(first: 100) {
                    nodes {
                        id
                    }
                }
              }
            }
          }
        `;

        const variables: Record<string, any> = {
          name: name,
          type: type,
          spaceId: spaceId,
          first: pageSize,
          after: cursor
        };

        if (cursor === null) {
          console.log(`  searchEntities starting for types: ${type.join(', ')} (page size: ${pageSize})`);
        }

        const data = await fetchWithRetry(query, variables);
        const connection = data?.data?.entitiesConnection;

        if (!connection) {
          throw new Error(
            `searchEntities: API returned null entitiesConnection ` +
            `(types: ${type.join(', ')}, pageSize: ${pageSize}, cursor: ${cursor}, ` +
            `errors: ${JSON.stringify(data?.errors ?? 'none')})`
          );
        }

        const entities = connection.nodes ?? [];
        const pageInfo = connection.pageInfo;
        const totalCount = connection.totalCount;

        allEntities = allEntities.concat(entities);
        console.log(`Fetched ${entities.length} entities (total so far: ${allEntities.length})`);

        if (!pageInfo?.hasNextPage) {
          // --- pagination integrity guard ---
          // The API can return `{nodes: [], hasNextPage: false}` mid-pagination
          // (e.g. under indexer pressure), which would silently terminate the loop
          // with a partial result. The caller (loadGeoEntities) would then build
          // an incomplete cache; subsequent buildEntityCached lookups would miss
          // existing entities and create duplicates. Throwing here lets the outer
          // PAGE_SIZES fallback retry with smaller pages or eventually surface
          // the issue rather than publishing silent dups. See May-12 episode
          // cascade in root_cause_analysis.md.
          if (typeof totalCount === "number" && allEntities.length < totalCount) {
            throw new Error(
              `searchEntities: silent pagination truncation — hasNextPage=false at ` +
              `${allEntities.length}/${totalCount} entities ` +
              `(types: ${type.join(', ')}, pageSize: ${pageSize})`
            );
          }
          break;
        }

        cursor = pageInfo.endCursor;
      }

      return allEntities;
    } catch (err) {
      const isLast = pageSize === PAGE_SIZES[PAGE_SIZES.length - 1];
      if (isLast) throw err;
      console.log(`searchEntities failed with page size ${pageSize}, reducing to ${PAGE_SIZES[PAGE_SIZES.indexOf(pageSize) + 1]}...`);
    }
  }

  return [];
}


export async function searchEntities_w_backlinks({
  name, // Note: For V1, can assume always have name and type, but it is possible that there will not be a name to associate this with?
  type,
  spaceId,
  property,
  searchText,
  typeId,
  notTypeId
}: {
  name?: string;
  type: string[];
  spaceId?: string[];
  property?: string;
  searchText?: string | string[];
  typeId?: string;
  notTypeId?: string;
}) {
  const PAGE_SIZES = [1000, 500, 250, 100];

  for (const pageSize of PAGE_SIZES) {
    try {
      let allEntities: any[] = [];
      let cursor: string | null = null;

      while (true) {
        await new Promise(resolve => setTimeout(resolve, 200));

        const query = `
          query GetEntities(
            ${name ?  '$name: String!': ''}
            ${spaceId ? '$spaceId: [UUID!]' : ''}
            $type: [UUID!]
            $first: Int!
            $after: Cursor
          ) {
            entitiesConnection(
              first: $first
              after: $after
              filter: {
                ${name ? 'name: {isInsensitive: $name},' : ''}
                ${spaceId ? 'spaceIds: {containedBy: $spaceId},' : ''}
                relations: {some: {typeId: {is: "8f151ba4-de20-4e3c-9cb4-99ddf96f48f1"}, toEntityId: {in: $type}}},
              }
            ) {
              totalCount
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                id
                name
                values {
                    nodes {
                        spaceId
                        propertyId
                        text
                        language
                        date
                        datetime
                        time
                        integer
                        float
                        decimal
                        unit
                        boolean
                        point
                    }
                }
                relations(first: 1000) {
                  nodes {
                        id
                        spaceId
                        fromEntityId
                        toEntityId
                        typeId
                        verified
                        position
                        toSpaceId
                        entityId
                        entity {
                          id
                          name
                          values {
                              nodes {
                                  spaceId
                                  propertyId
                                  text
                                  language
                                  date
                                  datetime
                                  time
                                  integer
                                  float
                                  decimal
                                  unit
                                  boolean
                                  point
                              }
                          }
                          relations {
                              nodes {
                                  id
                                  spaceId
                                  fromEntityId
                                  toEntityId
                                  typeId
                                  position
                                  toSpaceId
                                  entityId
                            }
                          }
                        }
                  }
                }
                backlinks(first: 1000) {
                  nodes {
                        id
                        spaceId
                        fromEntityId
                        toEntityId
                        typeId
                        position
                        toSpaceId
                        entityId
                        entity {
                          id
                          name
                          values {
                              nodes {
                                  spaceId
                                  propertyId
                                  text
                                  language
                                  date
                                  datetime
                                  time
                                  integer
                                  float
                                  decimal
                                  unit
                                  boolean
                                  point
                              }
                          }
                          relations {
                              nodes {
                                  id
                                  spaceId
                                  fromEntityId
                                  toEntityId
                                  typeId
                                  position
                                  toSpaceId
                                  entityId
                            }
                          }
                        }
                  }
                }
              }
            }
          }
        `;

        const variables: Record<string, any> = {
          name: name,
          type: type,
          spaceId: spaceId,
          first: pageSize,
          after: cursor
        };

        if (cursor === null) {
          console.log(`  searchEntities_w_backlinks starting for types: ${type.join(', ')} (page size: ${pageSize})`);
        }

        const data = await fetchWithRetry(query, variables);
        const connection = data?.data?.entitiesConnection;

        if (!connection) {
          throw new Error(
            `searchEntities_w_backlinks: API returned null entitiesConnection ` +
            `(types: ${type.join(', ')}, pageSize: ${pageSize}, cursor: ${cursor}, ` +
            `errors: ${JSON.stringify(data?.errors ?? 'none')})`
          );
        }

        const entities = connection.nodes ?? [];
        const pageInfo = connection.pageInfo;
        const totalCount = connection.totalCount;

        allEntities = allEntities.concat(entities);
        console.log(`Fetched ${entities.length} entities with backlinks (total so far: ${allEntities.length})`);

        if (!pageInfo?.hasNextPage) {
          // --- pagination integrity guard (see searchEntities for full rationale) ---
          if (typeof totalCount === "number" && allEntities.length < totalCount) {
            throw new Error(
              `searchEntities_w_backlinks: silent pagination truncation — hasNextPage=false at ` +
              `${allEntities.length}/${totalCount} entities ` +
              `(types: ${type.join(', ')}, pageSize: ${pageSize})`
            );
          }
          break;
        }

        cursor = pageInfo.endCursor;
      }

      return allEntities;
    } catch (err) {
      const isLast = pageSize === PAGE_SIZES[PAGE_SIZES.length - 1];
      if (isLast) throw err;
      console.log(`searchEntities_w_backlinks failed with page size ${pageSize}, reducing to ${PAGE_SIZES[PAGE_SIZES.indexOf(pageSize) + 1]}...`);
    }
  }

  return [];
}

