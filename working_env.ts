import { Graph, SystemIds, type Op } from '@graphprotocol/grc-20';
import * as fs from "fs";
import { publish } from './src/publish';
import { addSpace, cleanText, fetchWithRetry, filterOps, GEO_IDS, getSpaces, normalizeToUUID, normalizeToUUID_STRING, propertyToIdMap, propertyToTypeIdMap, readAllOpsFromFolder, testnetWalletAddress, typeToIdMap } from './src/constants';
import path from 'path';
import PostgreSQLClient, { TABLES, DB_ID } from "./src/postgres-client";
import { processEntity } from './post_entity';
function buildEntity_v1(
  row: any,
  breakdown: any,
  spaceId: string,
  tables: Record<string, any[]>,
  geoEntities: Record<string, any[]>
): any {
  const tableName = breakdown.table;

  // --- get the corresponding geo entities ---
  const geoRows = geoEntities[tableName] ?? [];

  // --- resolve entityOnGeo / sourceEntityOnGeo ---
  let geo_id: string | null = null;
  let entityOnGeo: any = null;
  let sourceEntityOnGeo: any = null;
  let match: any = null;

  if (breakdown.source) {
    match = geoRows.find(p =>
      p.relations?.some(r =>
        r.typeId == normalizeToUUID(propertyToIdMap["sources"]) &&
        r.toEntityId == breakdown.source &&
        r.entity?.values.some(v =>
          v.propertyId == normalizeToUUID(propertyToIdMap["source_db_identifier"]) &&
          v.value == row.podchaser_id // or row-specific ID
        )
      )
    );
  }
  if (!match) {
    let matches = geoRows.filter(p =>
        p.name?.toLowerCase() == (row.name.toLowerCase()) &&
        p.relations?.some(r =>
            r.typeId == SystemIds.TYPES_PROPERTY &&
            r.toEntityId == breakdown.types[0]
        )
    )
    if (matches.length > 0) {
        console.log(matches)
    }
    match = matches[0]
  }
  if (match) {
    geo_id = match.id;
    entityOnGeo = match;
    sourceEntityOnGeo = entityOnGeo?.relations.find(r =>
        r.typeId == normalizeToUUID(propertyToIdMap["sources"]) &&
        r.toEntityId == breakdown.source
    )?.entity;
  }

  // --- build values ---
  const values = (breakdown.value_fields ?? []).flatMap((field: string) => {
    const val = row[field];
    return val != null
      ? [{ spaceId, property: normalizeToUUID(propertyToIdMap[field]), value: val }]
      : [];
  });

  // --- build relations recursively ---
  const relations = (breakdown.relations ?? []).flatMap((rel: any) => {
    const relatedIds = row[rel.type] ?? [];
    return relatedIds.flatMap((relatedId: string) => {
      const relatedRow = tables[rel.breakdown.table].find((r: any) => r.id === relatedId);
      if (!relatedRow) return [];

      const childEntity = buildEntity(relatedRow, rel.breakdown, spaceId, tables, geoEntities);
      return [
        {
          spaceId,
          type: normalizeToUUID(propertyToIdMap[rel.type]),
          toEntity: childEntity,
          entity: null
        }
      ];
    });
  });

  // --- add avatar / cover if specified ---
  if (breakdown.avatar && row.avatar) {
    relations.push({
      spaceId,
      type: normalizeToUUID(propertyToIdMap["avatar"]),
      toEntity: {
        internal_id: IdUtils.generate(),
        id: null,
        name: row.avatar,
        values: [],
        relations: [],
      },
      entity: null
    });
  }

  if (breakdown.cover && row.cover) {
    relations.push({
      spaceId,
      type: normalizeToUUID(propertyToIdMap["cover"]),
      toEntity: {
        internal_id: IdUtils.generate(),
        id: null,
        name: row.cover,
        values: [],
        relations: [],
      },
      entity: null
    });
  }

  // --- source relation ---
  if (breakdown.source) {
    relations.push({
      spaceId,
      type: normalizeToUUID(propertyToIdMap["sources"]),
      toEntity: {
        internal_id: IdUtils.generate(),
        id: breakdown.source,
        name: "Podchaser",
        values: [],
        relations: [],
      },
      entity: {
        internal_id: IdUtils.generate(),
        id: sourceEntityOnGeo?.id ?? null,
        entityOnGeo: sourceEntityOnGeo,
        name: null,
        values: [
          {
            spaceId,
            property: normalizeToUUID(propertyToIdMap["source_db_identifier"]),
            value: row.podchaser_id,
          }
        ],
        relations: [],
      }
    });
  }

  return {
    internal_id: IdUtils.generate(),
    id: geo_id,
    entityOnGeo,
    name: row.name,
    values,
    relations
  };
} //This function is too slow, using cached version instead

function printOps(ops: any) {
  const outputDir = path.join(__dirname, '');
  console.log("NUMBER OF OPS: ", ops.length);

  if (ops.length > 0) {
    // Get existing filenames in the directory
    const existingFiles = fs.readdirSync(outputDir);

    // Create output text
    const outputText = JSON.stringify(ops, null, 2);

    // Write to file
    const filename = `Properties input.txt`;
    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, outputText);

    console.log(`OPS PRINTED to ${filename}`);
  } else {
    console.log("NO OPS TO PRINT");
  }
}

async function publishOps(ops: any) {
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


export async function searchEntities_orig({
  spaceId,
  property,
  searchText,
  typeId,
  notTypeId
}: {
  spaceId?: string;
  property: string;
  searchText?: string;
  typeId?: string;
  notTypeId?: string;
}) {
  if (!searchText) {
    return null;
  }
  await new Promise(resolve => setTimeout(resolve, 200));

  const query = `
    query GetEntities(
      ${spaceId ? '$spaceId: String!' : ''}
      $property: String!
      $searchText: String!
      ${typeId ? '$typeId: String!' : ''}
      ${typeId ? '$typesPropertyId: String!' : ''}
      ${notTypeId ? '$notTypeId: String!' : ''}
      ${notTypeId ? '$typesPropertyId: String!' : ''}
    ) {
      entities(
        ${spaceId ? 'spaceId: $spaceId,' : ''}
        filter: {
          value: {
            property: $property,
            text: { is: $searchText }
          }
          ${typeId ? `relations: { typeId: $typesPropertyId, toEntityId: $typeId }` : ''}
          ${notTypeId ? `not: { relations: { typeId: $typesPropertyId, toEntityId: $notTypeId } }` : ''}
        }
      ) {
        id
        name
      }
    }
  `;

  const variables: Record<string, any> = {
    property: normalizeToUUID_STRING(property),
    searchText: cleanText(searchText),
    ...(spaceId && { spaceId: normalizeToUUID_STRING(spaceId) }),
    ...(typeId && {
      typeId: normalizeToUUID_STRING(typeId),
      typesPropertyId: SystemIds.TYPES_PROPERTY
    }),
    ...(notTypeId && {
      notTypeId: normalizeToUUID_STRING(notTypeId),
      typesPropertyId: SystemIds.TYPES_PROPERTY
    })
  };

  const data = await fetchWithRetry(query, variables);

  const entities = data?.data?.entities;

  if (entities?.length === 1) {
    return entities[0]?.id;
  } else if (entities?.length > 1) {
    console.error("DUPLICATE ENTITIES FOUND...");
    console.log(entities);
    return entities[0]?.id;
  }

  return null;
}


export async function searchEntities_old({
  name,
  type,
  spaceId,
  property,
  searchText,
  typeId,
  notTypeId
}: {
  name: string;
  type: string;
  spaceId?: string;
  property?: string;
  searchText?: string | string[];
  typeId?: string;
  notTypeId?: string;
}) {
  if (!searchText || (Array.isArray(searchText) && searchText.length === 0)) {
    return null;
  }
  await new Promise(resolve => setTimeout(resolve, 200));

  const isArray = Array.isArray(searchText);
  const normalizedProperty = normalizeToUUID_STRING(property);

  // GraphQL variables section
  const query = `
    query GetEntities(
      ${spaceId ? '$spaceId: String!' : ''}
      ${searchText ? '$orFilters: [EntityFilter!]' : '' }
      ${typeId ? '$typeId: String!' : ''}
      ${typeId || notTypeId ? '$typesPropertyId: String!' : ''}
      ${notTypeId ? '$notTypeId: String!' : ''}
    ) {
      entities(
        ${spaceId ? 'spaceId: $spaceId,' : ''}
        filter: {
          ${searchText ? 'or: $orFilters' : '' }
          ${typeId ? `relations: { typeId: $typesPropertyId, toEntityId: $typeId }` : ''}
          ${notTypeId ? `not: { relations: { typeId: $typesPropertyId, toEntityId: $notTypeId } }` : ''}
        }
      ) {
        id
        name
        values {
          spaceId
          propertyId
          value
        }
        relations {
          id
          spaceId
          fromId
          toId
          typeId
          entityId
          position
        }
      }
    }
  `;

  //console.log(query)

  const orFilters = Array.isArray(searchText)
    ? searchText.map(text => ({
        value: {
          property: normalizedProperty,
          text: { is: cleanText(text) }
        }
      }))
    : [{
        value: {
          property: normalizedProperty,
          text: { is: cleanText(searchText) }
        }
      }];

  const variables: Record<string, any> = {
    orFilters,
    ...(spaceId && { spaceId: normalizeToUUID_STRING(spaceId) }),
    ...(typeId && {
      typeId: normalizeToUUID_STRING(typeId),
      typesPropertyId: SystemIds.TYPES_PROPERTY
    }),
    ...(notTypeId && {
      notTypeId: normalizeToUUID_STRING(notTypeId),
      typesPropertyId: SystemIds.TYPES_PROPERTY
    })
  };


  const data = await fetchWithRetry(query, variables);
  const entities = data?.data?.entities;

  if (isArray) {
    return entities;
  }

  if (entities?.length === 1) {
    return entities[0]?.id;
  } else if (entities?.length > 1) {
    console.error("DUPLICATE ENTITIES FOUND...");
    console.log(entities);
    return entities[0]?.id;
  }

  return null;
}


  // GraphQL variables section
  //${spaceId ? '$spaceId: [UUID]' : ''}
  //${spaceId ? 'spaceIds: {containedBy: $spaceId},' : ''}  

export async function searchEntities_test({
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
                spaceId
                fromEntityId
                toEntityId
                typeId
                verified
                position
                toSpaceId
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

//
//const searchResult = await searchEntities_test({
//    name: "Marc Andreessen",
//    type: ["484a18c5-030a-499c-b0f2-ef588ff16d50", "331aea18-973c-4adc-8f53-614f598d262d", "7ed45f2b-c48b-419e-8e46-64d5ff680b0d"],
//    spaceId: ["b2565802-3118-47be-91f2-e59170735bac", "2df11968-9d1c-489f-91b7-bdc88b472161"]
//})


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
            SELECT 
                p.id, p.name, p.description, p.logo as avatar, p.podchaser_entity_id as podchaser_id, p.created_at as date_founded, p.is_explicit,
                COALESCE(array_agg(h.person_id) FILTER (WHERE h.person_id IS NOT NULL), '{}') AS host_ids
            FROM "${DB_ID}".${TABLES.PODCASTS} AS p
            LEFT JOIN "${DB_ID}".${TABLES.HOSTS} AS h
                ON p.id = h.podcast_id
            GROUP BY p.id
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

async function read_in_tables_local({
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
    
  let fileContent;
  let data;

  // Read the file
  fileContent = fs.readFileSync("tables_podcasts.txt", "utf-8");
  // Parse JSON back into array
  data = JSON.parse(fileContent);
  // If you want created_at and updated_at back as Date objects:
  const podcasts = data.map((item: any) => ({
    ...item,
    date_founded: new Date(item.date_founded),
  }));

  // Read the file
  fileContent = fs.readFileSync("tables_episodes.txt", "utf-8");
  // Parse JSON back into array
  data = JSON.parse(fileContent);
  // If you want created_at and updated_at back as Date objects:
  const episodes = data.map((item: any) => ({
    ...item,
    published_at: new Date(item.published_at),
    created_at: new Date(item.created_at),
    updated_at: new Date(item.updated_at),
  }));

  // Read the file
  fileContent = fs.readFileSync("tables_hosts.txt", "utf-8");
  // Parse JSON back into array
  data = JSON.parse(fileContent);
  // If you want created_at and updated_at back as Date objects:
  const hosts = data.map((item: any) => ({
    ...item,
    created_at: new Date(item.created_at),
  }));

  // Read the file
  fileContent = fs.readFileSync("tables_guests.txt", "utf-8");
  // Parse JSON back into array
  data = JSON.parse(fileContent);
  // If you want created_at and updated_at back as Date objects:
  const guests = data.map((item: any) => ({
    ...item,
    created_at: new Date(item.created_at),
  }));

  // Read the file
  fileContent = fs.readFileSync("tables_people.txt", "utf-8");
  // Parse JSON back into array
  data = JSON.parse(fileContent);
  // If you want created_at and updated_at back as Date objects:
  const people = data.map((item: any) => ({
    ...item,
    created_at: new Date(item.created_at),
    updated_at: new Date(item.updated_at),
  }));

  return { podcasts, episodes, hosts, guests, people };
}

type Value = {
  spaceId: string;
  property: string;
  value: string;
};

type Relation = {
  spaceId: string;
  type: string;
  toEntity: Entity;
  entity: Entity;
};

type Entity = {
    id: string;
    name: string;
    values: Value[]
    relations: Relation[]
};

function transformPodcastRows(
  podcasts: any[],
  people: any[],
  geo_people: any[],
  geo_podcasts: any[],
  spaceId: string,
) {
  return podcasts.map((podcast) => {
    const hosts = (podcast?.host_ids ?? [])
      .map((hostId: string) => {
        let geo_id = null;
        let sourceEntityOnGeo = null;
        let entityOnGeo = null;
        const person = people.find(p => p.id == hostId); // look up the full person
        if (!person) return null; // skip if no match

        /*
        while (matches.length > 1) {
          //Match by each unique identifier that I can [x_url, podchaser_id, etc.]
          //Need to confirm that both things have that property
          //Then if there are still multiple matches, use the highest ranked one. 
          //If same rank, use the one in the highest ranked space
          //If in same space, then they are duplicates and should be merged (probably, but generally, just choose one?)
          // - Would be nice if I always chose the same one, so I dont perpetuate a duplication problem
        }
        let match = null;
        if(matches.length == 1) {
          match = matches[0]
          geo_id = match.id
        }
        */

        let match = null;
        match = geo_people.find(p =>
          p.relations?.some(r =>
            r.typeId == normalizeToUUID(propertyToIdMap["sources"]) &&
            r.toEntityId == GEO_IDS.podchaserEntity &&
            r.entity?.values.some(v =>
              v.propertyId == normalizeToUUID(propertyToIdMap["source_db_identifier"]) &&
              v.value == person.podchaser_pcid
            )
          )
        );

        if (!match) {
          let matches = geo_people.filter(p =>
            p.name?.toLowerCase() == (person.name.toLowerCase()) &&
            p.relations?.some(r =>
              r.typeId == SystemIds.TYPES_PROPERTY && //8f151ba4-de20-4e3c-9cb4-99ddf96f48f1
              r.toEntityId == normalizeToUUID(typeToIdMap["person"]) //7ed45f2b-c48b-419e-8e46-64d5ff680b0d
            )
          )
          if (matches.length > 0) {
            console.log(matches)
          }
          match = matches[0]
        }
        if (match) {
          geo_id = match.id
          entityOnGeo = match
          console.log("Match found")
          sourceEntityOnGeo = entityOnGeo?.relations.find(r =>
            r.typeId == normalizeToUUID(propertyToIdMap["sources"]) &&
            r.toEntityId == GEO_IDS.podchaserEntity
          )?.entity;
        }

        return {
          spaceId,
          type: normalizeToUUID(propertyToIdMap["hosts"]),
          toEntity: {
            id: geo_id,
            entityOnGeo: entityOnGeo,
            name: person.name,
            values: [
              {
                spaceId,
                property: normalizeToUUID(propertyToIdMap["name"]),
                value: person.name,
              },
              //{
              //  spaceId,
              //  property: normalizeToUUID(propertyToIdMap["description"]),
              //  value: person.description ?? null,
              //},
              {
                spaceId,
                property: normalizeToUUID(propertyToIdMap["x_url"]),
                value: person.x_url ?? null,
              },
            ],
            relations: [
              {
                spaceId,
                type: normalizeToUUID(propertyToIdMap["avatar"]),
                toEntity: {
                  id: null,
                  name: person.logo ?? null,
                  values: [],
                  relations: [],
                },
                entity: null
              },
              {
                spaceId,
                type: normalizeToUUID(propertyToIdMap["sources"]),
                toEntity: {
                  id: GEO_IDS.podchaserEntity,
                  name: "Podchaser",
                  values: [],
                  relations: [],
                },
                entity: {
                  id: sourceEntityOnGeo?.id,
                  entityOnGeo: sourceEntityOnGeo,
                  name: null,
                  values: [
                    {
                      spaceId,
                      property: normalizeToUUID(propertyToIdMap["source_db_identifier"]),
                      value: person.podchaser_pcid,
                    }
                  ],
                  relations: [],
                }
              },
            ],
            entity: null
          },
        };
      })
      .filter(Boolean); // remove any nulls if person not found

      
    let geo_id = null;
    let entityOnGeo = null;
    let sourceEntityOnGeo = null;
    let match = null;
    match = geo_podcasts.find(p =>
      p.relations?.some(r =>
        r.typeId == normalizeToUUID(propertyToIdMap["sources"]) &&
        r.toEntityId == GEO_IDS.podchaserEntity &&
        r.entity?.values.some(v =>
          v.propertyId == normalizeToUUID(propertyToIdMap["source_db_identifier"]) &&
          v.value == podcast.podchaser_id
        )
      )
    );

    if (!match) {
      let matches = geo_podcasts.filter(p =>
        p.name?.toLowerCase() == (podcast.name.toLowerCase()) &&
        p.relations?.some(r =>
          r.typeId == SystemIds.TYPES_PROPERTY && //8f151ba4-de20-4e3c-9cb4-99ddf96f48f1
          r.toEntityId == normalizeToUUID(typeToIdMap["podcast"])
        )
      )
      if (matches.length > 0) {
        console.log(matches)
      }
      match = matches[0]
    }
    if (match) {
      geo_id = match.id
      entityOnGeo = match
      console.log("Match found")
      sourceEntityOnGeo = entityOnGeo?.relations.find(r =>
        r.typeId == normalizeToUUID(propertyToIdMap["sources"]) &&
        r.toEntityId == GEO_IDS.podchaserEntity
      )?.entity;
    }


    return {
      id: geo_id,
      entityOnGeo: entityOnGeo,
      name: podcast.name,
      values: [
        {
          spaceId,
          property: normalizeToUUID(propertyToIdMap["name"]),
          value: podcast.name ?? null,
        },
        {
          spaceId,
          property: normalizeToUUID(propertyToIdMap["description"]),
          value: podcast.description ?? null,
        },
        {
          spaceId,
          property: normalizeToUUID(propertyToIdMap["date_founded"]),
          value: podcast.date_founded?.toISOString?.() ?? null,
        },
        //{
        //  spaceId,
        //  property: normalizeToUUID(propertyToIdMap["is_explicit"]),
        //  value: podcast.is_explicit?.toString() ?? "false",
        //},
      ],
      relations: [
        {
          spaceId,
          type: SystemIds.TYPES_PROPERTY,
          toEntity: {
            id: normalizeToUUID(typeToIdMap['podcast']),
            name: null,
            values: [],
            relations: [],
          },
          entity: null,
        },
        {
          spaceId,
          type: normalizeToUUID(propertyToIdMap["avatar"]),
          toEntity: {
            id: null,
            name: podcast.avatar ?? null,
            values: [],
            relations: [],
          },
          entity: null,
        },
        {
          spaceId,
          type: normalizeToUUID(propertyToIdMap["sources"]),
          toEntity: {
            id: GEO_IDS.podchaserEntity,
            entityOnGeo: null,
            name: "Podchaser",
            values: [],
            relations: [],
          },
          entity: {
            id: sourceEntityOnGeo?.id,
            entityOnGeo: sourceEntityOnGeo, //dont necessarily know that this relation enetity isnt on geo bc I didnt check TODO: check for this, couldnt be that hard. Just filter the initial entityOnGeo
            name: null,
            values: [
              {
                spaceId,
                property: normalizeToUUID(propertyToIdMap["source_db_identifier"]),
                value: podcast.podchaser_id,
              }
            ],
            relations: [],
          }
        },
        ...hosts,
      ],
    };
  });
}


const offset = 0
const limit = 10
const pgClient = new PostgreSQLClient();

/*
let tables = await read_in_tables_local({
      pgClient: pgClient,
      offset: offset,
      limit: limit
  });




function normalizeValue(v: any): string {
  if (v.value !== undefined) return String(v.value);     // input style
  if (v.string !== undefined) return String(v.string);   // Geo API style
  if (v.number !== undefined) return String(v.number);
  if (v.boolean !== undefined) return String(v.boolean);
  if (v.time !== undefined) return String(v.time);
  if (v.point !== undefined) return String(v.point); //JSON.stringify(v.point); // if needed
  //if (v.unit !== undefined) return String(v.unit);
  //if (v.language !== undefined) return String(v.language);
  return "";
}

function flatten_api_response(response: any[]): any[] {
  return response.map(item => ({
    ...item,
    values: (item.values?.nodes ?? []).map((v: any) => ({
      spaceId: v.spaceId,
      propertyId: v.propertyId,
      value: normalizeValue(v) // normalized here
    })),
    relations: item.relations?.nodes ?? []
  }));
}


let fileContent;
// Read the file
fileContent = fs.readFileSync("geo_people.txt", "utf-8");
// Parse JSON back into array
const geo_people = JSON.parse(fileContent);
const flattened_people = flatten_api_response(geo_people)

// Read the file
fileContent = fs.readFileSync("geo_podcasts.txt", "utf-8");
// Parse JSON back into array
const geo_podcasts = JSON.parse(fileContent);
const flattened_podcasts = flatten_api_response(geo_podcasts)

//console.log(flattened_people[0].values)


const pods = transformPodcastRows(tables.podcasts, tables.people, flattened_people, flattened_podcasts, GEO_IDS.podcastsSpace)

const entity = pods[0]

await processEntity({
  currentOps: ops,
  entity: entity,
})
*/

/*
// Search geo to see if this project exists on Geo (search for podchaser ID, then search for name / type match as a secondary) // Then that will give us an "entity on Geo" if it does exist
console.log("starting matches")
let matches = flattened_people.filter(p =>
  p.name?.toLowerCase() == ("Hartej Sawney".toLowerCase()) &&
  p.relations?.some(r =>
    r.typeId === SystemIds.TYPES_PROPERTY && //8f151ba4-de20-4e3c-9cb4-99ddf96f48f1
    r.toEntityId === normalizeToUUID(typeToIdMap["person"]) //7ed45f2b-c48b-419e-8e46-64d5ff680b0d
  )
)


if (matches.length > 0) {
  console.log(matches)
}
//console.log(normalizeToUUID(typeToIdMap["person"]))
//console.log(normalizeToUUID(SystemIds.TYPES_PROPERTY))
*/

//Check whether entity exists on Geo [source identifier, website, x_url, name, etc]
// ------------------------------------
// [Should we search entity by entity?]
// - Then we should seach for db id first
// - Then we should search for name + other unique identifiers
// - Lastly we search for name only
// - If multiple, pick the one in the better space... or the one with more information published on it
// ------------------------------------
//If it does exist, then check to see whether all values exist already
//remove all values and relations that already exist on geo
// - For relations check if anything needs to be updated (position, etc.)
//If something already exists remove it
//If any values or relations are missing keep them and move on with posting

//ignore any null values or empty arrays.

//POST VALUES
//The same way I publish ops by spaceId, I should filter and add ops to the ops array by spaceId using createEntity
//If there are multiple space_ids in values, filter them out and apply `await addSpace(ops, currSpaceId)` to each individually
//Does it even make sense to have spaceIds in my entities?

//POST RELATIONS
//Loop through relations
//Check if it is an image property -> if so create image
//If not create the relation like normal, using the robust createRelation function that I made
//If to_entity is an object and has no geo_id, recursively call postEntity(), then from that, it will have the geo_id to use as the toEntityId
//Note: if the toEntity needs to be created, I will need to re-check whether that relation already exists on Geo, because I didnt have the toEntityId before...




/*
//SAVE POSTGRES RESPONSES
let text;
// Convert to JSON string
text = JSON.stringify(tables.podcasts, null, 2); // pretty-print with 2 spaces
// Save as .txt file
fs.writeFileSync("tables_podcasts.txt", text, "utf-8");

// Convert to JSON string
text = JSON.stringify(tables.episodes, null, 2); // pretty-print with 2 spaces
// Save as .txt file
fs.writeFileSync("tables_episodes.txt", text, "utf-8");

// Convert to JSON string
text = JSON.stringify(tables.hosts, null, 2); // pretty-print with 2 spaces
// Save as .txt file
fs.writeFileSync("tables_hosts.txt", text, "utf-8");

// Convert to JSON string
text = JSON.stringify(tables.guests, null, 2); // pretty-print with 2 spaces
// Save as .txt file
fs.writeFileSync("tables_guests.txt", text, "utf-8");

// Convert to JSON string
text = JSON.stringify(tables.people, null, 2); // pretty-print with 2 spaces
// Save as .txt file
fs.writeFileSync("tables_people.txt", text, "utf-8");


//SAVE GEO API RESPONSES
const geo_people = await searchEntities_test({
  type: [SystemIds.PERSON_TYPE]
})
// Convert to JSON string
text = JSON.stringify(geo_people, null, 2); // pretty-print with 2 spaces
// Save as .txt file
fs.writeFileSync("geo_people.txt", text, "utf-8");

const geo_topics = await searchEntities_test({
  type: [typeToIdMap['topic']]
})
// Convert to JSON string
text = JSON.stringify(geo_topics, null, 2); // pretty-print with 2 spaces
// Save as .txt file
fs.writeFileSync("geo_topics.txt", text, "utf-8");

const geo_projects = await searchEntities_test({
  type: [typeToIdMap['project']]
})
// Convert to JSON string
text = JSON.stringify(geo_projects, null, 2); // pretty-print with 2 spaces
// Save as .txt file
fs.writeFileSync("geo_projects.txt", text, "utf-8");

const geo_podcasts = await searchEntities_test({
  type: [typeToIdMap['podcast']]
})
// Convert to JSON string
text = JSON.stringify(geo_podcasts, null, 2); // pretty-print with 2 spaces
// Save as .txt file
fs.writeFileSync("geo_podcasts.txt", text, "utf-8");

const geo_episodes = await searchEntities_test({
  type: [typeToIdMap['episode']]
})
// Convert to JSON string
text = JSON.stringify(geo_episodes, null, 2); // pretty-print with 2 spaces
// Save as .txt file
fs.writeFileSync("geo_episodes.txt", text, "utf-8");
*/

/*
// Read the file
const fileContent = fs.readFileSync("tables_people.txt", "utf-8");
// Parse JSON back into array
const data = JSON.parse(fileContent);
// If you want created_at and updated_at back as Date objects:
const parsedData = data.map((item: any) => ({
  ...item,
  created_at: new Date(item.created_at),
  updated_at: new Date(item.updated_at),
}));

console.log(parsedData)
*/





/*
const flattened_people = geo_people.map(item => ({
  ...item,
  values: item.values?.nodes ?? [],       // take nodes array or empty array
  relations: item.relations?.nodes ?? [], // same for relations
}));

const geo_podcasts = await searchEntities_test({
  type: [normalizeToUUID(typeToIdMap['podcast'])]
})

const flattened_podcasts = geo_podcasts.map(item => ({
  ...item,
  values: item.values?.nodes ?? [],       // take nodes array or empty array
  relations: item.relations?.nodes ?? [], // same for relations
}));

const pods = transformPodcastRows(tables.podcasts, tables.people, flattened_people, flattened_podcasts, GEO_IDS.podcastsSpace)

console.log(flattened.filter(
  p => p.name?.toLowerCase().includes("Joe".toLowerCase())
))
*/


const podcasts = await pgClient.query(`
    SELECT 
        p.*,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'to_id', h.person_id,
              'entity_id', null
            )
          ) FILTER (WHERE h.id IS NOT NULL),
          '[]'
        ) AS hosts,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'to_id', t.id,
              'entity_id', null
            )
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'
        ) AS topics,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'to_id', e.platform,
              'entity_id', e.id
            )
          ) FILTER (WHERE e.id IS NOT NULL),
          '[]'
        ) AS sources
    FROM "${DB_ID}".${TABLES.PODCASTS} AS p
    LEFT JOIN "${DB_ID}".${TABLES.HOSTS} AS h
        ON p.id = h.podcast_id
    LEFT JOIN "${DB_ID}".${TABLES.PODCHASER_CATEGORIES} AS t
        ON p.id = t.podcast_id
    LEFT JOIN "${DB_ID}".${TABLES.EXTERNAL_IDS} AS e
      ON p.id = e.podcast_id
    WHERE name = 'The Joe Rogan Experience'
    GROUP BY p.id
    LIMIT ${limit} OFFSET ${offset}
`);

const sources = await pgClient.query(`
  SELECT DISTINCT platform
  FROM "${DB_ID}".${TABLES.EXTERNAL_IDS}
`);

console.log(sources)

