import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";
import * as dotenv from "dotenv";

dotenv.config();

//export const DB_ID = "bseocOYqflQMDdju75d";
export const DB_ID = "crypto";

interface PostgreSQLConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
}

export const TABLES = {
  PODCASTS: "podcasts",
  EPISODES: "podcast_episodes",
  GUESTS: "podcast_credits",
  HOSTS: "podcast_hosts",
  PODCAST_APPS: "podcast_apps",
  EPISODE_TAGS: "podcast_episode_tags",
  PODCAST_TAGS: "podcast_tags",
  PODCHASER_CATEGORIES: "podchaser_categories",
  PEOPLE: "people",
  EXTERNAL_IDS: "podcast_external_ids",
  PLATFORMS: "platforms",
  LISTEN_ON: "podcast_listen_on_urls",
  CLAIMS: "claims",
  QUOTES: "quotes",
  CLAIM_QUOTES: "claim_quotes",
  CLAIM_EPISODES: "claim_episodes",
  TAG_MAP: "tag_map",
  TAGS: "tags",
} as const;

const validateEnvironmentVariables = (): PostgreSQLConfig => {
  const requiredVars = {
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    host: process.env.POSTGRES_HOST,
    database: process.env.POSTGRES_DB,
  };

  const missing = Object.entries(requiredVars)
    .filter(([_, value]) => !value)
    .map(([key]) => `POSTGRES_${key.toUpperCase()}`);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }

  return {
    user: requiredVars.user!,
    password: requiredVars.password!,
    host: requiredVars.host!,
    database: requiredVars.database!,
    port: parseInt(process.env.POSTGRES_PORT || "5432"),
  };
};

class PostgreSQLClient {
  private pool: Pool;

  constructor() {
    const pgConfig = validateEnvironmentVariables();
    this.pool = new Pool(pgConfig);
  }

  async getClient(): Promise<PoolClient> {
    try {
      return await this.pool.connect();
    } catch (error) {
      console.error("Error connecting to PostgreSQL:", error);
      throw error;
    }
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<T[]> {
    const client = await this.getClient();
    try {
      const result: QueryResult<T> = await client.query(text, params);
      return result.rows;
    } catch (error) {
      console.error("Error executing query:", error);
      console.error("Query:", text);
      console.error("Params:", params);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export default PostgreSQLClient;
