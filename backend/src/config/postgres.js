import { drizzle } from "drizzle-orm/node-postgres";
import dotenv from "dotenv";
dotenv.config();

import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  // TLS-on by default, opt-out via POSTGRES_SSL. Supabase (like most managed
  // Postgres) requires TLS on external connections; rejectUnauthorized: false
  // because Supabase's certificate chain isn't in Node's default trust store
  // - this accepts encryption without pinning Supabase's CA. Previously this
  // was gated on NODE_ENV === "production", which meant any non-"production"
  // environment (e.g. staging) silently connected with no TLS at all. Only
  // the docker-compose local Postgres (localhost:5433, no TLS support) should
  // set POSTGRES_SSL=false.
  ssl: process.env.POSTGRES_SSL === "false" ? false : { rejectUnauthorized: false }
});

export const db = drizzle(pool);
