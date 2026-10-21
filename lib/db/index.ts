import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.ts";

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

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Repo functions take either: plain reads use `db`, anything under a room lock uses the transaction. */
export type Q = typeof db | Tx;

/** The Postgres error under Drizzle's wrapper, so callers can turn a constraint into a message. */
export function pgError(e: unknown): { code?: string; constraint?: string } {
  const cause = (e as { cause?: unknown })?.cause ?? e;
  return (cause ?? {}) as { code?: string; constraint?: string };
}
