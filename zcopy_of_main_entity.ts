import { Graph, IdUtils, SystemIds, type Op } from '@graphprotocol/grc-20';
import * as fs from "fs";
//import { publish } from './src/publish';
import { addSpace, cleanText, fetchWithRetry, filterOps, GEO_IDS, getSpaces, normalizeToUUID, normalizeToUUID_STRING, propertyToIdMap, propertyToTypeIdMap, readAllOpsFromFolder, testnetWalletAddress, typeToIdMap } from './src/constants';
import path from 'path';
import PostgreSQLClient, { TABLES, DB_ID } from "./src/postgres-client";
import { processEntity } from './post_entity';
import { printOps, publishOps, searchEntities } from './archive/functions';


async function read_in_tables({
  pgClient,
  offset,
  limit,
}: {
  pgClient: any;
  offset?: number;
  limit?: number;
}): Promise<{
    podcasts: any; episodes: any; hosts: any; guests: any; people: any; topics: any;
}> {
    

    /*
    // get all tables in the current database
        const podcasts = await pgClient.query(`
            SELECT 
                p.id, p.name, p.description, p.logo as avatar, p.podchaser_entity_id as source_db_identifier, p.created_at as date_founded, p.is_explicit, p.rss_feed_url,
                COALESCE(array_agg(h.person_id) FILTER (WHERE h.person_id IS NOT NULL), '{}') AS hosts,
                COALESCE(array_agg(t.id) FILTER (WHERE t.id IS NOT NULL), '{}') AS topics
            FROM "${DB_ID}".${TABLES.PODCASTS} AS p
            LEFT JOIN "${DB_ID}".${TABLES.HOSTS} AS h
                ON p.id = h.podcast_id
            LEFT JOIN "${DB_ID}".${TABLES.PODCHASER_CATEGORIES} AS t
                ON p.id = t.podcast_id
            GROUP BY p.id
            LIMIT ${limit} OFFSET ${offset}
        `);
        */
    const podcasts = await pgClient.query(`
        SELECT 
            p.id, p.name, p.description, p.logo as avatar, p.podchaser_entity_id as source_db_identifier, p.created_at as date_founded, p.is_explicit, p.rss_feed_url,
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


        const podcastIds = [
            ...new Set(
                podcasts
                .flatMap((row: any) => [row.id])
                .filter(Boolean)
            ),
        ];
        console.log("Podcast read")
        const episodes = podcastIds.length
        ? await pgClient.query(`
            SELECT e.id, ARRAY[e.podcast_id] as podcast, e.name, e.description, e.episode_number, e.duration, e.published_at as air_date, e.logo as avatar, e.audio_url, e.podchaser_entity_id as source_db_identifier,
            COALESCE(array_agg(g.person_id) FILTER (WHERE g.role = 'guest'), '{}') AS guests,
            COALESCE(array_agg(g.person_id) FILTER (WHERE g.role = 'host'), '{}') AS hosts
            FROM "${DB_ID}".${TABLES.EPISODES} as e
            LEFT JOIN "${DB_ID}".${TABLES.GUESTS} AS g
                ON e.id = g.episode_id
            WHERE podcast_id IN (${podcastIds.map((id) => `'${id}'`).join(",")})
            GROUP BY e.id
            LIMIT 2
        `)
        : [];
        console.log("Episodes read")
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
            personWhereClauses.push(`p.id IN (${hostIds.map((id) => `'${id}'`).join(",")})`);
        }

        if (guestIds.length > 0) {
            personWhereClauses.push(`p.id IN (${guestIds.map((id) => `'${id}'`).join(",")})`);
        }

        const people = personWhereClauses.length
            ? await pgClient.query(`
                SELECT 
                    p.id, p.name, p.logo as avatar, p.x_url, p.linkedin_url, p.medium_url, p.wikipedia_url, p.podchaser_entity_id, p.podchaser_pcid as source_db_identifier,
                    COALESCE(array_agg(t.id) FILTER (WHERE t.id IS NOT NULL), '{}') AS topics
                FROM "${DB_ID}".${TABLES.PEOPLE} as p
                LEFT JOIN "${DB_ID}".${TABLES.PODCHASER_CATEGORIES} AS t
                    ON p.id = t.person_id
                WHERE ${personWhereClauses.join(" OR ")}
                GROUP BY p.id
                `)
            : [];

        const topics = await pgClient.query(`
            SELECT id, text as name
            FROM "${DB_ID}".${TABLES.PODCHASER_CATEGORIES}
            `);

    return { podcasts, episodes, hosts, guests, people, topics };
}


// Cache to store already-built entities by table + id
const entityCache: Record<string, Record<string, any>> = {};

function buildEntityCached(
  row: any,
  breakdown: any,
  spaceId: string,
  tables: Record<string, any[]>,
  geoEntities: Record<string, any[]>,
  cache: Record<string, Record<string, any>>
): any {
  const tableName = breakdown.table;

  // Check cache first
  cache[tableName] = cache[tableName] || {};
  if (cache[tableName][row.id]) {
    return cache[tableName][row.id];
  }

  // --- original buildEntity logic ---
  let geo_id: string | null = null;
  let entityOnGeo: any = null;
  let sourceEntityOnGeo: any = null;
  let match: any = null;

  const geoRows = geoEntities[tableName] ?? [];

  if (breakdown.source) {
    match = geoRows.find(p =>
      p.relations?.some(r =>
        r.typeId == normalizeToUUID(propertyToIdMap["sources"]) &&
        r.toEntityId == breakdown.source &&
        Array.isArray(r?.entity?.values) &&
        r.entity.values.some(v =>
          v.propertyId == normalizeToUUID(propertyToIdMap["source_db_identifier"]) &&
          v.value == row.source_db_identifier
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
        ) &&
        p.relations?.none(r =>
            r.typeId == normalizeToUUID(propertyToIdMap["sources"]) &&
            r.toEntityId == breakdown.source
        )

    );
    match = matches[0];
  }

  if (match) {
    geo_id = match.id;
    entityOnGeo = match;
    sourceEntityOnGeo = entityOnGeo?.relations.find(r =>
        r.typeId == normalizeToUUID(propertyToIdMap["sources"]) &&
        r.toEntityId == breakdown.source
    )?.entity;
  }

  const values = (breakdown.value_fields ?? []).flatMap((field: string) => {
    const val = row[field];
    return val != null
      ? [{ 
        spaceId, 
        property: normalizeToUUID(propertyToIdMap[field]), 
        //value: val 
        value: typeof val === "object" && val instanceof Date ? val.toISOString() : String(val),
      }]
      : [];
  });

  const relations = (breakdown.relations ?? []).flatMap((rel: any) => {
    const relatedIds = row[rel.type] ?? [];
    return relatedIds.flatMap((relatedId: string) => {
      const relatedRow = tables[rel.breakdown.table].find((r: any) => r.id === relatedId);
      if (!relatedRow) return [];

      // Use cached entity for children
      const childEntity = buildEntityCached(relatedRow, rel.breakdown, spaceId, tables, geoEntities, cache);
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

  for (const type of breakdown.types) {
    relations.push({
        spaceId,
        type: SystemIds.TYPES_PROPERTY,
        toEntity: { internal_id: IdUtils.generate(), id: type, name: null, values: [], relations: [] },
        entity: null
    });
  }

  if (breakdown.avatar && row.avatar) {
    relations.push({
      spaceId,
      type: normalizeToUUID(propertyToIdMap["avatar"]),
      toEntity: { internal_id: IdUtils.generate(), id: null, name: row.avatar, values: [], relations: [] },
      entity: null
    });
  }

  if (breakdown.cover && row.cover) {
    relations.push({
      spaceId,
      type: normalizeToUUID(propertyToIdMap["cover"]),
      toEntity: { internal_id: IdUtils.generate(), id: null, name: row.cover, values: [], relations: [] },
      entity: null
    });
  }

  if (breakdown.source) {
    relations.push({
      spaceId,
      type: normalizeToUUID(propertyToIdMap["sources"]),
      toEntity: { internal_id: IdUtils.generate(), id: breakdown.source, name: null, values: [], relations: [] },
      entity: {
        internal_id: IdUtils.generate(),
        id: sourceEntityOnGeo?.id ?? null,
        entityOnGeo: sourceEntityOnGeo,
        name: null,
        values: [
          { spaceId, property: normalizeToUUID(propertyToIdMap["source_db_identifier"]), value: String(row.source_db_identifier) }
        ],
        relations: [],
      }
    });
  }
  /*
  for (const tab of breakdown.tabs) {
    if (tab.name == "Overview") {
        relations.push({
            spaceId,
            type: SystemIds.BLOCKS, // TODO - I need to figure out whether a tab / block already exists or not...
            toEntity: { internal_id: IdUtils.generate(), id: null, name: null, values: [], relations: [] },
            entity: null
        });

    } else {

    }
    relations.push({
        spaceId,
        type: SystemIds.TYPES_PROPERTY,
        toEntity: { internal_id: IdUtils.generate(), id: type, name: null, values: [], relations: [] },
        entity: null
    });
  }*/

  const entity = { internal_id: IdUtils.generate(), id: geo_id, entityOnGeo, name: row.name, values, relations };

  // Save to cache
  cache[tableName][row.id] = entity;

  return entity;
}

function normalizeValue(v: any): string {
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


const topicBreakdown = {
    table: "topics",
    types: [normalizeToUUID(typeToIdMap['topic'])],
    value_fields: ["name"],
    avatar: false,
    cover: false,
    source: null,
    relations: [],
    //tabs: []
}

const platformBreakdown = {
    table: "platforms",
    types: [normalizeToUUID(typeToIdMap['project'])],
    value_fields: ["name", 'web_url'],
    avatar: true,
    cover: false,
    source: null,
    relations: [],
    //tabs: []
}

const sourceBreakdown = {
    table: "sources",
    types: [normalizeToUUID(typeToIdMap['source'])],
    value_fields: ["source_db_identifier", 'web_url'],
    avatar: true,
    cover: false,
    source: null,
    relations: [],
    //tabs: []
}

const personBreakdown = {
    table: "people",
    types: [normalizeToUUID(typeToIdMap['person'])],
    value_fields: ["name", "x_url"],
    avatar: true,
    cover: false,
    source: GEO_IDS.podchaserEntity,
    relations: [
        //{
        //    type: "topics",
        //    toEntityBreakdown: topicBreakdown
        //}
    ],
    //tabs: []
}
const podcastBreakdown = {
    table: "podcasts",
    types: [normalizeToUUID(typeToIdMap['podcast'])],
    value_fields: ["name", "description", "date_founded", 'rss_feed_url'],
    avatar: true,
    cover: false,
    source: GEO_IDS.podchaserEntity,
    relations: [
        {
            type: "hosts",
            toEntityBreakdown: personBreakdown,
            entityBreakdown: null
        },
        {
            type: "sources",
            toEntityBreakdown: platformBreakdown,
            entityBreakdown: sourceBreakdown
        },
        //{
        //    type: "topics",
        //    breakdown: topicBreakdown
        //}
    ],
    /*
    tabs: [
        {
            name: "Overview",
            blocks: [
                {
                    name: "Episodes",
                    types: [SystemIds.DATA_BLOCK],
                    data_source_type: SystemIds.QUERY_DATA_SOURCE,
                    columns: [],
                    view: null,
                    values: [
                        {
                            property: SystemIds.FILTER,
                            value: `{"spaceId":{"in":["${GEO_IDS.podcastsSpace}"]},
                                    "filter":{
                                        "${SystemIds.TYPES_PROPERTY}":{"is":"${normalizeToUUID(typeToIdMap['episode'])}"},
                                        "${normalizeToUUID(propertyToIdMap["podcast"])}":{"is":"INSERT_ENTITY_GEO_ID"}
                                    }}`
                        }
                    ],
                    relations: []
                }
            ]
        }
    ]*/
}

//WHEN CHECKING FOR NAME MATCHES, MAKE SURE THE SOURCE ID IS BLANK

const episodeBreakdown = {
    table: "episodes",
    types: [normalizeToUUID(typeToIdMap['episode'])],
    value_fields: ["name", "description", "episode_number", "air_date", "duration", "audio_url"], 
    avatar: true,
    cover: false,
    source: GEO_IDS.podchaserEntity,
    relations: [
        {
            type: "hosts",
            toEntityBreakdown: personBreakdown,
            entityBreakdown: null
        },
        {
            type: "guests",
            toEntityBreakdown: personBreakdown,
            entityBreakdown: null
        },
        {
            type: "podcast",
            toEntityBreakdown: podcastBreakdown,
            entityBreakdown: null
        }
    ],
    //tabs: []
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
    internal_id: string;
    id: string;
    entityOnGeo: any
    name: string;
    values: Value[]
    relations: Relation[]
};

const ops: Array<Op> = [];
let addOps;
const processingCache: Record<string, Entity> = {};

const offset = 0
const limit = 1
const pgClient = new PostgreSQLClient();
// global or passed down as a parameter


process.on('SIGINT', async () => {
    console.log("FINAL OFFSET: ", offset);
    console.log('Exiting gracefully...');
    await pgClient.close();
    process.exit(0);
});

try {
    const geoEntities = {
        people: flatten_api_response(await searchEntities({
                    type: personBreakdown.types
                })), 
        podcasts: flatten_api_response(await searchEntities({
                    type: podcastBreakdown.types
                })), 
        episodes: flatten_api_response(await searchEntities({
                    type: episodeBreakdown.types
                }))
    }

    console.log("GEO API READ")

    let tables = await read_in_tables({
        pgClient: pgClient,
        offset: offset,
        limit: limit
    });

    console.log("TABLES OUTPUT")
    //console.log(tables.people)
    const formattedPodcasts = tables.podcasts.map(p =>
        buildEntityCached(p, podcastBreakdown, GEO_IDS.podcastsSpace, tables, geoEntities, entityCache)
    );
    console.log(formattedPodcasts)

    /*
    for (const podcast of formattedPodcasts) {
        addOps = await processEntity({
            currentOps: ops,
            processingCache: processingCache,
            entity: podcast
        })
        ops.push(...addOps.ops)
    }


    
    const formattedEpisodes = tables.episodes.map(p =>
        buildEntityCached(p, episodeBreakdown, GEO_IDS.podcastsSpace, tables, geoEntities, entityCache)
    );
    for (const episode of formattedEpisodes) {
        addOps = await processEntity({
            currentOps: ops,
            processingCache: processingCache,
            entity: episode
        })
        ops.push(...addOps.ops)
    }
    
    //console.log(processingCache)
    printOps(ops, "test_push_podast.txt")
    //await publishOps(ops)
    /*
    const formattedPodcasts = tables.podcasts.map(p =>
        buildEntity(p, podcastBreakdown, GEO_IDS.podcastsSpace, tables, geoEntities)
    );
    console.log(formattedPodcasts[0].relations)
    const formattedEpisodes = tables.episodes.map(p =>
        buildEntity(p, episodeBreakdown, GEO_IDS.podcastsSpace, tables, geoEntities)
    );
    console.log(formattedEpisodes[0].relations)
    */

} catch (error) {
    console.error(error);
} finally {
    await pgClient.close();
}



