// To do
// - Do we want to add the project avatar as the avatar in the funding round entity?

import { TeableClient } from "../src/teable-client";
import { PROD_TABLE_IDS } from "../src/teable-meta";
import { testnetWalletAddress, getSpaces, searchEntity, filterOps, normalizeToUUID, normalizeToUUID_STRING, propertyToIdMap, GEO_IDS, readAllOpsFromFolder, searchEntities, propertyToTypeIdMap, searchEntities_byId } from "../src/constants";
import { processInvestment } from "./ethcc_post_investment";
import { processProject } from "./ethcc_post_project";
import * as fs from "fs";
import { publish } from "../src/publish";
import { SystemIds, type Op } from "@graphprotocol/grc-20";
import PostgreSQLClient, { TABLES, DB_ID } from "../src/postgres-client";
import path from 'path';
import { processApp } from "./ethcc_post_dapp";
import { processApp_optimized } from "./ethcc_process_dapp_optimized";

//Currently created projects that have project_type "Angel investor" should remove type "Project" and add type "Person"

async function read_in_geo_data({
  tables,
  currSpaceId
}: {
  tables: { projects: any; investment_rounds: any; tags: any; types: any; assets: any; platforms: any; market_data: any, ecosystems: any; };
  currSpaceId?: string;
}): Promise<{
  projects: any; investment_rounds: any; tags: any; types: any; assets: any; platforms: any; market_data: any, ecosystems: any;
}> {
    return { projects: tables.projects ? await read_in_geo_data_iterator({ table: tables.projects, table_type: "apps", currSpaceId}) : undefined,
      investment_rounds: tables.investment_rounds ? await read_in_geo_data_iterator({ table: tables.investment_rounds, table_type: "investment_rounds", currSpaceId}) : undefined,
      tags: tables.tags ? await read_in_geo_data_iterator({ table: tables.tags, table_type: "tags", currSpaceId}) : undefined,
      types: tables.types ? await read_in_geo_data_iterator({ table: tables.types, table_type: "types", currSpaceId}) : undefined,
      assets: tables.assets ? await read_in_geo_data_iterator({ table: tables.assets, table_type: "assets", currSpaceId}) : undefined,
      platforms: tables.platforms ? await read_in_geo_data_iterator({ table: tables.platforms, table_type: "platforms", currSpaceId}) : undefined,
      market_data: tables.market_data,
      ecosystems: tables.ecosystems ? await read_in_geo_data_iterator({ table: tables.ecosystems, table_type: "ecosystems", currSpaceId}) : undefined
    }
}

async function read_in_geo_data_iterator({
  table,
  table_type,
  currSpaceId
}: {
  table: any;
  table_type: string;
  currSpaceId?: string;
}): Promise<any[]> {
  let typeId;
  let searchValues;
  let name_col = 'name';
  if (table_type == "investment_rounds") {
    typeId = normalizeToUUID_STRING(GEO_IDS.fundingRoundType);
    name_col = 'fundraising_name'
    searchValues = table.map((r: any) => r[name_col]);
  } else if (table_type == "projects") {
    typeId = SystemIds.PROJECT_TYPE;
    searchValues = table.map((r: any) => r[name_col]);
  } else if (table_type == "tags") {
    typeId = undefined;
    searchValues = table.map((r: any) => r[name_col]);
  } else if (table_type == "assets") {
    typeId = normalizeToUUID_STRING(propertyToTypeIdMap["related_assets"]);
    searchValues = table.map((r: any) => r[name_col]);
  } else if (table_type == "platforms") {
    typeId = normalizeToUUID_STRING(propertyToTypeIdMap["related_platforms"]);
    searchValues = table.map((r: any) => r[name_col]);
  } else if (table_type == "ecosystems") {
    typeId = normalizeToUUID_STRING(propertyToTypeIdMap["related_ecosystems"]);
    searchValues = table.map((r: any) => r[name_col]);
  } else if (table_type == "apps") {
    typeId = normalizeToUUID_STRING(GEO_IDS.appType);
    searchValues = table.map((r: any) => r[name_col]);
  } else {
    typeId = undefined;
    searchValues = table.map((r: any) => r[name_col]);
  }
  

  console.log("SEARCHING GEO...")

  // Load and parse the file
  const filePath = "crypto_space_api_output.json";
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  // Relation filters
  const targetTypeId = SystemIds.TYPES_PROPERTY;
  const targetToId = typeId;

  // Filter matching entities
  const result = data.filter((entity: any) =>
    entity.relations?.some(
      (rel: any) => rel.typeId === targetTypeId && rel.toId === targetToId
    )
  );

  if (table_type == "projects") {
    const result_new = data.filter((entity: any) =>
      entity.relations?.some(
        (rel: any) => rel.typeId === targetTypeId && rel.toId === SystemIds.PERSON_TYPE
      )
    );
    result.push(...result_new ? result_new : [])
  }

  console.log("SEARCH COMPLETE...")


  let updatedTable;
  if (typeId) {
    updatedTable = table?.map((obs: any) => {
      const matches = result.filter((entity: any) => entity.name === obs[name_col]);
      const geo_ids_found = matches.length > 0
        ? matches.map((m: any) => m.id)
        : [];

      return {
        ...obs,
        geo_ids_found: geo_ids_found,
        geo_entities_found: matches.length > 0 ? matches : null
      };
    });
  } else {
    updatedTable = table?.map((obs: any) => {
      const matches = data.filter((entity: any) => entity.name === obs[name_col]);
      const geo_ids_found = matches.length > 0
        ? matches.map((m: any) => m.id)
        : [];

      return {
        ...obs,
        geo_ids_found: geo_ids_found,
        geo_entities_found: matches.length > 0 ? matches : null
      };
    });
  }

  return updatedTable;
}


async function read_in_geo_data_relation_entities({
  tables,
  currSpaceId
}: {
  tables: { projects: any; investment_rounds: any; tags: any; types: any; assets: any; platforms: any; market_data: any, ecosystems: any; };
  currSpaceId: string;
}): Promise<any[]> {
  const entities_to_output = []
  const allGeoEntities = [];
  let addEntities;
  
  addEntities = tables?.projects
    ?.map((project: any) => project.geo_entities_found) // get the property
    ?.filter((entry: any) => Array.isArray(entry))      // ensure it's an array
    ?.flat();                                            // flatten into one array

  allGeoEntities.push(...addEntities ? addEntities : [])

  addEntities = tables?.investment_rounds
    ?.map((project: any) => project.geo_entities_found) // get the property
    ?.filter((entry: any) => Array.isArray(entry))      // ensure it's an array
    ?.flat();                                            // flatten into one array

  allGeoEntities.push(...addEntities ? addEntities : [])

  addEntities = tables?.tags
    ?.map((project: any) => project.geo_entities_found) // get the property
    ?.filter((entry: any) => Array.isArray(entry))      // ensure it's an array
    ?.flat();                                            // flatten into one array

  allGeoEntities.push(...addEntities ? addEntities : [])

  addEntities = tables.assets
    ?.map((project: any) => project.geo_entities_found) // get the property
    ?.filter((entry: any) => Array.isArray(entry))      // ensure it's an array
    ?.flat();                                            // flatten into one array

  allGeoEntities.push(...addEntities ? addEntities : [])

  addEntities = tables?.platforms
    ?.map((project: any) => project.geo_entities_found) // get the property
    ?.filter((entry: any) => Array.isArray(entry))      // ensure it's an array
    ?.flat();                                            // flatten into one array

  allGeoEntities.push(...addEntities ? addEntities : [])

  addEntities = tables?.ecosystems
    ?.map((project: any) => project.geo_entities_found) // get the property
    ?.filter((entry: any) => Array.isArray(entry))      // ensure it's an array
    ?.flat();                                            // flatten into one array

  allGeoEntities.push(...addEntities ? addEntities : [])

  //If there is relation of type [sources, properties_sourced, relations_sourced, investors, investments]
  // Prepare the allowed typeIds (already normalized)
  const allowedTypeIds = [
    normalizeToUUID_STRING(GEO_IDS.sourcesPropertyId),
    normalizeToUUID_STRING(GEO_IDS.propertiesSourced),
    normalizeToUUID_STRING(GEO_IDS.relationsSourced),
    normalizeToUUID_STRING(propertyToIdMap['investor']),
    normalizeToUUID_STRING(propertyToIdMap['invested_in']),
  ];

  // Extract matching entityIds from relations
  console.log("READING IN RELATIONS (1)...")
  const relatedEntityIds = allGeoEntities
    .flatMap((entity: any) => entity.relations || []) // handle missing or null relations
    .filter((rel: any) => allowedTypeIds.includes(rel.typeId))
    .map((rel: any) => rel.entityId)
    .filter((id: any) => id !== undefined && id !== null);

  const uniqueEntityIds = new Set(relatedEntityIds);

  // Read and parse the file
  const filePath = "crypto_space_api_output.json";
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  let relationEntities;
  if (uniqueEntityIds) {
    //SearchEntityIDs
    console.log("READING IN RELATIONS (2)...")
    relationEntities = data.filter((entity: any) => uniqueEntityIds.has(entity.id));
    //relationEntities = await searchEntities_byId({spaceId: currSpaceId, searchText: uniqueEntityIds})
    console.log("RELATIONS READ IN")
    entities_to_output.push(...relationEntities ? relationEntities : [])

    if (entities_to_output.length > 0) {
      const relatedEntityIds = entities_to_output
        .flatMap((entity: any) => entity.relations || []) // handle missing or null relations
        .filter((rel: any) => allowedTypeIds.includes(rel.typeId))
        .map((rel: any) => rel.entityId)
        .filter((id: any) => id !== undefined && id !== null);

      const uniqueEntityIds = new Set(relatedEntityIds);

      relationEntities = data.filter((entity: any) => uniqueEntityIds.has(entity.id));
      //relationEntities = await searchEntities_byId({spaceId: currSpaceId, searchText: uniqueEntityIds})
      console.log("RELATIONS READ IN")
      entities_to_output.push(...relationEntities ? relationEntities : [])

    }
  } 

  return entities_to_output;

 
}


function printOps(ops: any) {
  const outputDir = path.join(__dirname, 'ethcc_testnet_ops');
  console.log("NUMBER OF OPS: ", ops.length);

  if (ops.length > 0) {
    // Get existing filenames in the directory
    const existingFiles = fs.readdirSync(outputDir);
    const usedIndices = existingFiles
      .map(name => {
        const match = name.match(/^ethcc_ops_(\d+)\.txt$/);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter(i => i !== null) as number[];

    // Determine next index
    const nextIndex = usedIndices.length > 0 ? Math.max(...usedIndices) + 1 : 1;

    // Create output text
    const outputText = JSON.stringify(ops, null, 2);

    // Write to file
    const filename = `ethcc_ops_${nextIndex}.txt`;
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


async function read_in_tables_v1({
  client,
  offset,
  limit,
}: {
  client: any;
  offset?: number;
  limit?: number;
}): Promise<{
    projects: any; investment_rounds: any; tags: any; types: any; assets: any; platforms: any; market_data: any, ecosystems: any;
}> {
    
    // Read a chunk of investment_rounds
    const projects = await client.query(`
      SELECT * FROM "${DB_ID}".${TABLES.DAPPS}
      ORDER BY __auto_number ASC
    `);

    const investment_rounds = undefined;
    const assets = undefined;
    const platforms = undefined;
    const market_data = undefined;

    const ecosystemIds = [
      ...new Set(
        projects
          .flatMap((project: any) =>
            (project.related_ecosystems || []).map((ecosystem: any) => ecosystem?.id)
          )
          .filter(Boolean)
      ),
    ];

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

async function read_in_tables({
  client,
  offset,
  limit,
}: {
  client: any;
  offset?: number;
  limit?: number;
}): Promise<{
    projects: any; investment_rounds: any; tags: any; types: any; assets: any; platforms: any; market_data: any, ecosystems: any;
}> {
    
    // Read a chunk of investment_rounds
    const projects = await client.query(`
      SELECT * FROM "${DB_ID}".${TABLES.DAPPS}
      WHERE top_dapp IS TRUE
      ORDER BY __auto_number ASC
      LIMIT ${limit} OFFSET ${offset}
    `); //

    const dappIds = [
      ...new Set(
        projects
          .flatMap((project: any) => project?.__id)
          .filter(Boolean)
      ),
    ];
    const market_data = dappIds.length
        ? await client.query(`
            SELECT * FROM "${DB_ID}".${TABLES.DAPP_MARKET_DATA}
            WHERE dapp_id->>'id' = ANY(ARRAY[${dappIds.map((id) => `'${id}'`).join(",")}])
            ORDER BY __auto_number ASC
            `)
        : [];

    const investment_rounds = undefined;
    const assets = undefined;
    const platforms = undefined;

    const ecosystemIds = [
      ...new Set(
        projects
          .flatMap((project: any) =>
            (project.related_ecosystems || []).map((ecosystem: any) => ecosystem?.id)
          )
          .filter(Boolean)
      ),
    ];

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

    return { projects: enrichAppsWithMarketData(projects, market_data), investment_rounds, tags, types, assets, platforms, market_data, ecosystems };
}

function enrichAppsWithMarketData(apps: any[], marketData: any[]): any[] {
  // Step 1: Build a map from dapp_id to its market data grouped by timeframe
  const marketDataMap = new Map<string, Record<string, any>>();

  for (const entry of marketData) {
    const dappId = entry?.dapp_id?.id;
    const timeframe = entry?.timeframe;

    if (!dappId || !timeframe) continue;

    if (!marketDataMap.has(dappId)) {
      marketDataMap.set(dappId, {});
    }

    marketDataMap.get(dappId)![timeframe] = entry;
  }

  // Step 2: Merge values into apps
  return apps.map(app => {
    const dappId = app.__id;
    const dataByTimeframe = marketDataMap.get(dappId);

    if (!dataByTimeframe) return app;

    const newProps: Record<string, number> = {};

    const timeframes = ['24h', '7d', '30d'];
    for (const tf of timeframes) {
      const entry = dataByTimeframe[tf];
      if (!entry) continue;

      newProps[`active_unique_wallets_${tf}`] = entry.unique_active_wallets ?? 0;
      newProps[`transaction_count_${tf}`] = entry.transaction_count ?? 0;
      newProps[`total_volume_${tf}`] = entry.total_volume_in_usd ?? 0;
      newProps[`total_balance_${tf}`] = entry.total_balance_in_usd ?? 0;
    }

    return {
      ...app,
      ...newProps,
    };
  });
}

const main = async () => {
    const ops: Array<Op> = [];
    const currSpaceId = GEO_IDS.cryptoSpace;
    let addOps;

    const pgClient = new PostgreSQLClient();

    process.on('SIGINT', async () => {
        console.log("FINAL OFFSET: ", offset);
        console.log('Exiting gracefully...');
        await pgClient.close();
        process.exit(0);
    });

    let counter = 0;
    let iterator = 0;
    let offset = 0;
    const limit = 40000;
    let currenOps;
    try {
        while (true) {

          currenOps = readAllOpsFromFolder();

          console.log("Reading tables")
          let tables = await read_in_tables({
              client: pgClient,
              limit: limit,
              offset: offset
          });

          if (
            (!tables || !tables.projects || tables.projects.length === 0)
          ) {
            console.log("✅ No more data to process. Exiting loop.");
            break; // ← exit the loop
          }
          console.log("Tables read in...")

          console.log("Reading GEO...")
          tables = await read_in_geo_data({tables: tables, currSpaceId: currSpaceId});
          console.log("DONE READING GEO")

          let relations = await read_in_geo_data_relation_entities({tables: tables, currSpaceId: currSpaceId});
          
          
          console.log("number of apss: ", tables.projects.length)

          if (true) {
              for (const project of tables.projects) {
                  counter = counter + 1
                  iterator = iterator + 1
                  console.log(counter)
                  console.log(project.name)
                  addOps = await processApp_optimized({
                      currentOps: [...currenOps, ...ops],
                      project: project,
                      client: pgClient,
                      tables: tables,
                  });
                  ops.push(...addOps.ops)
                  
                  if ((iterator > 1500)) {
                    printOps(ops)
                    currenOps = [...currenOps, ...ops]
                    //await publishOps(ops)
                    iterator = 0
                    ops.length = 0;
                    console.log("number of Apps: ", tables.projects.length)
                  }
              }
          }
          printOps(ops)
          //await publishOps(ops)
          offset = offset + limit;
          ops.length = 0;
          console.log("Current offset: ", offset)
        }
    } catch (error) {
        console.error(error);
    } finally {
        await pgClient.close();
        console.log("FINAL OFFSET: ", offset);
    }
};

console.time("main execution");
main();
console.timeEnd("main execution");




