// READ-ONLY: inspect the Empire podcast rows + the Algerian episode's linkage.
import PostgreSQLClient, { DB_ID } from "./src/postgres-client.ts";

const db = new PostgreSQLClient();

const empires = await db.query(
  `SELECT id, name, channel_name, slug, rss_feed_url, website, episode_count, latest_episode_at
   FROM "${DB_ID}".podcasts WHERE name ILIKE '%empire%'`,
);
console.log(`─── podcasts rows matching 'empire' (${empires.length}) ───`);
console.log(JSON.stringify(empires, null, 2));

for (const p of empires) {
  const sample = await db.query(
    `SELECT id, name, air_date FROM "${DB_ID}".podcast_episodes
     WHERE podcast_id = $1 ORDER BY air_date DESC NULLS LAST LIMIT 5`,
    [p.id],
  );
  const count = await db.query(
    `SELECT count(*)::int AS n FROM "${DB_ID}".podcast_episodes WHERE podcast_id = $1`,
    [p.id],
  );
  console.log(`\n─── podcast ${p.id} "${p.name}": ${count[0].n} episodes, 5 newest ───`);
  for (const e of sample) console.log(`  [${e.air_date?.toISOString?.()?.slice(0, 10) ?? e.air_date}] ${e.name}`);
}

const eps = await db.query(
  `SELECT id, podcast_id, name, air_date, created_at FROM "${DB_ID}".podcast_episodes
   WHERE name ILIKE '%algerian revolution%'`,
);
console.log(`\n─── Algerian episode rows (${eps.length}) ───`);
console.log(JSON.stringify(eps, null, 2));

await db.close();
