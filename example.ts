import { SystemIds } from "@graphprotocol/grc-20";
import { GEO_IDS, normalizeToUUID_STRING, propertyToIdMap, propertyToTypeIdMap, searchEntities, searchEntities_byId, searchEntities_byType, searchEntities_new } from "./src/constants";
import PostgreSQLClient, { TABLES } from "./src/postgres-client";
import { processProject } from "./junk/ethcc_post_project";
import * as fs from "fs";



function groupInvestmentRoundsBySource(investment_rounds: any[]) {
  const grouped: { [source: string]: any } = {};

  for (const round of investment_rounds) {
    const source = round.source;

    if (!grouped[source]) {
      // Initialize with a shallow copy of the round
      grouped[source] = {
        ...round,
        investors: [],
        projects: [],
      };
    }

    const current = grouped[source];

    // Add investor if not already in the array
    if (
      round.investor &&
      !current.investors.some((inv: any) => inv.id === round.investor.id)
    ) {
      current.investors.push(round.investor);
    }

    // Add project if not already in the array
    if (
      round.project &&
      !current.projects.some((proj: any) => proj.id === round.project.id)
    ) {
      current.projects.push(round.project);
    }
  }

  // Optional: Clean up original individual `investor` and `project` fields
  const result = Object.values(grouped).map((entry: any) => {
    const { investor, project, ...rest } = entry;
    return rest;
  });

  return result;
}


async function read_in_tables({
  client,
  offset = 0,
  limit = 150,
}: {
  client: any;
  offset?: number;
  limit?: number;
}): Promise<{
    projects: any; investment_rounds: any; tags: any; types: any; assets: any; platforms: any; market_data: any, ecosystems: any;
}> {
    
    // Read a chunk of investment_rounds
    const investment_rounds_tmp = await client.query(`
      SELECT * FROM "${DB_ID}".${TABLES.INVESTMENT_ROUNDS}
      WHERE fundraising_name = 'The Graph - Strategic'
      ORDER BY __auto_number ASC      
    `);
      //LIMIT ${limit} OFFSET ${offset}

      console.log(investment_rounds_tmp)

    const sourceURLs = [
      ...new Set(
        investment_rounds_tmp
          .flatMap((row: any) => row.source)
          .filter(Boolean)
      ),
    ];

    const investment_rounds = sourceURLs.length
    ? await client.query(`
        SELECT * FROM "${DB_ID}".${TABLES.INVESTMENT_ROUNDS}
        WHERE source IN (${sourceURLs.map((url) => `'${url}'`).join(",")})
        ORDER BY __auto_number ASC
      `)
    : [];

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

    let platformWhereClauses = [];

    if (platformIds.length > 0) {
    platformWhereClauses.push(`__id IN (${platformIds.map((id) => `'${id}'`).join(",")})`);
    }

    if (platformIds_fromAssets.length > 0) {
    platformWhereClauses.push(`__id IN (${platformIds_fromAssets.map((id) => `'${id}'`).join(",")})`);
    }

    const platforms = platformWhereClauses.length
    ? await client.query(`
        SELECT * FROM "${DB_ID}".${TABLES.PLATFORMS}
        WHERE ${platformWhereClauses.join(" OR ")}
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

    return { projects, investment_rounds: groupInvestmentRoundsBySource(investment_rounds), tags, types, assets, platforms, market_data, ecosystems };
}

async function read_in_geo_data({
  tables,
  currSpaceId
}: {
  tables: { projects: any; investment_rounds: any; tags: any; types: any; assets: any; platforms: any; market_data: any, ecosystems: any; };
  currSpaceId?: string;
}): Promise<{
  projects: any; investment_rounds: any; tags: any; types: any; assets: any; platforms: any; market_data: any, ecosystems: any;
}> {
    return { projects: await read_in_geo_data_iterator({ table: tables.projects, table_type: "projects", currSpaceId}),
      investment_rounds: await read_in_geo_data_iterator({ table: tables.investment_rounds, table_type: "investment_rounds", currSpaceId}),
      tags: await read_in_geo_data_iterator({ table: tables.tags, table_type: "tags", currSpaceId}),
      types: await read_in_geo_data_iterator({ table: tables.types, table_type: "types", currSpaceId}),
      assets: await read_in_geo_data_iterator({ table: tables.assets, table_type: "assets", currSpaceId}),
      platforms: await read_in_geo_data_iterator({ table: tables.platforms, table_type: "platforms", currSpaceId}),
      market_data: tables.market_data,
      ecosystems: await read_in_geo_data_iterator({ table: tables.ecosystems, table_type: "ecosystems", currSpaceId}) 
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
    typeId = undefined;
    searchValues = table.map((r: any) => r[name_col]);
  } else if (table_type == "ecosystems") {
    typeId = undefined;
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


  const updatedTable = table?.map((obs: any) => {
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
  
  addEntities = tables.projects
    .map((project: any) => project.geo_entities_found) // get the property
    .filter((entry: any) => Array.isArray(entry))      // ensure it's an array
    .flat();                                            // flatten into one array

  allGeoEntities.push(...addEntities)

  addEntities = tables.investment_rounds
    .map((project: any) => project.geo_entities_found) // get the property
    .filter((entry: any) => Array.isArray(entry))      // ensure it's an array
    .flat();                                            // flatten into one array

  allGeoEntities.push(...addEntities)

  addEntities = tables.tags
    .map((project: any) => project.geo_entities_found) // get the property
    .filter((entry: any) => Array.isArray(entry))      // ensure it's an array
    .flat();                                            // flatten into one array

  allGeoEntities.push(...addEntities)

  addEntities = tables.assets
    .map((project: any) => project.geo_entities_found) // get the property
    .filter((entry: any) => Array.isArray(entry))      // ensure it's an array
    .flat();                                            // flatten into one array

  allGeoEntities.push(...addEntities)

  addEntities = tables.platforms
    .map((project: any) => project.geo_entities_found) // get the property
    .filter((entry: any) => Array.isArray(entry))      // ensure it's an array
    .flat();                                            // flatten into one array

  allGeoEntities.push(...addEntities)

  addEntities = tables.ecosystems
    .map((project: any) => project.geo_entities_found) // get the property
    .filter((entry: any) => Array.isArray(entry))      // ensure it's an array
    .flat();                                            // flatten into one array

  allGeoEntities.push(...addEntities)

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



function countByPropertiesSorted(projects: any[], properties: string[]) {
  const results: Record<string, [string, number][]> = {};

  for (const prop of properties) {
    const counts: Record<string, number> = {};

    for (const project of projects) {
      const rawValue = project[prop];

      if (rawValue === null || rawValue === undefined) {
        counts["null"] = (counts["null"] || 0) + 1;
        continue;
      }

      const tags = rawValue.toString().split(",").map(tag => tag.trim());

      for (const tag of tags) {
        if (tag === "") continue;
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }

    // Sort entries from highest to lowest count
    const sortedEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    results[prop] = sortedEntries;
  }

  return results;
}


function saveCountsToFile(results: Record<string, [string, number][]>, filename: string) {
  let output = "";

  for (const [property, entries] of Object.entries(results)) {
    output += `Property: ${property}\n`;
    for (const [value, count] of entries) {
      output += `  ${value}: ${count}\n`;
    }
    output += `\n`;
  }

  fs.writeFileSync(filename, output, 'utf8');
}




const DB_ID = "bseocOYqflQMDdju75d";




async function main() {
  const pgClient = new PostgreSQLClient();
  const currSpaceId = GEO_IDS.cryptoSpace
   process.on('SIGINT', async () => {
      console.log('Exiting gracefully...');
      await pgClient.close();
      process.exit(0);
  });

  try {
    const offset = 0
    const limit = 20

   // Read a chunk of investment_rounds
    const projects = await pgClient.query(`
      SELECT * FROM "${DB_ID}".${TABLES.PROJECTS}
      WHERE top_project IS TRUE
      ORDER BY __auto_number ASC      
    `);
      //LIMIT ${limit} OFFSET ${offset}

      console.log(projects)
    const properties_to_count = ["related_industries_lookup", "related_asset_categories_lookup", "related_services_or_products_lookup", "tags_lookup"]
    const counts = countByPropertiesSorted(projects, properties_to_count);
    console.log(counts);


    saveCountsToFile(counts, 'property_counts.txt');


  } catch (error) {
    console.error(error);
  } finally {
    await pgClient.close();
  }
}

main();



