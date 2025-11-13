// To do
// - Do we want to add the project avatar as the avatar in the funding round entity?

import { TeableClient } from "../src/teable-client";
import { PROD_TABLE_IDS } from "../src/teable-meta";
import { testnetWalletAddress, getSpaces, searchEntity, filterOps, normalizeToUUID, normalizeToUUID_STRING, propertyToIdMap, GEO_IDS, readAllOpsFromFolder, searchEntities, propertyToTypeIdMap, searchEntities_byId } from "../src/constants";
import { processInvestment } from "../junk/ethcc_post_investment";
import { processProject } from "../junk/ethcc_post_project";
import * as fs from "fs";
import { publish } from "../src/publish";
import { SystemIds, type Op } from "@graphprotocol/grc-20";
import PostgreSQLClient, { TABLES, DB_ID } from "../src/postgres-client";
import path from 'path';



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
        let counter = 0;
        let iterator = 0;
        let offset = 0;
        const limit = 40000;
        let currenOps;
        while (true) {

            currenOps = readAllOpsFromFolder();

            console.log("Reading tables")
            let tables = await read_in_tables({
                pgClient: pgClient,
                offset: offset,
                limit: limit
            });

            if (
            (!tables || !tables.podcasts || tables.episodes.length === 0)
            ) {
            console.log("✅ No more data to process. Exiting loop.");
            break; // ← exit the loop
            }
            console.log("Tables read in...")

            //console.log("Reading GEO...")
            //tables = await read_in_geo_data({tables: tables, currSpaceId: currSpaceId});
            //console.log("DONE READING GEO")

            //let relations = await read_in_geo_data_relation_entities({tables: tables, currSpaceId: currSpaceId});
            
            
            console.log("number of podcasts: ", tables.podcasts.length)

            if (true) {
                for (const podcast of tables.podcasts) {
                    counter = counter + 1
                    iterator = iterator + 1
                    console.log(counter)
                    console.log(podcast.name)
                    addOps = await processPodcast({
                        currentOps: [...currenOps, ...ops],
                        entity: podcast,
                        client: pgClient,
                        tables: tables,
                        //relations: relations
                    });
                    ops.push(...addOps.ops)
                    
                    if (iterator > 250) {
                        printOps(ops)
                        currenOps = [...currenOps, ...ops]
                        //await publishOps(ops)
                        iterator = 0
                        ops.length = 0;
                        console.log("number of investment rounds: ", tables.podcasts.length)
                    }
                }
            }
            printOps(ops)
            //await publishOps(ops)
            offset = offset + limit;
            ops.length = 0;
            console.log("Current offset: ", offset)
        }

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
main();
console.timeEnd("main execution");
