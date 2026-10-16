import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // prepare: false keeps it working behind transaction poolers (Supabase, Neon pooled URLs)
  return drizzle(postgres(url, { prepare: false }), { schema });
}

// Reuse one pool across dev hot reloads
const g = globalThis as unknown as { forkitPg?: ReturnType<typeof connect> };
export const db = (g.forkitPg ??= connect());
