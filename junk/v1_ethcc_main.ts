// To do
// - Do we want to add the project avatar as the avatar in the funding round entity?

import { TeableClient } from "../src/teable-client";
import { PROD_TABLE_IDS } from "../src/teable-meta";
import { testnetWalletAddress, getSpaces, searchEntity, filterOps, normalizeToUUID, normalizeToUUID_STRING, propertyToIdMap, GEO_IDS } from "../src/constants";
import { processInvestment } from "./ethcc_post_investment";
import { processProject } from "./ethcc_post_project";
import * as fs from "fs";
import { publish } from "../src/publish";
import { type Op } from "@graphprotocol/grc-20";
import PostgreSQLClient, { TABLES, DB_ID } from "../src/postgres-client";

function printOps(ops: any) {
    console.log("NUMBER OF OPS: ", ops.length)
     if (ops.length > 0) {
        let outputText;
        // Convert operations to a readable JSON format
        outputText = JSON.stringify(ops, null, 2);
        // Write to a text file
        fs.writeFileSync(`ethcc_ops.txt`, outputText);
        console.log("OPS PRINTED")
    } else {
        console.log("NO OPS TO PRINT")
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

async function iterateInvestments({
  currentOps,
  teableClient,
  table_id,
  project_id,
}: {
  currentOps: Array<Op>;
  teableClient: any;
  table_id: string;
  project_id: string;
}): Promise<{
    ops: Op[];
}> {
    const ops: Array<Op> = [];
    const currSpaceId = GEO_IDS.cryptoSpace;
    let addOps;
    let geoId: string;
    let filter_obj;
    const take = 100; // or your preferred page size
    let skip = 0;

    filter_obj = JSON.parse(`{"conjunction":"and","filterSet":[{"fieldId":"project","operator":"is","value":"${project_id}"}]}`);

    while (true) {
        const page = await teableClient.get_records(table_id, filter_obj, take, skip);
        
        if (!page || page.length === 0) break;

        const seen = new Set();
        const filtered = page.filter((item: any) => {
          const key = [
            item.fields.raise_amount,
            item.fields.funding_round,
            item.fields.fundraising_name,
            item.fields.project,
            //item.fields.source,
          ].join('|');
        
          if (seen.has(key)) {
            return false;
          } else {
            seen.add(key);
            return true;
          }
        });

        for (const record of filtered) {
            addOps = await processInvestment({
                currentOps: [...currentOps, ...ops],
                investmentId: record.id,
                teableClient: teableClient
            })
            ops.push(...addOps.ops)
        }

        skip += take;
    }

    return { ops };
}


async function read_in_tables_all({
  client
}: {
  client: any;
}): Promise<{
    projects: any; investment_rounds: any; tags: any; types: any; assets: any; platforms: any; market_data: any;
}> {

    const projects = await client.query(`
        SELECT * FROM "${DB_ID}".${TABLES.PROJECTS}
        WHERE (geo_id IS NULL) OR (geo_id IS NOT NULL AND space_id = 'SgjATMbm41LX6naizMqBVd')
        ORDER BY __auto_number ASC
    `);

    await new Promise(resolve => setTimeout(resolve, 200));
    const investment_rounds = await client.query(`
        SELECT * FROM "${DB_ID}".${TABLES.INVESTMENT_ROUNDS}
        ORDER BY __auto_number ASC
    `);

    await new Promise(resolve => setTimeout(resolve, 200));
    const tags = await client.query(`
        SELECT * FROM "${DB_ID}".${TABLES.TAGS}
        ORDER BY __auto_number ASC
    `);

    await new Promise(resolve => setTimeout(resolve, 200));
    const types = await client.query(`
        SELECT * FROM "${DB_ID}".${TABLES.TYPES}
        ORDER BY __auto_number ASC
    `);

    await new Promise(resolve => setTimeout(resolve, 200));
    const assets = await client.query(`
        SELECT * FROM "${DB_ID}".${TABLES.ASSETS}
        ORDER BY __auto_number ASC
    `);

    await new Promise(resolve => setTimeout(resolve, 200));
    const platforms = await client.query(`
        SELECT * FROM "${DB_ID}".${TABLES.PLATFORMS}
        ORDER BY __auto_number ASC
    `);

    await new Promise(resolve => setTimeout(resolve, 200));
    const market_data = await client.query(`
        SELECT * FROM "${DB_ID}".${TABLES.MARKET_DATA}
        ORDER BY __auto_number ASC
    `);

    return { projects, investment_rounds, tags, types, assets, platforms, market_data };
}

async function read_in_tables({
  client,
  offset = 0,
  limit = 500,
}: {
  client: any;
  offset?: number;
  limit?: number;
}): Promise<{
    projects: any; investment_rounds: any; tags: any; types: any; assets: any; platforms: any; market_data: any, ecosystems: any;
}> {
    
    // Read a chunk of investment_rounds
    const investment_rounds = await client.query(`
      SELECT * FROM "${DB_ID}".${TABLES.INVESTMENT_ROUNDS}
      ORDER BY __auto_number ASC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const projectIds = [
      ...new Set(
        investment_rounds
          .flatMap((row: any) => [row.project?.id, row.investor?.id])
          .filter(Boolean)
      ),
    ];

    const projects = projectIds.length
    ? await client.query(`
        SELECT * FROM "${DB_ID}".${TABLES.PROJECTS}
        WHERE __id IN (${projectIds.map((id) => `'${id}'`).join(",")})
        ORDER BY __auto_number ASC
      `)
    : [];

    const assetIds = [
      ...new Set(
        projects
          .flatMap((project: any) =>
            (project.related_assets || []).map((asset: any) => asset.id)
          )
          .filter(Boolean)
      ),
    ];

    const platformIds = [
      ...new Set(
        projects
          .flatMap((project: any) =>
            (project.related_platforms || []).map((platform: any) => platform?.id)
          )
          .filter(Boolean)
      ),
    ];

    const ecosystemIds = [
      ...new Set(
        projects
          .flatMap((project: any) =>
            (project.related_ecosystems || []).map((ecosystem: any) => ecosystem?.id)
          )
          .filter(Boolean)
      ),
    ];

    const assets = assetIds.length
    ? await client.query(`
        SELECT * FROM "${DB_ID}".${TABLES.ASSETS}
        WHERE __id IN (${assetIds.map((id) => `'${id}'`).join(",")})
        ORDER BY __auto_number ASC
      `)
    : [];

    const market_data = assetIds.length
    ? await client.query(`
        SELECT * FROM "${DB_ID}".${TABLES.MARKET_DATA}
        WHERE asset_id->>'id' IN (${assetIds.map((id) => `'${id}'`).join(",")})
        ORDER BY __auto_number ASC
      `)
    : [];

    const platformIds_fromAssets = [
      ...new Set(
        assets
          .flatMap((row: any) => row.platform_id?.id)
          .filter(Boolean)
      ),
    ];

    const platforms = (platformIds.length + platformIds_fromAssets.length)
    ? await client.query(`
        SELECT * FROM "${DB_ID}".${TABLES.PLATFORMS}
        WHERE __id IN (${platformIds.map((id) => `'${id}'`).join(",")})
        OR __id IN (${platformIds_fromAssets.map((id) => `'${id}'`).join(",")})
        ORDER BY __auto_number ASC
      `)
    : [];

    const ecosystems = ecosystemIds.length
    ? await client.query(`
        SELECT * FROM "${DB_ID}".${TABLES.ECOSYSTEMS}
        WHERE __id IN (${ecosystemIds.map((id) => `'${id}'`).join(",")})
        ORDER BY __auto_number ASC
      `)
    : [];

    
    await new Promise(resolve => setTimeout(resolve, 200));
    const tags = await client.query(`
        SELECT * FROM "${DB_ID}".${TABLES.TAGS}
        ORDER BY __auto_number ASC
    `);

    await new Promise(resolve => setTimeout(resolve, 200));
    const types = await client.query(`
        SELECT * FROM "${DB_ID}".${TABLES.TYPES}
        ORDER BY __auto_number ASC
    `);

    return { projects, investment_rounds, tags, types, assets, platforms, market_data, ecosystems };
}

const main = async () => {
    const ops: Array<Op> = [];
    const currSpaceId = GEO_IDS.cryptoSpace;
    let addOps;
    let geoId: string;

    const pgClient = new PostgreSQLClient();

    process.on('SIGINT', async () => {
        console.log('Exiting gracefully...');
        await pgClient.close();
        process.exit(0);
    });

    let counter = 0;
    try {
        console.log("Reading tables")
        const tables = await read_in_tables({client: pgClient});
        console.log("Tables read in...")
        
        for (const project of tables.projects) {
            counter = counter + 1
            console.log(counter)
            console.log(project.name)
            addOps = await processProject({
                currentOps: ops,
                project: project,
                client: pgClient,
                tables: tables
            });
            ops.push(...addOps.ops)

            const investmentObs = tables?.investment_rounds.filter(item => item?.project.id === project.__id);
            for (const investment of investmentObs) {
                console.log(investment.fundraising_name)
                addOps = await processInvestment({
                    currentOps: ops,
                    investment: investment,
                    client: pgClient,
                    tables: tables
                });
                ops.push(...addOps.ops)
            }
            console.log(counter)
            if (counter > 1000) {
                //printOps(ops);
                await publishOps(ops)
                break;
            }
        }
    } catch (error) {
        console.error(error);
    } finally {
        await pgClient.close();
    }
};

console.time("main execution");
main();
console.timeEnd("main execution");




