// To do
// - Do we want to add the project avatar as the avatar in the funding round entity?

import * as fs from "fs";
import PostgreSQLClient, { TABLES, DB_ID } from "../src/postgres-client";
import { read_in_tables } from "../src/setup_ontology";




const pgClient = new PostgreSQLClient();
// global or passed down as a parameter

console.log("HERE")
process.on('SIGINT', async () => {
    console.log('Exiting gracefully...');
    await pgClient.close();
    process.exit(0);
});


let tables = await read_in_tables({
    pgClient: pgClient,
    offset: 0,
    limit: 100
});

console.log(tables.pages[0])
console.log(tables.text_blocks[0])

/*

const people_with_topics = JSON.stringify(tables.peopleWithTopics, null, 2); // 2-space indentation
fs.writeFileSync("people_with_topics.txt", people_with_topics, "utf-8");
console.log(tables.peopleWithTopics.length)

const noWikiDescriptionCount = tables.peopleWithTopics.filter(p => !p.wiki_description).length;
const noDescriptionCount = tables.peopleWithTopics.filter(p => !p.description).length;
const noAvatarCount = tables.peopleWithTopics.filter(p => !p.avatar).length;
const noXCount = tables.peopleWithTopics.filter(p => !p.x_url).length;

console.log("People with null wikidata description:", noWikiDescriptionCount);
console.log("People with null description:", noDescriptionCount);
console.log("People with null avatar:", noAvatarCount);
console.log("People with null x_url:", noXCount);
const noTopicsCount = tables.peopleWithTopics.filter(p => !p.topics || p.topics.length === 0).length;

console.log("People with no topics:", noTopicsCount);
/*
type Person = {
  id: string;
  name: string;
  [key: string]: any;
};

const people: Person[] = [];

const duplicates = Object.entries(
  tables.people.reduce((acc, { name }) => {
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>)
)
  .filter(([_, count]) => count > 1)
  .map(([name]) => name);

if (duplicates.length > 0) {
  console.log("Duplicate names found:", duplicates);
} else {
  console.log("All names are unique ✅");
}

const nameGroups = people.reduce((acc, p) => {
  acc[p.name] = acc[p.name] || [];
  acc[p.name].push(p.id);
  return acc;
}, {} as Record<string, string[]>);

const duplicatesDetailed = tables.people.filter(p =>
  duplicates.includes(p.name)
);
const text2 = JSON.stringify(duplicatesDetailed, null, 2); // 2-space indentation
fs.writeFileSync("duplicatesDetailed.txt", text2, "utf-8");
console.log(duplicates);
console.log(duplicates.length);
//, 'Bankless', 'All-In with Chamath, Jason, Sacks & Friedberg', 'The Genius Life', 'The Tim Ferriss Show', 'SmartLess', 'The Joe Rogan Experience', 'The Ezra Klein Show'



const targetIds = [108902, 110141, 110143, 110180, 110192, 110202, 101734, 103104, 103105, 103356, 103438, 105160, 110146, 110209, 110276, 110425];

const filtered = tables.episodes.filter(ep =>
  ep.contributors?.some(g => targetIds.includes(g.to_id))
);

//console.log(filtered)

const text3 = JSON.stringify(filtered, null, 2); // 2-space indentation
fs.writeFileSync("episodes_w_dups.txt", text3, "utf-8");
const uniqueNames = [...new Set(tables.topics.map(i => i.name))];
console.log(uniqueNames)
console.log(uniqueNames.length)
const topics = JSON.stringify(uniqueNames, null, 2); // 2-space indentation
fs.writeFileSync("topics.txt", topics, "utf-8");
*/
/*
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
/*
//Output data set for yaniv
const episodes = await pgClient.query(`
  WITH filtered_episodes AS (
    SELECT 
      e.id,
      e.podcast_id,
      p.name AS podcast_name,
      e.name AS episode_name,
      e.description,
      e.audio_url,
      e.transcript,
      e.published_at,
      COALESCE(
        json_agg(
          DISTINCT jsonb_build_object(
            'to_id', g.person_id,
            'name', pe.name,
            'entity_id', null
          )
        ) FILTER (WHERE g.role = 'guest'),
        '[]'
      ) AS guests,
      COALESCE(
        json_agg(
          DISTINCT jsonb_build_object(
            'to_id', g.person_id,
            'name', pe.name,
            'entity_id', null
          )
        ) FILTER (WHERE g.role IN ('host', 'coHost', 'guest_host', 'guestHost')),
        '[]'
      ) AS hosts
    FROM "${DB_ID}".${TABLES.EPISODES} AS e
    LEFT JOIN "${DB_ID}".${TABLES.GUESTS} AS g
      ON e.id = g.episode_id
    LEFT JOIN "${DB_ID}".${TABLES.PEOPLE} AS pe
      ON g.person_id = pe.id
    LEFT JOIN "${DB_ID}".${TABLES.PODCASTS} AS p
      ON e.podcast_id = p.id
    WHERE e.transcript IS NOT NULL
      AND p.name IN ('Freakonomics Radio', 'The Daily', 'Lex Fridman Podcast')
    GROUP BY e.id, p.name, e.name, e.description, e.audio_url, e.transcript, e.published_at
    HAVING 
      jsonb_array_length(
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'to_id', g.person_id,
              'name', pe.name,
              'entity_id', null
            )
          ) FILTER (WHERE g.role IN ('host', 'coHost', 'guest_host', 'guestHost')),
          '[]'
        )::jsonb
      ) > 0
  ),
  ranked AS (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY podcast_name ORDER BY published_at DESC) AS rn
    FROM filtered_episodes
  )
  SELECT *
  FROM ranked
  WHERE rn <= 2
  ORDER BY podcast_name, published_at DESC
`);

console.log(episodes)

const text2 = JSON.stringify(episodes, null, 2); // 2-space indentation
fs.writeFileSync("podcast_episodes_w_transcripts_and_guests.txt", text2, "utf-8");
*/

/*
import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import { Client } from "pg";
/*
const episodes = await pgClient.query(`
    WITH podcast_counts AS (
      SELECT
        podcast_id,
        COUNT(*) AS total_episodes,
        MAX(published_at) AS most_recent_episode
      FROM "${DB_ID}".${TABLES.EPISODES}
      GROUP BY podcast_id
      HAVING COUNT(*) > 250
        AND EXTRACT(YEAR FROM MAX(published_at)) = 2025
    ),
    ranked_episodes AS (
      SELECT
        e.id,
        e.podcast_id,
        e.transcript,
        e.published_at,
        ROW_NUMBER() OVER (PARTITION BY e.podcast_id ORDER BY e.published_at DESC) AS rn
      FROM "${DB_ID}".${TABLES.EPISODES} e
      INNER JOIN podcast_counts pc ON e.podcast_id = pc.podcast_id
    ),
    limited_episodes AS (
      SELECT e.id, e.podcast_id
      FROM ranked_episodes e
      WHERE e.rn <= 100
    ),
    episode_flags AS (
      SELECT
        e.id,
        e.podcast_id,
        p.name AS podcast_name,
        (e.transcript IS NOT NULL AND length(trim(e.transcript)) > 0) AS has_transcript,
        COUNT(DISTINCT g.person_id) FILTER (WHERE g.role = 'guest') > 0 AS has_guests,
        COUNT(DISTINCT g.person_id) FILTER (WHERE g.role IN ('host', 'coHost', 'guest_host', 'guestHost')) > 0 AS has_hosts
      FROM "${DB_ID}".${TABLES.EPISODES} e
      INNER JOIN limited_episodes le ON e.id = le.id
      LEFT JOIN "${DB_ID}".${TABLES.PODCASTS} p ON e.podcast_id = p.id
      LEFT JOIN "${DB_ID}".${TABLES.GUESTS} g ON e.id = g.episode_id
      GROUP BY e.id, e.podcast_id, p.name, e.transcript
    )
    SELECT
      e.podcast_id,
      e.podcast_name,
      COUNT(*) AS total_episodes,
      COUNT(*) FILTER (WHERE has_transcript) AS episodes_with_transcript,
      COUNT(*) FILTER (WHERE has_guests) AS episodes_with_guests,
      COUNT(*) FILTER (WHERE has_hosts) AS episodes_with_hosts
    FROM episode_flags e
    GROUP BY e.podcast_id, e.podcast_name
    HAVING
      COUNT(*) FILTER (WHERE has_guests) > 0
      AND COUNT(*) FILTER (WHERE has_guests) >= 0.5 * COUNT(*)
      
    ORDER BY
      episodes_with_transcript DESC,
      episodes_with_guests DESC;

`)
//AND COUNT(*) FILTER (WHERE has_guests) >= 0.5 * COUNT(*)
//AND COUNT(*) FILTER (WHERE has_transcript) >= 0.94 * COUNT(*)
console.log(episodes)
console.log(episodes.length)

*/

/*

// --- Chart config ---
const width = 800;
const height = 500;
const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width,
  height,
  backgroundColour: "#ffffff", // white background
});



// --- Run your aggregate query ---
const res = await pgClient.query(`
  WITH ranked_episodes AS (
    SELECT
      e.id,
      e.podcast_id,
      e.transcript,
      e.logo AS avatar,
      e.description,
      e.audio_url,
      e.published_at,
      ROW_NUMBER() OVER (PARTITION BY e.podcast_id ORDER BY e.published_at DESC) AS rn
    FROM "${DB_ID}".${TABLES.EPISODES} e
  ),
  limited_episodes AS (
    SELECT e.id, e.podcast_id
    FROM ranked_episodes e
    WHERE e.rn <= 100
  ),
  episode_flags AS (
    SELECT
      e.id,
      e.podcast_id,
      p.name AS podcast_name,
      (e.transcript IS NOT NULL AND length(trim(e.transcript)) > 0) AS has_transcript,
      (e.logo IS NOT NULL) > 0) AS has_avatar,
      (e.description IS NOT NULL AND length(trim(e.description)) > 0) AS has_description,
      (e.audio_url IS NOT NULL) AS has_audio,
      COUNT(DISTINCT g.person_id) FILTER (WHERE g.role = 'guest') > 0 AS has_guests,
      COUNT(DISTINCT g.person_id) FILTER (WHERE g.role IN ('host','coHost','guest_host','guestHost')) > 0 AS has_hosts
    FROM "${DB_ID}".${TABLES.EPISODES} e
    INNER JOIN limited_episodes le ON e.id = le.id
    LEFT JOIN "${DB_ID}".${TABLES.PODCASTS} p ON e.podcast_id = p.id
    LEFT JOIN "${DB_ID}".${TABLES.GUESTS} g ON e.id = g.episode_id
    GROUP BY e.id, e.podcast_id, p.name, e.transcript, e.logo, e.description, e.audio_url
  )
  SELECT
    e.podcast_id,
    e.podcast_name,
    COUNT(*) AS total_episodes,
    COUNT(*) FILTER (WHERE has_transcript) AS episodes_with_transcript,
    COUNT(*) FILTER (WHERE has_avatar) AS episodes_with_avatar,
    COUNT(*) FILTER (WHERE has_description) AS episodes_with_description,
    COUNT(*) FILTER (WHERE has_audio) AS episodes_with_audio,
    COUNT(*) FILTER (WHERE has_guests) AS episodes_with_guests,
    COUNT(*) FILTER (WHERE has_hosts) AS episodes_with_hosts
  FROM episode_flags e
  GROUP BY e.podcast_id, e.podcast_name
`);

const data = res.map((row) => ({
  podcastId: row.podcast_id,
  podcastName: row.podcast_name,
  totalEpisodes: Number(row.total_episodes),
  episodesWithTranscripts: Number(row.episodes_with_transcript),
  episodesWithAvatars: Number(row.episodes_with_avatar),
  episodesWithDescriptions: Number(row.episodes_with_description),
  episodesWithAudio: Number(row.episodes_with_audio),
  episodesWithGuests: Number(row.episodes_with_guests),
  episodesWithHosts: Number(row.episodes_with_hosts),
}));

// --- Compute percentages ---
const percentages = data.map((d) => ({
  podcastId: d.podcastId,
  podcastName: d.podcastName,
  pctWithTranscripts: (d.episodesWithTranscripts / d.totalEpisodes) * 100,
  pctWithAvatars: (d.episodesWithAvatars / d.totalEpisodes) * 100,
  pctWithDescriptions: (d.episodesWithDescriptions / d.totalEpisodes) * 100,
  pctWithAudio: (d.episodesWithAudio / d.totalEpisodes) * 100,
  pctWithGuests: (d.episodesWithGuests / d.totalEpisodes) * 100,
  pctWithHosts: (d.episodesWithHosts / d.totalEpisodes) * 100,
  totalEpisodes: d.totalEpisodes,
}));

console.table(percentages);

// --- Helper function to save histogram for percentages ---
async function saveHistogram(
  metricName: keyof typeof percentages[0],
  fileName: string,
  color: string
) {
  const bins = Array.from({ length: 10 }, (_, i) => i * 10);
  const counts = bins.map(
    (lower) =>
      percentages.filter(
        (p) => p[metricName]! >= lower && p[metricName]! < lower + 10
      ).length
  );

  const config = {
    type: "bar" as const,
    data: {
      labels: bins.map((b) => `${b}-${b + 10}%`),
      datasets: [
        {
          label: `% of Episodes with ${metricName.replace("pctWith", "")}`,
          data: counts,
          backgroundColor: color,
          borderColor: "#2f4b7c",
          borderWidth: 1,
        },
      ],
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: `Distribution of % of Episodes with ${metricName.replace(
            "pctWith",
            ""
          )} per Podcast`,
        },
      },
      scales: {
        x: { title: { display: true, text: `% of Episodes with ${metricName.replace("pctWith", "")}` } },
        y: { title: { display: true, text: "Number of Podcasts" } },
      },
    },
  };

  const image = await chartJSNodeCanvas.renderToBuffer(config);
  fs.writeFileSync(fileName, image);
  console.log(`✅ Saved histogram to ${fileName}`);
}

// --- Generate histograms for all percentage metrics ---
await saveHistogram("pctWithTranscripts", "hist_transcripts.png", "#4e79a7");
await saveHistogram("pctWithAvatars", "hist_avatars.png", "#f28e2c");
await saveHistogram("pctWithDescriptions", "hist_descriptions.png", "#e15759");
await saveHistogram("pctWithAudio", "hist_audio.png", "#76b7b2"); // <-- new audio histogram
await saveHistogram("pctWithGuests", "hist_guests.png", "#59a14f");
await saveHistogram("pctWithHosts", "hist_hosts.png", "#9c755f");

// --- Histogram of number of episodes per podcast with >1000 bin ---
async function saveEpisodeCountHistogram() {
  const binSize = 10;
  const maxBin = 1000;
  const bins = Array.from({ length: Math.ceil(maxBin / binSize) }, (_, i) => i * binSize);

  const counts = bins.map(
    (lower) =>
      data.filter(
        (d) => d.totalEpisodes >= lower && d.totalEpisodes < lower + binSize
      ).length
  );

  const over1000 = data.filter((d) => d.totalEpisodes > maxBin).length;
  counts.push(over1000);
  bins.push(maxBin);

  const config = {
    type: "bar" as const,
    data: {
      labels: [...bins.slice(0, -1).map((b) => `${b}-${b + binSize - 1}`), `>${maxBin}`],
      datasets: [
        {
          label: "Number of Podcasts",
          data: counts,
          backgroundColor: "#ff9da7",
          borderColor: "#b22222",
          borderWidth: 1,
        },
      ],
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: "Histogram of Number of Episodes per Podcast",
        },
      },
      scales: {
        x: { title: { display: true, text: "Number of Episodes" } },
        y: { title: { display: true, text: "Number of Podcasts" } },
      },
    },
  };

  const image = await chartJSNodeCanvas.renderToBuffer(config);
  fs.writeFileSync("hist_num_episodes.png", image);
  console.log("✅ Saved histogram to hist_num_episodes.png");
}

await saveEpisodeCountHistogram();






/*
const width = 800;
const height = 500;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

//WHERE e.rn <= 100
// --- Run your aggregate query ---
const res = await pgClient.query(`
  WITH ranked_episodes AS (
    SELECT
      e.id,
      e.podcast_id,
      e.transcript,
      e.published_at,
      ROW_NUMBER() OVER (PARTITION BY e.podcast_id ORDER BY e.published_at DESC) AS rn
    FROM "${DB_ID}".${TABLES.EPISODES} e
  ),
  limited_episodes AS (
    SELECT e.id, e.podcast_id
    FROM ranked_episodes e
    
  ),
  episode_flags AS (
    SELECT
      e.id,
      e.podcast_id,
      p.name AS podcast_name,
      (e.transcript IS NOT NULL AND length(trim(e.transcript)) > 0) AS has_transcript,
      COUNT(DISTINCT g.person_id) FILTER (WHERE g.role = 'guest') > 0 AS has_guests
    FROM "${DB_ID}".${TABLES.EPISODES} e
    INNER JOIN limited_episodes le ON e.id = le.id
    LEFT JOIN "${DB_ID}".${TABLES.PODCASTS} p ON e.podcast_id = p.id
    LEFT JOIN "${DB_ID}".${TABLES.GUESTS} g ON e.id = g.episode_id
    GROUP BY e.id, e.podcast_id, p.name, e.transcript
  )
  SELECT
    e.podcast_id,
    e.podcast_name,
    COUNT(*) AS total_episodes,
    COUNT(*) FILTER (WHERE has_guests) AS episodes_with_guests
  FROM episode_flags e
  GROUP BY e.podcast_id, e.podcast_name
`);

const data = res.map((row) => ({
  podcastId: row.podcast_id,
  podcastName: row.podcast_name,
  totalEpisodes: Number(row.total_episodes),
  episodesWithGuests: Number(row.episodes_with_guests),
}));

// --- Compute percentages ---
const percentages = data.map(
  (d) => (d.episodesWithGuests / d.totalEpisodes) * 100
);

// --- Build histogram bins (0–10, 10–20, ..., 90–100) ---
const bins = Array.from({ length: 10 }, (_, i) => i * 10);
const counts = bins.map(
  (lower) =>
    percentages.filter((p) => p >= lower && p < lower + 10).length
);

// --- Generate histogram ---
const config = {
  type: "bar" as const,
  data: {
    labels: bins.map((b) => `${b}-${b + 10}%`),
    datasets: [
      {
        label: "% of Episodes with Guests",
        data: counts,
        backgroundColor: "#4e79a7",
        borderColor: "#2f4b7c",
        borderWidth: 1,
      },
    ],
  },
  options: {
    plugins: {
      title: {
        display: true,
        text: "Distribution of % of Episodes with Guests per Podcast",
      },
    },
    scales: {
      x: { title: { display: true, text: "% of Episodes with Guests" } },
      y: { title: { display: true, text: "Number of Podcasts" } },
    },
  },
};

const image = await chartJSNodeCanvas.renderToBuffer(config);
fs.writeFileSync("guest_histogram.png", image);

console.log("✅ Saved histogram to guest_histogram.png");

await pgClient.close();



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


