import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Q, Tx } from "../db/index.ts";
import { taps } from "../db/schema.ts";

export type Taps = Record<string, Record<string, number>>; // memberId -> placeId -> taps

/** Adds a batch to the running counts in one statement. */
export async function add(tx: Tx, code: string, userId: string, counts: Record<string, number>) {
  const rows = Object.entries(counts).map(([placeId, count]) => ({ roomCode: code, userId, placeId, count }));
  if (rows.length === 0) return;
  await tx
    .insert(taps)
    .values(rows)
    .onConflictDoUpdate({ target: [taps.roomCode, taps.userId, taps.placeId], set: { count: sql`${taps.count} + excluded.count` } });
}

export async function totalOf(q: Q, code: string, userId: string): Promise<number> {
  const [{ n }] = await q
    .select({ n: sql<number>`coalesce(sum(${taps.count}), 0)::int` })
    .from(taps)
    .where(and(eq(taps.roomCode, code), eq(taps.userId, userId)));
  return n;
}

export async function all(q: Q, code: string): Promise<Taps> {
  const rows = await q.select().from(taps).where(eq(taps.roomCode, code));
  const out: Taps = {};
  for (const r of rows) (out[r.userId] ??= {})[r.placeId] = r.count;
  return out;
}

export async function clear(tx: Tx, code: string) {
  await tx.delete(taps).where(eq(taps.roomCode, code));
}
