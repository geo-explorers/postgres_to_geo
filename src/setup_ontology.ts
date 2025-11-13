import { typeToIdMap } from "./constants.ts";
import PostgreSQLClient, { DB_ID, TABLES } from "./postgres-client.ts";
import { flatten_api_response, searchEntities, normalizeToUUID } from './functions.ts';
import { v4 as uuidv4 } from "uuid";
import levenshtein from "fast-levenshtein";

type Source = {
  id: string;
  podcast_id: string | null;
  podcast_episode_id: string | null;
  platform_id: string;
  person_id: string | null;
  web_url: string | null;
  source_db_identifier: string;
  source_database_key: string;
};

function mergeSources(sources: Source[]): Source[] {
  const grouped = new Map<string, Source[]>();

  // 1. Group by platform_id + whichever of podcast_id, podcast_episode_id, person_id is non-null
  for (const s of sources) {
    const key =
      `${s.platform_id}-` +
      (s.podcast_id ?? s.podcast_episode_id ?? s.person_id ?? "none");
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(s);
  }

  const merged: Source[] = [];

  // 2. Process each group
  for (const group of grouped.values()) {
    const urlSource = group.find(s => s.source_db_identifier.startsWith("http"));

    // ✅ Only merge if a URL record exists
    if (urlSource) {
      const base = group.find(s => !s.source_db_identifier.startsWith("http")) ?? group[0];
      const combined: Source = {
        ...base,
        web_url: urlSource.source_db_identifier,
      };
      merged.push(combined);
    } else {
      // ✅ No URL present — keep all as-is
      merged.push(...group);
    }
  }

  return merged;
}



export interface EntityBreakdown {
  table: string;
  not_unique: boolean;
  types: string[];
  value_fields: string[];
  relations: {
    type: string;
    toEntityBreakdown: EntityBreakdown | null;
    entityBreakdown: EntityBreakdown | null;
    image: boolean;
  }[];
}


export const topicBreakdown: EntityBreakdown = {
    table: "topics",
    not_unique: false,
    types: [normalizeToUUID(typeToIdMap['topic'])],
    value_fields: ["name"],
    relations: [],
}
/*
// Now that topicBreakdown exists, you can reference it safely
topicBreakdown.relations = [
  {
      type: "broader_topics",
      toEntityBreakdown: topicBreakdown,
      entityBreakdown: null,
      image: false
  },
  {
      type: "subtopics",
      toEntityBreakdown: topicBreakdown,
      entityBreakdown: null,
      image: false
  },
  {
      type: "cover",
      toEntityBreakdown: null,
      entityBreakdown: null,
      image: true
  },
];
*/

export const platformBreakdown = {
    table: "platforms",
    not_unique: false,
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



export const sourceBreakdown = {
    table: "sources",
    not_unique: false,
    types: [normalizeToUUID(typeToIdMap['source'])],
    value_fields: ["source_db_identifier", 'web_url', 'source_database_key'],
    relations: [],
}

export const personBreakdown = {
    table: "people",
    not_unique: false,
    types: [normalizeToUUID(typeToIdMap['person'])],
    value_fields: ["name", "description", "x_url"],
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

export const listenOnBreakdown = {
    table: "listen_on_links",
    not_unique: false,
    types: [normalizeToUUID(typeToIdMap['source'])],
    value_fields: ["web_url"],
    relations: [],
}

export const podcastBreakdown = {
    table: "podcasts",
    not_unique: false,
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
        /*
        {
            type: "topics",
            toEntityBreakdown: topicBreakdown,
            entityBreakdown: null,
            image: false,
        },
        */
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

export const roleBreakdown = {
    table: "roles",
    not_unique: false,
    types: [normalizeToUUID(typeToIdMap['role'])],
    value_fields: ["name"],
    relations: [],
}

export const podcastAppearanceBreakdown = {
    table: "guests",
    not_unique: false,
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

export const textBlockBreakdown = {
    table: "text_blocks",
    not_unique: true,
    types: [normalizeToUUID(typeToIdMap['text_block'])],
    value_fields: ["name", "markdown_content"],
    relations: [],
}

export const pageBreakdown = {
    table: "pages",
    not_unique: true,
    types: [normalizeToUUID(typeToIdMap['page'])],
    value_fields: ["name"],
    relations: [
      {
            type: "text_blocks",
            toEntityBreakdown: textBlockBreakdown,
            entityBreakdown: null,
            image: false
        },
    ],
}

export const selectorBreakdown = {
    table: "selectors",
    not_unique: false,
    types: [normalizeToUUID(typeToIdMap['selector'])],
    value_fields: ["start_offset", "end_offset"],
    relations: [],
}

export const quoteBreakdown = {
    table: "quotes",
    not_unique: false,
    types: [normalizeToUUID(typeToIdMap['quote'])],
    value_fields: ["name"],
    relations: [
      {
          type: "targets",
          toEntityBreakdown: textBlockBreakdown,
          entityBreakdown: selectorBreakdown,
          image: false
      },
    ],
}

export const claimBreakdown = {
    table: "claims",
    not_unique: false,
    types: [normalizeToUUID(typeToIdMap['claim'])],
    value_fields: ["name"],
    relations: [
      {
          type: "supporting_quotes",
          toEntityBreakdown: quoteBreakdown,
          entityBreakdown: null,
          image: false
      },
    ],
}

export const episodeBreakdown = {
    table: "episodes",
    not_unique: false,
    types: [normalizeToUUID(typeToIdMap['episode'])],
    value_fields: ["name", "description", "episode_number", "air_date", "duration", "audio_url"], 
    relations: [
        {
            type: "avatar",
            toEntityBreakdown: null,
            entityBreakdown: null,
            image: true
        },
        {
            type: "tabs",
            toEntityBreakdown: pageBreakdown,
            entityBreakdown: null,
            image: false,
        },
        {
            type: "hosts",
            toEntityBreakdown: personBreakdown,
            entityBreakdown: podcastAppearanceBreakdown,
            image: false,
        },
        {
            type: "guests",
            toEntityBreakdown: personBreakdown,
            entityBreakdown: podcastAppearanceBreakdown,
            image: false,
        },
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
        },
        //{
        //    type: "notable_quotes",
        //    toEntityBreakdown: quoteBreakdown,
        //    entityBreakdown: null,
        //    image: false,
        //},
        /*
        {
            type: "notable_claims",
            toEntityBreakdown: claimBreakdown,
            entityBreakdown: null,
            image: false,
        },
        {
            type: "topics",
            toEntityBreakdown: topicBreakdown,
            entityBreakdown: null,
            image: false,
        },
        */
    ],
}









export async function read_in_tables({
  pgClient,
  offset,
  limit,
  podcast_name,
}: {
  pgClient: any;
  offset?: number;
  limit?: number;
  podcast_name?: string;
}): Promise<{
    podcasts: any; episodes: any; hosts: any; guests: any; people: any; topics: any; sources: any; roles: any; platforms: any; listen_on_links: any; quotes: any; claims: any; pages: any; text_blocks: any; selectors: any;
}> {
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
                'to_id', t.to_tag_id,
                'entity_id', null
              )
            ) FILTER (WHERE t.to_tag_id IS NOT NULL),
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
      LEFT JOIN "${DB_ID}".${TABLES.TAG_MAP} AS t
          ON p.id = t.from_podcast_id
      LEFT JOIN "${DB_ID}".${TABLES.EXTERNAL_IDS} AS ex
        ON p.id = ex.podcast_id
      LEFT JOIN "${DB_ID}".${TABLES.LISTEN_ON} AS l
        ON p.id = l.podcast_id
      WHERE p.name IN ('${podcast_name}')
      GROUP BY p.id
      LIMIT ${limit} OFFSET ${offset}
  `);
    //'Bankless', 'The Joe Rogan Experience', 'Freakonomics Radio', 'The Daily', 'Lex Fridman Podcast', 'Today, Explained', 'The Genius Life', 'All-In with Chamath, Jason, Sacks & Friedberg'

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
                e.podscribe_transcript as transcript,
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
              e.transcript,
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
                json_agg(DISTINCT jsonb_build_object('to_id', g.person_id, 'entity_id', g.id)) FILTER (WHERE g.role = 'guest'),
                '[]'
              ) AS guests,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object('to_id', g.person_id, 'entity_id', g.id)) FILTER (WHERE g.role IN ('host', 'coHost', 'guest_host', 'guestHost')),
                '[]'
              ) AS hosts,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object('to_id', g.person_id, 'entity_id', g.id)) FILTER (WHERE g.role NOT IN ('guest', 'host', 'coHost', 'guest_host', 'guestHost')),
                '[]'
              ) AS contributors,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object('to_id', q.id, 'entity_id', null)) FILTER (WHERE q.id IS NOT NULL),
                '[]'
              ) AS notable_quotes,
               COALESCE(
                json_agg(DISTINCT jsonb_build_object('to_id', c.id, 'entity_id', null)) FILTER (WHERE c.id IS NOT NULL),
                '[]'
              ) AS notable_claims,
              COALESCE(
                json_agg(
                  DISTINCT jsonb_build_object(
                    'to_id', l.platform_id,
                    'entity_id', l.id
                  )
                ) FILTER (WHERE (l.id IS NOT NULL) AND (l.url IS NOT NULL)),
                '[]'
              ) AS listen_on,
              COALESCE(
                json_agg(
                  DISTINCT jsonb_build_object(
                    'to_id', t.to_tag_id,
                    'entity_id', null
                  )
                ) FILTER (WHERE t.to_tag_id IS NOT NULL),
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
            FROM ranked_episodes e
            LEFT JOIN "${DB_ID}".${TABLES.GUESTS} AS g ON e.id = g.episode_id
            LEFT JOIN "${DB_ID}".${TABLES.EXTERNAL_IDS} AS ex ON e.id = ex.podcast_episode_id
            LEFT JOIN "${DB_ID}".${TABLES.LISTEN_ON} AS l ON e.id = l.podcast_episode_id
            LEFT JOIN "${DB_ID}".${TABLES.QUOTES} AS q ON e.id = q.episode_id
            LEFT JOIN "${DB_ID}".${TABLES.CLAIMS} AS c ON c.episode_id = e.id
            LEFT JOIN "${DB_ID}".${TABLES.TAG_MAP} AS t ON e.id = t.from_episode_id
            WHERE (e.rn <= 10) AND (e.transcript IS NOT NULL)
            GROUP BY e.id, e.name, e.description, e.transcript, e.episode_number, e.duration,
                      e.air_date, e.avatar, e.audio_url, e.podcast_id
            ORDER BY e.air_date DESC;
          `)
          : [];

          /*
          LEFT JOIN "${DB_ID}".${TABLES.QUOTES} AS q ON e.id = q.episode_id
          LEFT JOIN "${DB_ID}".${TABLES.CLAIM_QUOTES} AS cq ON cq.quote_id = q.id
          LEFT JOIN "${DB_ID}".${TABLES.CLAIMS} AS c ON c.id = cq.claim_id
          LEFT JOIN "${DB_ID}".${TABLES.TAG_MAP} AS t ON e.id = t.from_episode_id
          WHERE (e.rn > 0) AND (e.rn <= 5) AND (e.transcript IS NOT NULL)
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

        const guests = episodeIds.length //ARRAY[role] as roles,
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
                    p.id, p.name, p.logo as avatar, COALESCE(p.editor_description, p.description) AS description, p.x_url, p.linkedin_url, p.medium_url, p.wikipedia_url,
                    COALESCE(
                      json_agg(
                        DISTINCT jsonb_build_object(
                          'to_id', t.to_tag_id,
                          'entity_id', null
                        )
                      ) FILTER (WHERE t.to_tag_id IS NOT NULL),
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
                LEFT JOIN "${DB_ID}".${TABLES.EXTERNAL_IDS} AS ex
                    ON p.id = ex.person_id
                LEFT JOIN "${DB_ID}".${TABLES.TAG_MAP} AS t 
                    ON p.id = t.from_person_id
                WHERE ${personWhereClauses.join(" OR ")}
                GROUP BY p.id
                `)
            : [];

        const topics = await pgClient.query(`
            SELECT t.id, t.name, t.description,
            COALESCE(
              json_agg(
                DISTINCT jsonb_build_object(
                  'to_id', tm.to_tag_id,
                  'entity_id', null
                )
              ) FILTER (WHERE (tm.to_tag_id IS NOT NULL) AND (tm.tag_category = 'Broader topic')),
              '[]'
            ) AS broader_topics,
            COALESCE(
              json_agg(
                DISTINCT jsonb_build_object(
                  'to_id', tm.to_tag_id,
                  'entity_id', null
                )
              ) FILTER (WHERE (tm.to_tag_id IS NOT NULL) AND (tm.tag_category = 'Subtopic')),
              '[]'
            ) AS subtopics
            FROM "${DB_ID}".${TABLES.TAGS} as t
            LEFT JOIN "${DB_ID}".${TABLES.TAG_MAP} AS tm
              ON t.id = tm.from_tag_id
            where t.name IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM "${DB_ID}".${TABLES.TAG_MAP} tm2
              WHERE tm2.to_tag_id = t.id
            )
            GROUP BY t.id
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
        let sources = sourceWhereClauses.length
            ? await pgClient.query(`
                SELECT 
                    e.id, e.podcast_id, e.podcast_episode_id, e.platform_id, e.person_id, e.website as web_url, e.external_db_id as source_db_identifier, e.external_db_key as source_database_key
                FROM "${DB_ID}".${TABLES.EXTERNAL_IDS} as e
                WHERE (${sourceWhereClauses.join(" OR ")}) 
                  AND (e.external_db_id <> 'NOT_FOUND')
                  AND (e.external_db_key <> 'guid') 
                  AND (e.external_db_key <> 'pcid')
                `)
            : [];

        //sources = mergeSources(sources)
        




        const platformIds = [
            ...new Set(
                sources
                .flatMap((row: any) => [row.platform_id])
                .filter(Boolean)
            ),
        ];
        const platforms = platformIds.length
        ? await pgClient.query(`
            SELECT id, normalized_name as name, website as web_url, description, logo as avatar FROM "${DB_ID}".${TABLES.PLATFORMS}
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


        const quotes = episodeIds.length //ARRAY[role] as roles,
        ? await pgClient.query(`
            SELECT q.id, q.quote_text as name, episode_id
            FROM "${DB_ID}".${TABLES.QUOTES} as q
            WHERE q.episode_id IN (${episodeIds.map((id) => `'${id}'`).join(",")})
            GROUP BY q.id
        `)
        : [];

        const quoteIds = [
            ...new Set(
                quotes
                .flatMap((row: any) => [row.id])
                .filter(Boolean)
            ),
        ];

        const claims = quoteIds.length
        ? await pgClient.query(`
            SELECT id, episode_id, claim_text as name, 
            COALESCE(
              json_agg(
                DISTINCT jsonb_build_object(
                  'to_id', cq.quote_id,
                  'entity_id', null
                )
              ) FILTER (WHERE cq.quote_id IS NOT NULL),
              '[]'
            ) AS supporting_quotes
            FROM "${DB_ID}".${TABLES.CLAIMS} as c
            LEFT JOIN "${DB_ID}".${TABLES.CLAIM_QUOTES} AS cq
                ON c.id = cq.claim_id
            WHERE cq.quote_id IN (${quoteIds.map((id) => `'${id}'`).join(",")})
            GROUP BY c.id
        `)
        : [];

    interface TextBlock {
      id: string;
      episode_id: string;
      page_id: string;
      block_type: string;
      name: string;
      markdown_content: string;
    }

    interface Page {
      id: string;
      episode_id: string;
      name: string; // "Transcript"
      text_blocks: { to_id: string; entity_id: null }[];
    }

    // “Tables”
    const text_blocks: TextBlock[] = [];
    const pages: Page[] = [];

    for (const ep of episodes) {
      const transcriptText = ep.transcript?.trim();
      if (!transcriptText) {
        ep.tabs = [];
        continue;
      }

      // Split transcript text into chunks
      const chunks = transcriptText
        .split(/\n\n+/)
        .map(chunk => chunk.trim())
        .filter(Boolean);

      // Create the transcript page
      const pageId = `pg_${uuidv4().slice(0, 8)}`;
      const pageBlocks = chunks.map(chunk => {
        const blockId = `tb_${uuidv4().slice(0, 8)}`;
        
        // Add transcript block (with both episode_id + page_id)
        text_blocks.push({
          id: blockId,
          episode_id: ep.id,
          page_id: pageId,
          block_type: "text",
          name: chunk.slice(0, 36) + (chunk.length > 36 ? "..." : ""),
          markdown_content: chunk,
        });

        // Reference for the page’s block list
        return { to_id: blockId, entity_id: null };
      });

      // Create a page record for this transcript
      const page: Page = {
        id: pageId,
        episode_id: ep.id,
        name: "Transcript",
        text_blocks: pageBlocks,
      };

      pages.push(page);

      // Add reference to episode
      ep.tabs = [{ to_id: pageId, entity_id: null }];

      // Remove the original transcript text
      delete ep.transcript;
    }

    interface Selector {
      id: string;
      start_offset: number;
      end_offset: number;
    }

    // --- Helper: find max substring similarity and offsets ---
    function maxSubstringSimilarityWithOffsets(
      quote: string,
      text: string
    ): { similarity: number; start: number; end: number } {
      if (!quote || !text) return { similarity: 0, start: 0, end: 0 };

      const q = quote.toLowerCase();
      const t = text.toLowerCase();
      const qLen = q.length;
      const tLen = t.length;

      if (qLen > tLen) {
        const sim = 1 - levenshtein.get(q, t) / Math.max(qLen, tLen);
        return { similarity: sim, start: 0, end: tLen };
      }

      let maxSim = 0;
      let bestStart = 0;

      for (let i = 0; i <= tLen - qLen; i++) {
        const window = t.slice(i, i + qLen);
        const sim = 1 - levenshtein.get(q, window) / qLen;
        if (sim > maxSim) {
          maxSim = sim;
          bestStart = i;
        }
        if (maxSim >= 1) break; // early exit on perfect match
      }

      return { similarity: maxSim, start: bestStart, end: bestStart + qLen };
    }

    // --- Pre-group text blocks by episode_id ---
    const blocksByEpisode: Record<string, TextBlock[]> = {};
    for (const tb of text_blocks) {
      if (!blocksByEpisode[tb.episode_id]) blocksByEpisode[tb.episode_id] = [];
      blocksByEpisode[tb.episode_id].push(tb);
    }

    // --- Create selectors table ---
    const selectors: Selector[] = [];

    // --- Assign targets to quotes and create selectors ---
    for (const quote of quotes) {
      const relevantBlocks = blocksByEpisode[quote.episode_id] ?? [];

      let bestMatch: { tb: TextBlock; similarity: number; start: number; end: number } | null = null;

      for (const tb of relevantBlocks) {
        const { similarity, start, end } = maxSubstringSimilarityWithOffsets(
          quote.name,
          tb.markdown_content
        );

        if (similarity >= 0.9 && (!bestMatch || similarity > bestMatch.similarity)) {
          bestMatch = { tb, similarity, start, end };
        }
      }

      if (bestMatch) {
        const selectorId = `sel_${uuidv4().slice(0, 8)}`;

        selectors.push({
          id: selectorId,
          start_offset: bestMatch.start,
          end_offset: bestMatch.end,
        });

        quote.targets = [{ to_id: bestMatch.tb.id, entity_id: selectorId }];
      } else {
        quote.targets = [];
      }
    }



    return { podcasts, episodes, hosts, guests, people, topics, sources, roles, platforms, listen_on_links, claims, quotes, pages, text_blocks, selectors};
}


export async function loadGeoEntities() {
  const breakdowns = {
    people: personBreakdown,
    podcasts: podcastBreakdown,
    episodes: episodeBreakdown,
    platforms: platformBreakdown,
    roles: roleBreakdown,
    guests: podcastAppearanceBreakdown,
    listen_on_links: listenOnBreakdown,
    topics: topicBreakdown,
    claims: claimBreakdown,
    quotes: quoteBreakdown,
    pages: pageBreakdown,
    text_blocks: textBlockBreakdown,
  };

  const geoEntities: any = {};

  for (const [key, breakdown] of Object.entries(breakdowns)) {
    geoEntities[key] = flatten_api_response(
      await searchEntities({ type: breakdown.types })
    );
  }

  console.log("GEO API READ")
  return geoEntities;
}



//Enable deleting and republishing claims / quotes from an episode when desired.
//handle not_unique relation entities (to_entities have already been handled)
//convert chunks to markdown (especially new lines)

// Setup ability to specify 1 relation only
// Setup ability to overwrite a certain property of an entity
// Setup ability to have multiple relations to the same source when desired



// --- DONE ---
// Cant just search for something with name transcript, but could search for an attached page via tabs that has name "Transcript"
// - I could filter the pages query to only return pages that have a tabs relation from the entity in question...
// - This would likely need to be a setting in the ontology definitions...
// Enable setting position for relations