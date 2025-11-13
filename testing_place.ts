import { Graph, IdUtils, SystemIds, type Op } from '@graphprotocol/grc-20';
import * as fs from "fs";
//import { publish } from './src/publish';
import { addSpace, cleanText, fetchWithRetry, filterOps, GEO_IDS, getSpaces, normalizeToUUID, normalizeToUUID_STRING, propertyToIdMap, propertyToTypeIdMap, readAllOpsFromFolder, testnetWalletAddress, typeToIdMap } from './src/constants';
import path from 'path';
import PostgreSQLClient, { TABLES, DB_ID } from "./src/postgres-client";
import { processEntity } from './post_entity';
import { printOps, publishOps, searchEntities } from './archive/functions';


// --- Helpers ---

function extractUrls_v1(values: any[] = []): string[] {
  return values
    .map(v => v.value)
    .filter(v => typeof v === "string" && /^https?:\/\//i.test(v));
}

function extractUrls(values: any[] = [], isApi: boolean = false): { url: string; propertyId: string }[] {
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

function normalizeName(name: string = ""): string | null {
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

function levenshtein(a: string, b: string): number {
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

function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

// --- Main matcher ---

function matchEntities_v1(localEntities: any[], apiEntities: any[], propertyToIdMap: any): any[] {
  const sourcesUUID = normalizeToUUID(propertyToIdMap["sources"]);
  const sourceIdUUID = normalizeToUUID(propertyToIdMap["source_db_identifier"]);

  return localEntities.map(local => {
    let match: any = null;

    // 2. Match on URL
    if (!match) {
      const localUrls = extractUrls(local.values);
      match = apiEntities.find(api => {
        const apiUrls = extractUrls(api.values);
        return localUrls.some(u => apiUrls.includes(u));
      });
    }

    // 3. Match on name similarity
    if (!match) {
      const localName = normalizeName(local.name);
      let bestScore = 0;
      let bestMatch: any = null;

      for (const api of apiEntities) {
        const apiName = normalizeName(api.name);
        const score = stringSimilarity(localName, apiName);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = api;
        }
      }
      if (bestScore > 0.9) match = bestMatch; // adjust threshold as needed
    }

    // 4. Attach result
    return {
      ...local,
      entityOnGeo: match ? match.id : null,
    };
  });
}

type LocalEntity = {
  internal_id: string;
  name?: string;
  values: { property: string; value: string }[];
  relations: any[];
  toEntity?: LocalEntity;
};

type ApiEntity = {
  id: string;
  name: string | null;
  values: { propertyId: string; value?: string; string?: string }[];
  relations: any[];
};

const isUrl = (str: string) => {
  if (!str || typeof str !== "string") return false;
  const domainPattern = /\.(com|org|net|io|gov|edu|co|fm|tv|me)(\/|$)/i;
  return str.startsWith("http://") || str.startsWith("https://") || domainPattern.test(str);
};


function matchEntities(
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




async function read_in_tables({
  pgClient,
  offset,
  limit,
}: {
  pgClient: any;
  offset?: number;
  limit?: number;
}): Promise<{
    podcasts: any; episodes: any; hosts: any; guests: any; people: any; topics: any; sources: any; roles: any; platforms: any; listen_on_links: any;
}> {
    console.log("before")
    const podcasts = await pgClient.query(`
      SELECT 
          p.id, p.name, p.description, p.logo as avatar, p.created_at as date_founded, p.is_explicit, p.rss_feed_url,
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
                'to_id', l.platform_id,
                'entity_id', l.id
              )
            ) FILTER (WHERE l.id IS NOT NULL),
            '[]'
          ) AS listen_on,
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
                'to_id', ex.platform_id,
                'entity_id', ex.id
              )
            ) FILTER (WHERE (ex.id IS NOT NULL) AND (ex.external_db_id <> 'NOT_FOUND')),
            '[]'
          ) AS sources
      FROM "${DB_ID}".${TABLES.PODCASTS} AS p
      LEFT JOIN "${DB_ID}".${TABLES.HOSTS} AS h
          ON p.id = h.podcast_id
      LEFT JOIN "${DB_ID}".${TABLES.PODCHASER_CATEGORIES} AS t
          ON p.id = t.podcast_id
      LEFT JOIN "${DB_ID}".${TABLES.EXTERNAL_IDS} AS ex
        ON p.id = ex.podcast_id
      LEFT JOIN "${DB_ID}".${TABLES.LISTEN_ON} AS l
        ON p.id = l.podcast_id
      WHERE name IN ('Freakonomics Radio', 'The Daily', 'Lex Fridman Podcast')
      GROUP BY p.id
      LIMIT ${limit} OFFSET ${offset}
  `);
    //'Bankless', 'The Joe Rogan Experience', 'Freakonomics Radio', 'The Daily', 'Lex Fridman Podcast', 'Today, Explained', 'The Genius Life'

    console.log("Podcast read")
        const podcastIds = [
            ...new Set(
                podcasts
                .flatMap((row: any) => [row.id])
                .filter(Boolean)
            ),
        ];
        //COALESCE(array_agg(g.person_id) FILTER (WHERE g.role = 'guest'), '{}') AS guests,
        //COALESCE(array_agg(g.person_id) FILTER (WHERE g.role IN ('host', 'coHost', 'guest_host', 'guestHost')), '{}') AS hosts,
        //ARRAY[e.podcast_id] as podcast,
        console.log("Podcast read")

        const episodes = podcastIds.length
          ? await pgClient.query(`
            WITH ranked_episodes AS (
              SELECT 
                e.id,
                e.name,
                e.description,
                e.episode_number,
                e.duration,
                e.published_at AS air_date,
                e.logo AS avatar,
                e.audio_url,
                e.podcast_id,
                ROW_NUMBER() OVER (
                  PARTITION BY e.podcast_id 
                  ORDER BY e.published_at DESC
                ) AS rn
              FROM "${DB_ID}".${TABLES.EPISODES} AS e
              WHERE e.podcast_id IN (${podcastIds.map(id => `'${id}'`).join(",")})
            )
            SELECT 
              e.id,
              e.name,
              e.description,
              e.episode_number,
              e.duration,
              e.air_date,
              e.avatar,
              e.audio_url,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object('to_id', e.podcast_id, 'entity_id', null)) FILTER (WHERE e.podcast_id IS NOT NULL),
                '[]'
              ) AS podcast,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object('to_id', g.person_id, 'entity_id', null)) FILTER (WHERE g.role = 'guest'),
                '[]'
              ) AS guests,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object('to_id', g.person_id, 'entity_id', null)) FILTER (WHERE g.role IN ('host', 'coHost', 'guest_host', 'guestHost')),
                '[]'
              ) AS hosts,
              COALESCE(
                json_agg(
                  DISTINCT jsonb_build_object(
                    'to_id', ex.platform_id,
                    'entity_id', ex.id,
                    'external_db_key', ex.external_db_key,
                    'external_db_id', ex.external_db_id
                  )
                ) FILTER (WHERE (ex.id IS NOT NULL) AND (ex.external_db_id <> 'NOT_FOUND')),
                '[]'
              ) AS sources
            FROM ranked_episodes e
            LEFT JOIN "${DB_ID}".${TABLES.GUESTS} AS g ON e.id = g.episode_id
            LEFT JOIN "${DB_ID}".${TABLES.EXTERNAL_IDS} AS ex ON e.id = ex.podcast_episode_id
            LEFT JOIN "${DB_ID}".${TABLES.LISTEN_ON} AS l ON e.id = l.podcast_episode_id
            WHERE e.rn <= 100
            GROUP BY e.id, e.name, e.description, e.episode_number, e.duration,
                      e.air_date, e.avatar, e.audio_url, e.podcast_id
            ORDER BY e.air_date DESC;
          `)
          : [];
        /*
        const episodes = podcastIds.length
        ? await pgClient.query(`
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
            WHERE e.podcast_id IN (${podcastIds.map((id) => `'${id}'`).join(",")})
            GROUP BY e.id
            ORDER BY e.published_at DESC
        `)
        : [];

        
       const episodes = podcastIds.length
        ? await pgClient.query(`
            WITH ranked_episodes AS (
              SELECT 
                e.id,
                e.name,
                e.description,
                e.episode_number,
                e.duration,
                e.published_at AS air_date,
                e.logo AS avatar,
                e.audio_url,
                e.podcast_id,
                ROW_NUMBER() OVER (
                  PARTITION BY e.podcast_id 
                  ORDER BY e.published_at DESC
                ) AS rn
              FROM "${DB_ID}".${TABLES.EPISODES} AS e
              WHERE e.podcast_id IN (${podcastIds.map(id => `'${id}'`).join(",")})
            )
            SELECT 
              e.id,
              e.name,
              e.description,
              e.episode_number,
              e.duration,
              e.air_date,
              e.avatar,
              e.audio_url,
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
                ) FILTER ((ex.id IS NOT NULL) AND (ex.external_db_id <> 'NOT_FOUND')),
                '[]'
              ) AS sources
            FROM ranked_episodes e
            LEFT JOIN "${DB_ID}".${TABLES.GUESTS} AS g
              ON e.id = g.episode_id
            LEFT JOIN "${DB_ID}".${TABLES.EXTERNAL_IDS} AS ex
              ON e.id = ex.podcast_episode_id
            LEFT JOIN "${DB_ID}".${TABLES.LISTEN_ON} AS l
              ON e.id = l.podcast_episode_id
            WHERE e.rn <= 10
            GROUP BY 
              e.id, e.name, e.description, e.episode_number, e.duration,
              e.air_date, e.avatar, e.audio_url, e.podcast_id
            ORDER BY e.air_date DESC;
          `)
        : [];
        */


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

        const guests = podcastIds.length //ARRAY[role] as roles,
        ? await pgClient.query(`
            SELECT id, person_id, episode_id, 
            COALESCE(
              json_agg(
                DISTINCT jsonb_build_object(
                  'to_id', role,
                  'entity_id', null
                )
              ) FILTER (WHERE role IS NOT NULL),
              '[]'
            ) AS roles
            FROM "${DB_ID}".${TABLES.GUESTS}
            WHERE episode_id IN (${episodeIds.map((id) => `'${id}'`).join(",")})
            GROUP BY id
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

        //COALESCE(array_agg(t.id) FILTER (WHERE t.id IS NOT NULL), '{}') AS topics,
        const people = personWhereClauses.length
            ? await pgClient.query(`
                SELECT 
                    p.id, p.name, p.logo as avatar, p.x_url, p.linkedin_url, p.medium_url, p.wikipedia_url,
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
                          'to_id', ex.platform_id,
                          'entity_id', ex.id
                        )
                      ) FILTER (WHERE (ex.id IS NOT NULL) AND (ex.external_db_id <> 'NOT_FOUND')),
                      '[]'
                    ) AS sources
                FROM "${DB_ID}".${TABLES.PEOPLE} as p
                LEFT JOIN "${DB_ID}".${TABLES.PODCHASER_CATEGORIES} AS t
                    ON p.id = t.person_id
                LEFT JOIN "${DB_ID}".${TABLES.EXTERNAL_IDS} AS ex
                    ON p.id = ex.person_id
                WHERE ${personWhereClauses.join(" OR ")}
                GROUP BY p.id
                `)
            : [];

        const topics = await pgClient.query(`
            SELECT id, text as name
            FROM "${DB_ID}".${TABLES.PODCHASER_CATEGORIES}
            `);






        const podcastListenOnIds = [
          ...new Set(
            podcasts
              .flatMap((p: any) => p.listen_on?.map((s: any) => s.entity_id) || [])
              .filter(Boolean)
          ),
        ];

        const episodeListenOnIds = [
          ...new Set(
            episodes
              .flatMap((e: any) => e.listen_on?.map((s: any) => s.entity_id) || [])
              .filter(Boolean)
          ),
        ];
        let listenOnWhereClauses = [];
        if (podcastListenOnIds.length > 0) {
            listenOnWhereClauses.push(`id IN (${podcastListenOnIds.map((id) => `'${id}'`).join(",")})`);
        }
        if (episodeListenOnIds.length > 0) {
            listenOnWhereClauses.push(`id IN (${episodeListenOnIds.map((id) => `'${id}'`).join(",")})`);
        }
        const listen_on_links = listenOnWhereClauses.length
          ? await pgClient.query(`
              SELECT 
                  id, podcast_id, podcast_episode_id, platform_id, url as web_url
              FROM "${DB_ID}".${TABLES.LISTEN_ON}
              WHERE ${listenOnWhereClauses.join(" OR ")}
              `)
          : [];



        const podcastSourceIds = [
          ...new Set(
            podcasts
              .flatMap((p: any) => p.sources?.map((s: any) => s.entity_id) || [])
              .filter(Boolean)
          ),
        ];

        const episodeSourceIds = [
          ...new Set(
            episodes
              .flatMap((e: any) => e.sources?.map((s: any) => s.entity_id) || [])
              .filter(Boolean)
          ),
        ];

        const peopleSourceIds = [
          ...new Set(
            people
              .flatMap((p: any) => p.sources?.map((s: any) => s.entity_id) || [])
              .filter(Boolean)
          ),
        ];

        let sourceWhereClauses = [];
        if (podcastSourceIds.length > 0) {
            sourceWhereClauses.push(`e.id IN (${podcastSourceIds.map((id) => `'${id}'`).join(",")})`);
        }
        if (episodeSourceIds.length > 0) {
            sourceWhereClauses.push(`e.id IN (${episodeSourceIds.map((id) => `'${id}'`).join(",")})`);
        }
        if (peopleSourceIds.length > 0) {
            sourceWhereClauses.push(`e.id IN (${peopleSourceIds.map((id) => `'${id}'`).join(",")})`);
        }
        const sources = sourceWhereClauses.length
            ? await pgClient.query(`
                SELECT 
                    e.id, e.podcast_id, e.podcast_episode_id, e.platform_id, e.person_id, e.website as web_url, e.external_db_id as source_db_identifier, e.external_db_key as source_db_key
                FROM "${DB_ID}".${TABLES.EXTERNAL_IDS} as e
                WHERE (${sourceWhereClauses.join(" OR ")}) 
                  AND (e.external_db_id <> 'NOT_FOUND')
                  AND (e.external_db_key <> 'guid') 
                  AND (e.external_db_key <> 'pcid')
                `)
            : [];




        const platformIds = [
            ...new Set(
                sources
                .flatMap((row: any) => [row.platform_id])
                .filter(Boolean)
            ),
        ];
        const platforms = platformIds.length
        ? await pgClient.query(`
            SELECT id, name, website as web_url, description, logo as avatar FROM "${DB_ID}".${TABLES.PLATFORMS}
            WHERE id IN (${platformIds.map((id) => `'${id}'`).join(",")})
        `)
        : [];



        let roles = await pgClient.query(`
            SELECT DISTINCT role as id
            FROM "${DB_ID}".${TABLES.GUESTS};
        `);
        roles = roles.map(r => {
          const name = r.id
              // replace underscores with spaces
              .replace(/_/g, ' ')
              // insert a space before capital letters (except at the start)
              .replace(/([a-z])([A-Z])/g, '$1 $2')
              // lowercase all, then capitalize the first word
              .toLowerCase()
              .replace(/^([a-z])/, (m) => m.toUpperCase());
            
            return { ...r, name };
        });

    return { podcasts, episodes, hosts, guests, people, topics, sources, roles, platforms, listen_on_links };
}


// Cache to store already-built entities by table + id
const entityCache: Record<string, Record<string, any>> = {};

function buildEntityCached_v1(
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
/*
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
    */

  const values = (breakdown.value_fields ?? []).flatMap((field: string) => {
    const val = row[field];
    return val != null
      ? [{ 
        spaceId, 
        property: normalizeToUUID(propertyToIdMap[field]), 
        value: typeof val === "object" && val instanceof Date ? val.toISOString() : String(val), //Graph.serializeDate(val)
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

function buildEntityCached(
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

  // --- build relations (handles both toEntity and entity sides) ---
  const relations = (breakdown.relations ?? []).flatMap((rel: any) => {
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
              geoEntities,
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

          if (rel.type == "sources" && childEntity.entityOnGeo) {
              console.log("SOURCE FOUND")
              existingSources.push(childEntity.entityOnGeo.id)
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
function flatten_api_response_v1(response: any[]): any[] {
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

function flattenEntity(entity: any): any {
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

function flatten_api_response(response: any[]): any[] {
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



const topicBreakdown = {
    table: "topics",
    types: [normalizeToUUID(typeToIdMap['topic'])],
    value_fields: ["name"],
    relations: [],
}

const platformBreakdown = {
    table: "platforms",
    types: [normalizeToUUID(typeToIdMap['project'])],
    value_fields: ["name", 'web_url'],
    relations: [
        {
            type: "avatar",
            toEntityBreakdown: null,
            entityBreakdown: null,
            image: true
        },
    ],
}



const sourceBreakdown = {
    table: "sources",
    types: [normalizeToUUID(typeToIdMap['source'])],
    value_fields: ["source_db_identifier", 'web_url', 'source_db_key'],
    relations: [],
}

const personBreakdown = {
    table: "people",
    types: [normalizeToUUID(typeToIdMap['person'])],
    value_fields: ["name","x_url"],
    relations: [
        {
            type: "avatar",
            toEntityBreakdown: null,
            entityBreakdown: null,
            image: true
        },
        {
            type: "topics",
            toEntityBreakdown: topicBreakdown,
            entityBreakdown: null,
            image: false,
        },
        {
            type: "sources",
            toEntityBreakdown: platformBreakdown,
            entityBreakdown: sourceBreakdown,
            image: false
        }
    ],
}

const listenOnBreakdown = {
    table: "listen_on_links",
    types: [normalizeToUUID(typeToIdMap['source'])],
    value_fields: ["web_url"],
    relations: [],
}

const podcastBreakdown = {
    table: "podcasts",
    types: [normalizeToUUID(typeToIdMap['podcast'])],
    value_fields: ["name", "description", "date_founded", 'rss_feed_url'],
    relations: [
        {
            type: "avatar",
            toEntityBreakdown: null,
            entityBreakdown: null,
            image: true,
        },
        {
            type: "hosts",
            toEntityBreakdown: personBreakdown,
            entityBreakdown: null,
            image: false,
        },
        {
            type: "topics",
            toEntityBreakdown: topicBreakdown,
            entityBreakdown: null,
            image: false,
        },
        {
            type: "listen_on",
            toEntityBreakdown: platformBreakdown,
            entityBreakdown: listenOnBreakdown,
            image: false,
        },
        {
            type: "sources",
            toEntityBreakdown: platformBreakdown,
            entityBreakdown: sourceBreakdown,
            image: false,
        }
    ],
    //tabs: [],
}
/*
//Tabs / Blocks will get tricky when checking whether something already exists
// - For query blocks this will be relatively easy, just checking whether a block with that query exists
// - For collection blocks can check whether a block with a similar collection exists
// - For text, it would need to be some string matching, but who is to say the text block wouldnt completely need to change from being updated?
// - Additionally, how to tell whether a tab already exists, if it had been significantly changed?
blocks: {
  type: //"TEXT", "QUERY", "COLLECTION",
}
  const pageBreakdown = {
    table: null,
    types: [normalizeToUUID(typeToIdMap['page'])], // could leave as null if meant to be on the overview tab?
    value_fields: [], // include some value field like a description could actually help with some of my identification problems?
    relations: [
      {
          type: "blocks",
          toEntityBreakdown: queryBreakdown,
          entityBreakdown: null,
          image: false,
      }
    ],
  }
  //MAKE SURE I HAVE ALL THE REQUIRED INFORMATION TO BUILD THIS QUERY DATA BLOCK
  const queryBreakdown = {
    table: null,
    types: [normalizeToUUID(typeToIdMap['page'])],
    value_fields: [
      {
        property: 'name',
        value: 'INPUT QUERY DATA BLOCK NAME HERE'
      },
      {
        property: 'filter',
        value: 'INPUT FILTER HERE'
      }
    ],
    relations: [
      {
        property: 'QUERY DATA SOURCE',
        value: 'INPUT FILTER HERE'
      }
    ],
  }
*/

//WHEN CHECKING FOR NAME MATCHES, MAKE SURE THE SOURCE ID IS BLANK

const roleBreakdown = {
    table: "roles",
    types: [normalizeToUUID(typeToIdMap['role'])],
    value_fields: ["name"],
    relations: [],
}

const podcastAppearanceBreakdown = {
    table: "guests",
    types: [normalizeToUUID(typeToIdMap['podcast_appearance'])],
    value_fields: [],
    relations: [
        {
            type: "roles",
            toEntityBreakdown: roleBreakdown,
            entityBreakdown: null,
            image: false
        }
    ],
}

const episodeBreakdown = {
    table: "episodes",
    types: [normalizeToUUID(typeToIdMap['episode'])],
    value_fields: ["name", "description", "episode_number", "air_date", "duration", "audio_url"], 
    //avatar: true,
    //cover: false,
    relations: [
        {
            type: "avatar",
            toEntityBreakdown: null,
            entityBreakdown: null,
            image: true
        },
        //{
        //    type: "hosts",
        //    toEntityBreakdown: personBreakdown,
        //    entityBreakdown: null,
        //    image: false,
        //},
        //{
        //    type: "guests",
        //    toEntityBreakdown: personBreakdown,
        //    entityBreakdown: null,
        //    image: false,
        //},
        {
            type: "contributors",
            toEntityBreakdown: personBreakdown,
            entityBreakdown: podcastAppearanceBreakdown,
            image: false,
        },
        {
            type: "podcast",
            toEntityBreakdown: podcastBreakdown,
            entityBreakdown: null,
            image: false,
        },
        {
            type: "listen_on",
            toEntityBreakdown: platformBreakdown,
            entityBreakdown: listenOnBreakdown,
            image: false,
        },
        {
            type: "sources",
            toEntityBreakdown: platformBreakdown,
            entityBreakdown: sourceBreakdown,
            image: false,
        }
    ],
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
const limit = 100
const pgClient = new PostgreSQLClient();
// global or passed down as a parameter

console.log("HERE")
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
                })),
        platforms: flatten_api_response(await searchEntities({
                    type: platformBreakdown.types
                })),
        roles: flatten_api_response(await searchEntities({
                    type: roleBreakdown.types
                })),
        guests: flatten_api_response(await searchEntities({
                    type: podcastAppearanceBreakdown.types
                })),
        listen_on_links: flatten_api_response(await searchEntities({
                    type: listenOnBreakdown.types
                })),
        topics: flatten_api_response(await searchEntities({
                    type: topicBreakdown.types
                })),
    }

    console.log("GEO API READ")

    //console.log(geoEntities.podcasts)

    const tables = await pgClient.query(`
      SELECT 
        table_name,
        json_agg(
          json_build_object(
            'column', column_name,
            'type', data_type
          ) ORDER BY ordinal_position
        ) AS columns
      FROM information_schema.columns
      WHERE table_schema = 'crypto'
      GROUP BY table_name
      ORDER BY table_name;
    `);
    console.log(tables)
    // Convert to formatted JSON string
    const tables_with_columns = JSON.stringify(tables, null, 2); // 2-space indentation
    fs.writeFileSync("tables_with_columns.txt", tables_with_columns, "utf-8");
    //console.log(geoEntities.podcasts[0])


    /*
    let tables = await read_in_tables({
        pgClient: pgClient,
        offset: offset,
        limit: limit
    });

  
    /*
    //PRINT ALL TABLES and INDIVIDUAL EPISODE
    //console.log(tables.listen_on_links)
    console.log("TABLES OUTPUT")
    
    const formattedPodcasts = tables.podcasts.map(p =>
        buildEntityCached(p, podcastBreakdown, GEO_IDS.podcastsSpace, tables, geoEntities, entityCache)
    );

    console.log(formattedPodcasts)


    // Convert to formatted JSON string
    const text2 = JSON.stringify(geoEntities.podcasts, null, 2); // 2-space indentation
    //fs.writeFileSync("geoEntitiesPodcasts.txt", text2, "utf-8");
    //console.log(geoEntities.podcasts[0])

    
    
    for (const podcast of formattedPodcasts) {
        addOps = await processEntity({
            currentOps: ops,
            processingCache: processingCache,
            entity: podcast
        })
        ops.push(...addOps.ops)
    }
    console.log(ops)
    

    
    const formattedEpisodes = tables.episodes.map(p =>
        buildEntityCached(p, episodeBreakdown, GEO_IDS.podcastsSpace, tables, geoEntities, entityCache)
    );
    // Convert to formatted JSON string
    const text = JSON.stringify(formattedEpisodes, null, 2); // 2-space indentation
    fs.writeFileSync("formattedEpisodes.txt", text, "utf-8");

    

    for (const episode of formattedEpisodes) {
        addOps = await processEntity({
            currentOps: ops,
            processingCache: processingCache,
            entity: episode
        })
        ops.push(...addOps.ops)
    }
    
    //console.log(processingCache)
    printOps(ops, "test_push_podcast_06.txt")
    
    await publishOps(ops)
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










/*
  // --- avatar ---
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
      entity: null,
    });
  }

  // --- cover ---
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
      entity: null,
    });
  }
    */


  /*
  const uniqueTopics = Array.from(
      new Map(tables.topics.map(t => [t.name, t])).values()
    );
    const formattedTopics = uniqueTopics.map(p =>
        buildEntityCached(p, topicBreakdown, GEO_IDS.podcastsSpace, tables, geoEntities, entityCache)
    );

    console.log(formattedTopics)

    for (const topic of formattedTopics) {
        addOps = await processEntity({
            currentOps: ops,
            processingCache: processingCache,
            entity: topic
        })
        ops.push(...addOps.ops)
    }
    console.log(ops)
    printOps(ops, "test_push_podcast_topics.txt")
    await publishOps(ops)
  */