import { drizzle } from "drizzle-orm/node-postgres";
import dotenv from "dotenv";
dotenv.config();

import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  // Supabase (like most managed Postgres) requires TLS on external
  // connections; local dev's docker-compose Postgres (localhost:5433) has
  // none. rejectUnauthorized: false because Supabase's certificate chain
  // isn't in Node's default trust store - this accepts encryption without
  // pinning Supabase's CA. Gated on NODE_ENV, which render.yaml sets to
  // "production" and .env.example sets to "development" for local dev.
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

export const db = drizzle(pool);
