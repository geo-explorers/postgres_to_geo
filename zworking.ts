// To do
// - Do we want to add the project avatar as the avatar in the funding round entity?

import { TeableClient } from "./src/teable-client";
import { PROD_TABLE_IDS } from "./src/teable-meta";
import { testnetWalletAddress, getSpaces, addSpace, searchEntity, filterOps, normalizeToUUID, normalizeToUUID_STRING, propertyToIdMap, GEO_IDS, readAllOpsFromFolder, searchEntities, propertyToTypeIdMap, searchEntities_byId, typeToIdMap } from "./src/constants";
import { processInvestment } from "./junk/ethcc_post_investment";
import { processProject } from "./junk/ethcc_post_project";
import * as fs from "fs";
import { publish } from "./src/publish";
import { SystemIds, type Op, Graph, Id } from "@graphprotocol/grc-20";
import PostgreSQLClient, { TABLES, DB_ID } from "./src/postgres-client";
import path from 'path';
import { deploySpace } from "./src/deploy-space";


function printOps(ops: any) {
  const outputDir = path.join(__dirname, '');
  console.log("NUMBER OF OPS: ", ops.length);

  if (ops.length > 0) {
    // Get existing filenames in the directory
    const existingFiles = fs.readdirSync(outputDir);

    // Create output text
    const outputText = JSON.stringify(ops, null, 2);

    // Write to file
    const filename = `test_function.txt`;
    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, outputText);

    console.log(`OPS PRINTED to ${filename}`);
  } else {
    console.log("NO OPS TO PRINT");
  }
}

async function publishOps(ops: any) {
    printOps(ops)
    if ((ops.length > 0) && (true)) {
        const iso = new Date().toISOString();
        let txHash;
        const spaces = await getSpaces(ops);

        for (const space of spaces) { 
            txHash = await publish({
                spaceId: space,
                author: testnetWalletAddress,
                editName: `Upload news stories ${iso}`,
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


const ops: Array<Op> = [];
let addOps;

const rootSpaceId = "29c97d29-1c9a-41f1-a466-8a713764bc27"

const sourceId = "Et3ppygohgaiod6vHySSuo"
const propertySourcedId = "DBGinihn86i1U35vJfsTYK"

const sourceDBIdentifierId = "CgLt3CoEzWmhPW3XGkakYa"
const propertiesSourcedId = "49frzgU1girWK2NNzXHJWn"
const webURLId = "93stf6cgYvBsdPruRzq1KK"
const webArchiveUrlId = "BTNv9aAFqAzDjQuf4u2fXK"


const relationsSourcedId = "5eCHqLU5t9DSkpLqnne252"

const pgClient = new PostgreSQLClient();
// global or passed down as a parameter

console.log("HERE")
process.on('SIGINT', async () => {
    console.log('Exiting gracefully...');
    await pgClient.close();
    process.exit(0);
});

const episodes = await pgClient.query(`
            SELECT e.id, e.name, e.description, e.episode_number, e.duration, e.published_at as air_date, e.logo as avatar, e.audio_url,
            COALESCE(
              json_agg(
                DISTINCT jsonb_build_object(
                  'to_id', e.podcast_id,
                  'entity_id', null
                )
              ) FILTER (WHERE e.podcast_id IS NOT NULL),
              '[]'
            ) AS podcast,
            COALESCE(
              json_agg(
                DISTINCT jsonb_build_object(
                  'to_id', g.person_id,
                  'entity_id', null
                )
              ) FILTER (WHERE g.role = 'guest'),
              '[]'
            ) AS guests,
            COALESCE(
              json_agg(
                DISTINCT jsonb_build_object(
                  'to_id', g.person_id,
                  'entity_id', null
                )
              ) FILTER (WHERE g.role IN ('host', 'coHost', 'guest_host', 'guestHost')),
              '[]'
            ) AS hosts,
            COALESCE(
              json_agg(
                DISTINCT jsonb_build_object(
                  'to_id', g.person_id,
                  'entity_id', g.id
                )
              ) FILTER (WHERE g.id IS NOT NULL),
              '[]'
            ) AS contributors,
            COALESCE(
              json_agg(
                DISTINCT jsonb_build_object(
                  'to_id', ex.platform_id,
                  'entity_id', ex.id
                )
              ) FILTER (WHERE ex.id IS NOT NULL),
              '[]'
            ) AS sources
            FROM "${DB_ID}".${TABLES.EPISODES} as e
            LEFT JOIN "${DB_ID}".${TABLES.GUESTS} AS g
                ON e.id = g.episode_id
            LEFT JOIN "${DB_ID}".${TABLES.EXTERNAL_IDS} AS ex
                ON e.id = ex.podcast_episode_id
            LEFT JOIN "${DB_ID}".${TABLES.LISTEN_ON} AS l
                ON e.id = l.podcast_episode_id
            WHERE e.id = 946091
            GROUP BY e.id
            ORDER BY e.published_at DESC
            LIMIT 10
        `)

console.log(episodes)


/*
addOps = Graph.createEntity({
  id: "0ef440fb-cdfb-4375-8cc9-0a0837c50dd3",
  name: "Test entity in crypto space",
  types: [normalizeToUUID(typeToIdMap['person'])]
})

ops.push(...addOps.ops)
console.log(addOps.id)

await publishOps(await addSpace(ops, rootSpaceId))



// Load and parse the file
//const filePath = "crypto_space_api_output.json";
//const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

//let currentOps = readAllOpsFromFolder();

//const cleanedOps = currentOps.map((op: any) => {
//  const { spaceId, ...rest } = op;
//  return rest;
//});

//printOps(cleanedOps)

*/
