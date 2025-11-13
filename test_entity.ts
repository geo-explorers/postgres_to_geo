// To do
// - Do we want to add the project avatar as the avatar in the funding round entity?

import { TeableClient } from "./src/teable-client";
import { PROD_TABLE_IDS } from "./src/teable-meta";
import { testnetWalletAddress, getSpaces, searchEntity, filterOps, normalizeToUUID, normalizeToUUID_STRING, propertyToIdMap, GEO_IDS, readAllOpsFromFolder, searchEntities, propertyToTypeIdMap, searchEntities_byId, typeToIdMap } from "./src/constants";
import { processInvestment } from "./junk/ethcc_post_investment";
import { processProject } from "./junk/ethcc_post_project";
import * as fs from "fs";
//import { publish } from "./src/publish";
import { SystemIds, type Op, Graph, Id, IdUtils } from "@graphprotocol/grc-20";
import PostgreSQLClient, { TABLES, DB_ID } from "./src/postgres-client";
import path from 'path';
import { processEntity } from "./post_entity";

async function read_in_tables({
  pgClient,
  offset,
  limit,
}: {
  pgClient: any;
  offset?: number;
  limit?: number;
}): Promise<{
    podcasts: any; episodes: any; hosts: any; guests: any; people: any;
}> {
    
    // get all tables in the current database
        const podcasts = await pgClient.query(`
            SELECT * FROM "${DB_ID}".${TABLES.PODCASTS}
            LIMIT ${limit} OFFSET ${offset}
        `);

        const podcastIds = [
            ...new Set(
                podcasts
                .flatMap((row: any) => [row.id])
                .filter(Boolean)
            ),
        ];
        
        const episodes = podcastIds.length
        ? await pgClient.query(`
            SELECT * FROM "${DB_ID}".${TABLES.EPISODES}
            WHERE podcast_id IN (${podcastIds.map((id) => `'${id}'`).join(",")})
        `)
        : [];
        
        const episodeIds = [
            ...new Set(
                episodes
                .flatMap((row: any) => [row.id])
                .filter(Boolean)
            ),
        ];

        const hosts = podcastIds.length
        ? await pgClient.query(`
            SELECT * FROM "${DB_ID}".${TABLES.HOSTS}
            WHERE podcast_id IN (${podcastIds.map((id) => `'${id}'`).join(",")})
        `)
        : [];

        const hostIds = [
            ...new Set(
                hosts
                .flatMap((row: any) => [row.person_id])
                .filter(Boolean)
            ),
        ];

        const guests = podcastIds.length
        ? await pgClient.query(`
            SELECT * FROM "${DB_ID}".${TABLES.GUESTS}
            WHERE episode_id IN (${episodeIds.map((id) => `'${id}'`).join(",")})
        `)
        : [];

        const guestIds = [
            ...new Set(
                guests
                .flatMap((row: any) => [row.person_id])
                .filter(Boolean)
            ),
        ];

        let personWhereClauses = [];

        if (hostIds.length > 0) {
            personWhereClauses.push(`id IN (${hostIds.map((id) => `'${id}'`).join(",")})`);
        }

        if (guestIds.length > 0) {
            personWhereClauses.push(`id IN (${guestIds.map((id) => `'${id}'`).join(",")})`);
        }

        const people = personWhereClauses.length
            ? await pgClient.query(`
                SELECT * FROM "${DB_ID}".${TABLES.PEOPLE}
                WHERE ${personWhereClauses.join(" OR ")}
                `)
            : [];

    return { podcasts, episodes, hosts, guests, people };
}

function printOps(ops: any) {
  const outputDir = path.join(__dirname, 'podcast_testnet_ops');
  console.log("NUMBER OF OPS: ", ops.length);

  if (ops.length > 0) {
    // Get existing filenames in the directory
    const existingFiles = fs.readdirSync(outputDir);
    const usedIndices = existingFiles
      .map(name => {
        const match = name.match(/^podcast_ops_(\d+)\.txt$/);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter(i => i !== null) as number[];

    // Determine next index
    const nextIndex = usedIndices.length > 0 ? Math.max(...usedIndices) + 1 : 1;

    // Create output text
    const outputText = JSON.stringify(ops, null, 2);

    // Write to file
    const filename = `podcast_ops_${nextIndex}.txt`;
    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, outputText);

    console.log(`OPS PRINTED to ${filename}`);
  } else {
    console.log("NO OPS TO PRINT");
  }
}




const main = async () => {
    const ops: Array<Op> = [];
    const currSpaceId = GEO_IDS.cryptoSpace;
    let addOps;

    const pgClient = new PostgreSQLClient();

    const limit = 1;
    const offset = 0;

    process.on('SIGINT', async () => {
        console.log("FINAL OFFSET: ", offset);
        console.log('Exiting gracefully...');
        await pgClient.close();
        process.exit(0);
    });

    try {
       let tables = await read_in_tables({
            pgClient: pgClient,
            offset: offset,
            limit: limit
        });

        console.log(tables.podcasts)
            
    } catch (error) {
        console.error(error);
    } finally {
        await pgClient.close();
    }
};

console.time("main execution");
//main();
console.timeEnd("main execution");


type SearchCandidate = {
  entityId: string;
  score: number;
};

export async function searchClosestEntity({
  values,
  spaceId,
  typeId,
  notTypeId
}: {
  values: PropertyValue[];
  spaceId?: string;
  typeId?: string;
  notTypeId?: string;
}): Promise<string | null> {
  const candidates: Record<string, SearchCandidate> = {};

  for (const val of values) {
    const propertyId = val.property;

    // Skip if neither value nor relation exists
    if (!val.value && !val.rel_info?.to_entity) continue;

    // Determine search text or related entity
    const searchText = typeof val.value === 'string' ? val.value : undefined;
    const relatedEntityId = val.rel_info?.to_entity;

    // If property has a text value, search by text
    if (searchText) {
      const entityId = await searchEntities_orig({
        spaceId,
        property: propertyId,
        searchText,
        typeId,
        notTypeId
      });

      if (entityId) {
        // Increment score for this candidate
        candidates[entityId] = candidates[entityId] || { entityId, score: 0 };
        candidates[entityId].score += 1;
      }
    }

    // If property has a relation, search by related entity
    if (relatedEntityId) {
      const entityId = await searchEntities_orig({
        spaceId,
        property: propertyId,
        searchText: relatedEntityId,
        typeId,
        notTypeId
      });

      if (entityId) {
        candidates[entityId] = candidates[entityId] || { entityId, score: 0 };
        candidates[entityId].score += 2; // relations might carry higher confidence
      }
    }
  }

  // Pick the candidate with the highest score
  const best = Object.values(candidates).sort((a, b) => b.score - a.score)[0];

  // If best score is low (no confident match), return null
  if (!best || best.score < 2) return null;

  return best.entityId;
}

const currSpaceId = GEO_IDS.cryptoSpace;
const valueProperties = ['name', 'description'];
const imageProperties = ['avatar']
const relationProperties = ['hosts', 'listen_on', 'topics']
//Note: each relation should have a values object, then the value inside a relation can hold information about the relation entity, if needed
//If filling a relation entity, just recall process entity recursively...
//Also will need to be able to pull in a geo_id for relation entities
//OR do I create the relation entity and then pass the geo_id back, that might actually work better
type PropertyValue = {
  property: string;
  value?: string;
  image?: string;
  rel_info?: {
    to_entity: string | PropertyValue[];
    entity?: string | PropertyValue[];
    to_space?: string;
    verified?: boolean;
    position?: string;
  };
};
//const values: PropertyValue[] = [];

const ops: Array<Op> = [];
let addOps;
let geo_id;
const values: PropertyValue[] = [
    { property: normalizeToUUID(propertyToIdMap["name"]), value: "Global News Podcast" },
    { property: normalizeToUUID(propertyToIdMap["types"]), rel_info: {to_entity: normalizeToUUID(typeToIdMap["podcast"])} },
    { property: normalizeToUUID(propertyToIdMap["description"]), value: "The Global News Podcast brings you the breaking news you need to hear, as it happens. Listen for the latest headlines and current affairs from around the world. Politics, economics, climate, business, technology, health – we cover it all with expert analysis and insight.Get the news that matters, delivered twice a day on weekdays and daily at weekends, plus special bonus episodes reacting to urgent breaking stories. Follow or subscribe now and never miss a moment.Get in touch: globalpodcast@bbc.co.uk" },
    { property: normalizeToUUID(propertyToIdMap["avatar"]), image: "http://ichef.bbci.co.uk/images/ic/3000x3000/p0lqf7hf.jpg" },
]

//First, find all image values and create image then swap out the value for rel_info, to_entity correctly


// 1️⃣ Both rel_info and image are null
const textValues = values.filter(v => !v.rel_info && !v.image);
const formattedTextValues = textValues
  .filter(v => v.value !== undefined && v.value !== "")
  .map(v => ({
    property: v.property,
    value: v.value!  // TS knows this is safe because of the filter
  }));

if (formattedTextValues.length > 0) {
  const addOps = Graph.createEntity({
    values: formattedTextValues
  });
  ops.push(...addOps.ops);
  geo_id = addOps.id
} else {
  console.log("No valid text values to create entity.");
  geo_id = IdUtils.generate()
}


// 3️⃣ image is not null
const imageValues = values.filter(v => v.image);
for (const imageValue of imageValues) {
    //Check to make sure not a duplicate relation
    //create image
    //create relation
    if (!imageValue.image) continue;


    console.log("IMAGE GEN");
    
    // Create image entity
    const { id: imageId, ops: createImageOps } = await Graph.createImage({
        url: imageValue.image,
    });
    ops.push(...createImageOps);

    const addOps = Graph.createRelation({ // should be using processNewRelation and need to track my current ops through correctly
      fromEntity: geo_id,
      toEntity: imageId,
      type: imageValue.property,
    });
    ops.push(...addOps.ops);

}

// 2️⃣ rel_info is not null
const relValues = values.filter(v => v.rel_info);
for (const val of relValues) {
    //if to_entity or entity is an object, recursively run post_entity function to create it
    //return the id and then create the relation
    //if to_entity is a string, then just make the relation
  const rel = val.rel_info;
  if (!rel) continue;

  let toEntityId: string | undefined;

  // Check if to_entity is a string
  if (typeof rel.to_entity === "string") {
    toEntityId = rel.to_entity;
  } else if (Array.isArray(rel.to_entity)) {
    // Recursively process nested entity
    const result = await processEntity({
      currentOps: ops,
      entity: null,          // or the current entity context if needed
      client: null,      // your client instance
      currSpaceId: currSpaceId,
      values: rel.to_entity, // pass the nested PropertyValue[]
      geo_id: geo_id
    });

    // Replace to_entity with the returned id
    toEntityId = result.id;
  }

  // Optional: do the same for rel.entity if needed
  let entityId: string | undefined;
  if (typeof rel.entity === "string") {
    entityId = rel.entity;
  } else if (Array.isArray(rel.entity)) {
    const result = await processEntity({
      currentOps: ops,
      entity: null,
      client: null,
      currSpaceId: currSpaceId,
      values: rel.entity,
      geo_id: geo_id
    });

    entityId = result.id;
  } else {
    entityId = undefined;
  }

  // Now safe to create relation
  if (toEntityId) {
    const addOps = Graph.createRelation({ // should be using processNewRelation
      fromEntity: geo_id,
      toEntity: toEntityId,
      type: val.property,
      entityId: entityId
    });
    ops.push(...addOps.ops);
  } else {
    console.warn(`Skipping relation for property ${val.property} because to_entity could not be resolved.`);
  }
}