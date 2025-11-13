import { Graph, SystemIds, type Op, type ValueDataType } from '@graphprotocol/grc-20';
import * as fs from "fs";
import { publish } from './src/publish.ts';
import { SPACE_IDS, propertyToIdMap, renderableTypeToIdMap, testnetWalletAddress, typeToIdMap } from './src/constants.ts';
import { addSpace, publishOps, normalizeToUUID } from "./src/functions.ts";
import path from "path";
import prettier from "prettier"; // optional, for nice formatting

function getMapRegex(mapName: string) {
  return new RegExp(
    `export const ${mapName}\\s*:\\s*Record<string, string>\\s*=\\s*({[\\s\\S]*?});`
  );
}

async function appendToMap(mapName: string, newEntries: Record<string, string>) {
  const constantsPath = path.resolve("./src/constants_v2.ts");
  let fileContent = fs.readFileSync(constantsPath, "utf-8");

  // Find the existing propertyToIdMap using a regex
  if (mapName == "propertyToIdMap") {

  }
  const mapRegex = getMapRegex(mapName);
  const match = fileContent.match(mapRegex);

  if (!match) {
    throw new Error(`Could not find ${mapName} in constants_v2.ts`);
  }

  // Parse existing map
  const existingMap: Record<string, string> = eval("(" + match[1] + ")");

  // Merge new entries
  const mergedMap = { ...existingMap, ...newEntries };

  // Convert back to string
  const newMapString = JSON.stringify(mergedMap, null, 2);

  // Replace old map in file content
  fileContent = fileContent.replace(mapRegex, `export const ${mapName}: Record<string, string> = ${newMapString};`);

  // Write back to file
  fs.writeFileSync(constantsPath, fileContent);
  //console.log(`✅ ${mapName} updated with new properties`);
}

const ops: Array<Op> = [];
let addOps;
const usd_id = "0d4d1b02-a9e8-4982-92c4-99b1d22cd430";
const unit_property = "11b06581-20d3-41ea-b570-2ef4ee0a4ffd";

type row = {
  types: string;
  name: string;
  type?: string;
  toEntityTypes?: string[] | null;
  relationEntityTypes?: string[] | null;
  renderableType?: string | null;
  format?: string | null;
  properties?: string[] | null;
};

const entities:row[] = [
  { types: "Type", name: "Podcast appearance", properties: ['roles'] },
  { types: "Property", name: "Listen on", type: "RELATION" as const, toEntityTypes: ["project"], renderableType: null },
  { types: "Property", name: "Hosts", type: "RELATION" as const, toEntityTypes: ["person"], relationEntityTypes: ["podcast_appearance"], renderableType: null },
  { types: "Property", name: "Guests", type: "RELATION" as const, toEntityTypes: ["person"], relationEntityTypes: ["podcast_appearance"], renderableType: null },
  { types: "Property", name: "Contributors", type: "RELATION" as const, toEntityTypes: ["person"], relationEntityTypes: ["podcast_appearance"], renderableType: null },
  { types: "Property", name: "Episode number", type: "NUMBER" as const, toEntityTypes: [], renderableType: null },
  { types: "Property", name: "Air date", type: "TIME" as const, toEntityTypes: [], renderableType: null, format: "MMMM d, yyyy" },
  { types: "Property", name: "Audio URL", type: "STRING" as const, toEntityTypes: [], renderableType: "url" },
  { types: "Property", name: "Duration", type: "NUMBER" as const, toEntityTypes: [], renderableType: null },
  { types: "Property", name: "RSS Feed URL", type: "STRING" as const, toEntityTypes: [], renderableType: "url" },
  { types: "Property", name: "Explicit", type: "BOOLEAN" as const, toEntityTypes: [], renderableType: null },
  { types: "Property", name: "Topics", type: "RELATION" as const, toEntityTypes: ['topic'], renderableType: null },
  { types: "Type", name: "Podcast", properties: ['name', 'avatar', 'description', 'date_founded', 'explicit', 'listen_on', 'hosts', 'topics', 'web_url', 'x_url', 'sources'] },
  { types: "Property", name: "Podcast", type: "RELATION" as const, toEntityTypes: ["podcast"], renderableType: null },
  { types: "Property", name: "Source database key", type: "STRING" as const, toEntityTypes: [], renderableType: null },
  { types: "Property", name: "Attributed to", type: "RELATION" as const, toEntityTypes: [], renderableType: null },
  { types: "Property", name: "Targets", type: "RELATION" as const, toEntityTypes: [], renderableType: null },
  { types: "Property", name: "Start offset", type: "NUMBER" as const, toEntityTypes: [], renderableType: null },
  { types: "Property", name: "End offset", type: "NUMBER" as const, toEntityTypes: [], renderableType: null },
  { types: "Type", name: "Selector", properties: ['start_offset', 'end_offset'] },
  { types: "Property", name: "Notable quotes", type: "RELATION" as const, toEntityTypes: ['quote'], renderableType: null },
  { types: "Property", name: "Notable claims", type: "RELATION" as const, toEntityTypes: ['claim'], renderableType: null },
  { types: "Property", name: "Broader topics", type: "RELATION" as const, toEntityTypes: ['topic'], renderableType: null },
  { types: "Property", name: "Subtopics", type: "RELATION" as const, toEntityTypes: ['topic'], renderableType: null },
  { types: "Type", name: "Episode", properties: ['name', 'avatar', 'description', 'air_date', 'podcast', 'episode_number', 'listen_on', 'hosts', 'guests', 'contributors', 'notable_quotes', 'notable_claims', 'topics', 'sources'] },
];

const newPropertyIds: Record<string, string> = {};
const newTypeIds: Record<string, string> = {};

for (const entity of entities) {
    const key = entity.name.toLowerCase().replace(/\s+/g, "_");
    if (entity.types == 'Property') {
        
        if (!propertyToIdMap[key]) {
            const mappedTypes = entity.toEntityTypes
                ?.map(typeName => typeToIdMap[typeName])   // get the ID from the map
                .filter(Boolean)                               // remove any undefined if a property is missing
                .map(normalizeToUUID);                    // run your transforming function
            
            addOps = Graph.createProperty({
                name: entity.name,
                dataType: entity.type,
                ...(mappedTypes && mappedTypes.length > 0 && { relationValueTypes: mappedTypes })
            });
            ops.push(...addOps.ops)
            const property_id = addOps.id
            console.log(`${entity.name}: ${addOps.id}`)
            // Add to newPropertyIds only if not already in the map
            
            if (!propertyToIdMap[key]) {
                newPropertyIds[key] = addOps.id;
            }

            if (entity.renderableType) {
                addOps = Graph.createRelation({
                    type: propertyToIdMap['renderable_type'],
                    fromEntity: property_id,
                    toEntity: renderableTypeToIdMap[entity.renderableType]
                })
                ops.push(...addOps.ops)
            }

            if (entity.relationEntityTypes) {
                for (const relationEntityType of entity.relationEntityTypes) { 
                    addOps = Graph.createRelation({
                        type: propertyToIdMap['relation_entity_types'],
                        fromEntity: property_id,
                        toEntity: typeToIdMap[relationEntityType]
                    })
                    ops.push(...addOps.ops)
                }
            }
            

            if (entity.format) {
                addOps = Graph.updateEntity({
                    id: property_id,
                    values: [
                        {
                            property: propertyToIdMap['format'],
                            value: entity.format
                        }
                    ]
                })
                ops.push(...addOps.ops)
            }
            await appendToMap("propertyToIdMap", newPropertyIds);
            for (const key in newPropertyIds) delete newPropertyIds[key];
        }
        
    }
    if (entity.types == 'Type') {
        if (!typeToIdMap[key]) {
            const mappedProperties = entity.properties
                .map(propName => propertyToIdMap[propName])    // get the ID from the map
                .filter(Boolean)                               // remove any undefined if a property is missing
                .map(normalizeToUUID);                         // run your transforming function
            
            addOps = Graph.createType({
                name: entity.name,
                properties: mappedProperties
            })
            ops.push(...addOps.ops)

            console.log(`${entity.name}: ${addOps.id}`)
            // Add to newPropertyIds only if not already in the map
            const key = entity.name.toLowerCase().replace(/\s+/g, "_");
            if (!propertyToIdMap[key]) {
                newTypeIds[key] = addOps.id;
            }
            await appendToMap("typeToIdMap", newTypeIds);
            for (const key in newTypeIds) delete newTypeIds[key];
        }
    }
    
    
}

//console.log(await addSpace(ops, GEO_IDS.cryptoSpace))
await publishOps(await addSpace(ops, SPACE_IDS.podcasts))

