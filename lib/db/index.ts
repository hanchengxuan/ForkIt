import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url });
  // On Vercel, closes idle connections before the function sleeps so they don't pile up; no-op elsewhere
  attachDatabasePool(pool);
  return drizzle(pool, { schema });
}

// Reuse one pool across dev hot reloads
const g = globalThis as unknown as { forkitPool?: ReturnType<typeof connect> };
export const db = (g.forkitPool ??= connect());
