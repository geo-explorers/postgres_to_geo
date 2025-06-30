import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";
import * as dotenv from "dotenv";

dotenv.config();

interface PostgreSQLConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
}

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
