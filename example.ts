import PostgreSQLClient from "./src/postgres-client";

const DB_ID = "bseocOYqflQMDdju75d";

async function main() {
  const pgClient = new PostgreSQLClient();
  try {
    const client = await pgClient.getClient();
    const result = await client.query(`
        SELECT * FROM "${DB_ID}".projects
        ORDER BY __auto_number ASC
        LIMIT 100
    `);
    console.log(result.rows.length);
  } catch (error) {
    console.error(error);
  } finally {
    await pgClient.close();
  }
}

main();
