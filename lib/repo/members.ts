import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Q, Tx } from "../db/index.ts";
import { roomMembers } from "../db/schema.ts";
import type { MemberRow } from "./rooms.ts";

export async function list(q: Q, code: string): Promise<MemberRow[]> {
  return q.select().from(roomMembers).where(eq(roomMembers.roomCode, code)).orderBy(asc(roomMembers.joinedAt), asc(roomMembers.userId));
}

export async function count(q: Q, code: string): Promise<number> {
  const [{ n }] = await q.select({ n: sql<number>`count(*)::int` }).from(roomMembers).where(eq(roomMembers.roomCode, code));
  return n;
}

export async function insert(tx: Tx, row: typeof roomMembers.$inferInsert) {
  await tx.insert(roomMembers).values(row).onConflictDoNothing();
}

export async function setMaxSpend(tx: Tx, code: string, userId: string, maxSpend: number | null) {
  await tx.update(roomMembers).set({ maxSpend }).where(and(eq(roomMembers.roomCode, code), eq(roomMembers.userId, userId)));
}

export async function clearBudgets(tx: Tx, code: string) {
  await tx.update(roomMembers).set({ maxSpend: null }).where(eq(roomMembers.roomCode, code));
}

/** Votes and taps follow the seat (ON UPDATE CASCADE). */
export async function rename(tx: Tx, code: string, from: string, to: string) {
  await tx.update(roomMembers).set({ userId: to }).where(and(eq(roomMembers.roomCode, code), eq(roomMembers.userId, from)));
}

/** Rooms where `userId` has a seat. */
export async function roomsOf(q: Q, userId: string): Promise<string[]> {
  const rows = await q.select({ code: roomMembers.roomCode }).from(roomMembers).where(eq(roomMembers.userId, userId));
  return rows.map((r) => r.code);
}
