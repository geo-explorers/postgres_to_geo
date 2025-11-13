import { v4 as uuidv4 } from 'uuid';
import * as fs from "fs";
import md5 from 'crypto-js/md5.js';
import {Id, Base58, SystemIds, Graph, Position, type Op, IdUtils} from "@graphprotocol/grc-20";
import dotenv from "dotenv";
import { validate as uuidValidate } from 'uuid';

import { propertyToIdMap, testnetWalletAddress } from './constants.ts';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { publish } from './publish.ts';

export const normalizeUrl = (url: string) =>
    url.endsWith('/') ? url.slice(0, -1) : url;

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
    let match;
    if (propType == "URL") {
        match = ops.find(op =>
            op.type === "UPDATE_ENTITY" &&
            Array.isArray(op.entity?.values) &&
            op.entity.values.some(
                (v: { property: string; value: string }) =>
                v.property == normalizeToUUID_STRING(property) &&
                normalizeUrl(v.value) == normalizeUrl(searchText)
            )
        );
    } else {
        match = ops.find(op =>
            op.type === "UPDATE_ENTITY" &&
            Array.isArray(op.entity?.values) &&
            op.entity.values.some(
                (v: { property: string; value: string }) =>
                v.property == normalizeToUUID_STRING(property) &&
                String(v.value)?.toLowerCase() == searchText?.toLowerCase()
            )
        );
    }

    
    
    if (match) {
        if (typeId) {
            const matchType = ops.find(op =>
                op.type == "CREATE_RELATION" &&
                op.relation.fromEntity == match?.entity?.id &&
                op.relation.type == SystemIds.TYPES_PROPERTY &&
                op.relation.toEntity == normalizeToUUID_STRING(typeId)
            );
            if (matchType) {
                //console.log("Match found", match.entity.id)
                return match.entity.id
            } else {
                return null
            }

        } else {
            return match.entity.id;
        }
    } else {
        return null
    }
}

export async function hasBeenEdited(ops: Array<Op>, entityId: string): Promise<boolean> {
    
    let match;
    match = ops.find(op =>
        op.type === "UPDATE_ENTITY" &&
        op.entity.id === normalizeToUUID_STRING(entityId)
    );

    if (match) {
        return true;
    }

    match = ops.find(op =>
        op.type === "CREATE_RELATION" &&
        op.relation.fromEntity === normalizeToUUID_STRING(entityId)
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
                item.spaceId === normalizeToUUID_STRING(spaceId) &&
                item.propertyId === normalizeToUUID_STRING(propertyId)
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
                item.spaceId === normalizeToUUID_STRING(spaceId) &&
                item.typeId === normalizeToUUID_STRING(propertyId)
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
        op.type === "CREATE_RELATION" &&
        op.relation.fromEntity === normalizeToUUID_STRING(fromEntityId) &&
        op.relation.type === normalizeToUUID_STRING(propertyId) &&
        op.relation.toEntity === normalizeToUUID_STRING(toEntityId)
    );
    if (match) {
        return { ops: ops, relationEntityId: match.relation.entity, position: match.relation.position };
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
                item.typeId == normalizeToUUID_STRING(propertyId) &&
                item.toEntityId == normalizeToUUID_STRING(toEntityId)
        );
        if (!geoProperties) {
            geoProperties = []
        }

        if (geoProperties.length == 0) {
            addOps = Graph.createRelation({
                toEntity: normalizeToUUID(toEntityId),
                fromEntity: normalizeToUUID(fromEntityId),
                type: normalizeToUUID(propertyId),
                position: position,
                entityId: normalizeToUUID(relationEntity)
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
            return { ops: ops, relationEntityId: relationEntity, position: geoProperties?.[0]?.position };
        }
    } else {
        //console.log("From entity: ", normalizeToUUID(fromEntityId))
        //console.log("To entity: ", normalizeToUUID(toEntityId))
        //console.log("Type: ", normalizeToUUID(propertyId))
        addOps = Graph.createRelation({
            toEntity: normalizeToUUID(toEntityId),
            fromEntity: normalizeToUUID(fromEntityId),
            type: normalizeToUUID(propertyId),
            position: position,
            entityId: normalizeToUUID(relationEntity)
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

export function printOps(ops: any, outputDir: string, fn: string) {
  //const outputDir = path.join(__dirname, '');
  console.log("NUMBER OF OPS: ", ops.length);

  if (ops.length > 0) {
    // Get existing filenames in the directory
    const existingFiles = fs.readdirSync(outputDir);

    // Create output text
    const outputText = JSON.stringify(ops, null, 2);

    // Write to file
    const filename = fn;
    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, outputText);

    console.log(`OPS PRINTED to ${filename}`);
  } else {
    console.log("NO OPS TO PRINT");
  }
}

export async function publishOps(ops: any) {
    if ((ops.length > 0) && (true)) {
        const iso = new Date().toISOString();
        let txHash;
        const spaces = await getSpaces(ops);
        

        for (const space of spaces) { 
          console.log(testnetWalletAddress)
            txHash = await publish({
                spaceId: space,
                author: testnetWalletAddress,
                editName: `Upload ${iso}`,
                ops: await filterOps(ops, space), // An edit accepts an array of Ops
            }, "TESTNET");
    
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
  value: string;
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

export function normalizeName(name: string = ""): string | null {
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
            r.typeId == normalizeToUUID(propertyToIdMap["sources"]) &&
            r.toEntity.name == rel.toEntity.name &&
            Array.isArray(r?.entity?.values) &&
            r.entity.values.some(v =>
              v.propertyId == normalizeToUUID(propertyToIdMap["source_db_identifier"]) &&
              v.value === rel.entity.values.filter(v => v.property == normalizeToUUID(propertyToIdMap["source_db_identifier"])).value
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

export function buildEntityCached(
  row: any,
  breakdown: any,
  spaceId: string,
  tables: Record<string, any[]>,
  geoEntities: Record<string, any[]>,
  cache: Record<string, Record<string, any>>
): any {
  const tableName = breakdown.table;

  // --- cache check ---
  cache[tableName] = cache[tableName] || {};
  if (cache[tableName][row.id]) {
    return cache[tableName][row.id];
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
    return val != null
      ? [{
          spaceId,
          property: normalizeToUUID(propertyToIdMap[field]),
          value:
            typeof val === "object" && val instanceof Date
              ? val.toISOString()
              : String(val),
        }]
      : [];
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
          console.log(`${rel.type} IMAGE FOUND`, relatedItem)
          return [
            {
              spaceId,
              type: normalizeToUUID(propertyToIdMap[rel.type]),
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
              cache
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
                  cache
                  );
              }
          }

          
          if (rel.type == "sources" && childEntity.entityOnGeo) { //Todo - Check that this doesnt pull anything in if the child entity is empty (even if it just has a type...)
              console.log("SOURCE FOUND")
              const hasSourceDbIdentifier = childEntity?.entityOnGeo?.values?.some(
                v => v.propertyId === String(normalizeToUUID(propertyToIdMap["source_db_identifier"]))
              );
              if (hasSourceDbIdentifier) {
                existingSources.push(childEntity.entityOnGeo.id)
              }
              
              //console.log(childEntity.entityOnGeo)
              if (!match) {                  
                  const sourceTypeId = String(normalizeToUUID(propertyToIdMap["sources"]));
                  const sourceDbPropId = String(normalizeToUUID(propertyToIdMap["source_db_identifier"]));
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
          type: normalizeToUUID(propertyToIdMap[rel.type]),
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

  console.log(localUrls);
}

// 3. Match on name similarity
if (!match && row.name) {
    const localName = normalizeName(row.name);
    let bestScore = 0;
    let bestMatch: any = null;

    for (const p of geoRows) {
        // enforce type + exclude existingSources
        const valid =
            p.relations?.some(r =>
                String(r.typeId) == String(SystemIds.TYPES_PROPERTY) &&
                String(r.toEntityId) == String(breakdown.types[0])
            ) &&
            p.relations?.every(r =>
                !(String(r.typeId) == String(normalizeToUUID(propertyToIdMap["sources"])) &&
                existingSources.includes(String(r.toEntityId)))
            );

        if (!valid) continue;

        // ✅ check URL/property alignment
        let mismatch = false;
        for (const localVal of values) {
            if (typeof localVal.value != "string") continue;
            const localIsUrl = (/^https?:\/\//i.test(String(localVal.value)) || /\.(com|org|net|io|co|fm)$/i.test(String(localVal.value)));
            if (!localIsUrl) continue;

            // look for same propertyId in API values
            const apiVal = p.values?.find(v => String(v.propertyId) === String(localVal.property));
            if (apiVal && typeof apiVal.value == "string") {
                const apiIsUrl = (/^https?:\/\//i.test(String(apiVal.value)) || /\.(com|org|net|io|co|fm)$/i.test(String(apiVal.value)));
                if (apiIsUrl && String(apiVal.value) != String(localVal.value)) {
                    mismatch = true; // same property, but URL differs
                    break;
                }
            }
        }
        if (mismatch) continue; // 🚫 reject this candidate

        const apiName = normalizeName(p.name);
        const score = stringSimilarity(localName, apiName);

        if (score > bestScore) {
            bestScore = score;
            bestMatch = p;
        }
    }

    console.log(bestScore);
    if (bestScore > 0.9) match = bestMatch; // adjust threshold as needed
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
            console.log(`${rel.type} IMAGE FOUND`, relatedItem)
            return [
              {
                spaceId,
                type: normalizeToUUID(propertyToIdMap[rel.type]),
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
                cache
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
                    cache
                    );
                }
            }

            
            if (rel.type == "sources" && childEntity.entityOnGeo) { //Todo - Check that this doesnt pull anything in if the child entity is empty (even if it just has a type...)
                console.log("SOURCE FOUND")
                const hasSourceDbIdentifier = childEntity?.entityOnGeo?.values?.some(
                  v => v.propertyId === String(normalizeToUUID(propertyToIdMap["source_db_identifier"]))
                );
                if (hasSourceDbIdentifier) {
                  existingSources.push(childEntity.entityOnGeo.id)
                }
                
                //console.log(childEntity.entityOnGeo)
                if (!match) {                  
                    const sourceTypeId = String(normalizeToUUID(propertyToIdMap["sources"]));
                    const sourceDbPropId = String(normalizeToUUID(propertyToIdMap["source_db_identifier"]));
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
            type: normalizeToUUID(propertyToIdMap[rel.type]),
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

  // --- cache save ---
  cache[tableName][row.id] = entity;

  return entity;
}



export function normalizeValue(v: any): string {
  if (v.value) return String(v.value);     // input style
  if (v.string) return String(v.string);   // Geo API style
  if (v.number) return String(v.number);
  if (v.boolean) return String(v.boolean);
  if (v.time) return String(v.time);
  if (v.point) return String(v.point); //JSON.stringify(v.point); // if needed
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
    })),
    // flatten relations recursively
    relations: (entity.relations?.nodes ?? []).map((r: any) => ({
      ...r,
      entity: r.entity ? flattenEntity(r.entity) : null,
    })),
  };
}

export function flatten_api_response(response: any[]): any[] {
  return response.map(item => ({
    ...item,
    values: (item.values?.nodes ?? []).map((v: any) => ({
      spaceId: v.spaceId,
      propertyId: v.propertyId,
      value: normalizeValue(v),
    })),
    relations: (item.relations?.nodes ?? []).map((r: any) => ({
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
const QUERY_URL = testnet_query_url;

export async function fetchWithRetry(query: string, variables: any, retries = 3, delay = 200) {
    //console.log("FETCHING...")
    for (let i = 0; i < retries; i++) {
        const response = await fetch(QUERY_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ query, variables }),
        });

        if (response.ok) {
           //console.log("DONE FETCHING")
            return await response.json();
        }

        if (i < retries - 1) {
            // Optional: only retry on certain error statuses
            console.log("Retry #", i)
            if (response.status === 502 || response.status === 503 || response.status === 504) {
                await new Promise(resolve => setTimeout(resolve, delay * (2 ** i))); // exponential backoff
            } else {
                break; // for other errors, don’t retry
            }
        } else {
            console.log("searchEntities");
            console.log(`SPACE: ${variables.space}; PROPERTY: ${variables.property}; searchText: ${variables.searchText}; typeId: ${variables.typeId}`);
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
    }
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

