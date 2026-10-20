import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import type { Q, Tx } from "../db/index.ts";
import { roomMembers, rooms } from "../db/schema.ts";
import type { Result } from "../domain/outcome.ts";

export type RoomRow = typeof rooms.$inferSelect;
export type MemberRow = typeof roomMembers.$inferSelect;

/** Locks the room row (FOR UPDATE) so actions on one room apply one at a time, and reads the caller's seat with it. */
export async function lockWithMember(tx: Tx, code: string, userId: string): Promise<{ room: RoomRow; me: MemberRow | null } | undefined> {
  const [row] = await tx
    .select({ room: rooms, me: roomMembers })
    .from(rooms)
    .leftJoin(roomMembers, and(eq(roomMembers.roomCode, rooms.code), eq(roomMembers.userId, userId)))
    .where(eq(rooms.code, code))
    .for("update", { of: rooms });
  return row;
}

export async function lock(tx: Tx, code: string): Promise<RoomRow | undefined> {
  const [row] = await tx.select().from(rooms).where(eq(rooms.code, code)).for("update");
  return row;
}

export async function get(q: Q, code: string): Promise<RoomRow | undefined> {
  const [row] = await q.select().from(rooms).where(eq(rooms.code, code));
  return row;
}

/** The few small columns a poll needs to tell whether anything changed. */
export async function meta(q: Q, code: string) {
  const [row] = await q
    .select({ version: rooms.version, outcome: rooms.outcome, winnerId: rooms.winnerId, tieEndsAt: rooms.tieEndsAt })
    .from(rooms)
    .where(eq(rooms.code, code));
  return row;
}

/** Inserts unless the code is taken; ON CONFLICT makes the check and the insert one step. */
export async function insert(tx: Tx, row: typeof rooms.$inferInsert): Promise<boolean> {
  const inserted = await tx.insert(rooms).values(row).onConflictDoNothing().returning({ code: rooms.code });
  return inserted.length > 0;
}

export async function update(tx: Tx, code: string, set: Partial<typeof rooms.$inferInsert>) {
  await tx.update(rooms).set(set).where(eq(rooms.code, code));
}

export async function bumpVersion(tx: Tx, code: string) {
  await tx.update(rooms).set({ version: sql`${rooms.version} + 1` }).where(eq(rooms.code, code));
}

/** Writes how the round ended; columns the result doesn't use are cleared. */
export async function setResult(tx: Tx, code: string, r: Result) {
  await update(tx, code, {
    phase: "results",
    outcome: r.outcome,
    winnerId: "winnerId" in r ? r.winnerId : null,
    candidates: "candidates" in r ? r.candidates : null,
    tieStartsAt: "tieStartsAt" in r ? r.tieStartsAt : null,
    tieEndsAt: "tieEndsAt" in r ? r.tieEndsAt : null,
    afterTapWar: "afterTapWar" in r ? r.afterTapWar : null,
  });
}

export async function backToLobby(tx: Tx, code: string) {
  await update(tx, code, { phase: "lobby", outcome: null, winnerId: null, candidates: null, tieStartsAt: null, tieEndsAt: null, afterTapWar: null });
}

/** Members, votes, taps and candidates go with the room (ON DELETE CASCADE). */
export async function deleteCreatedBefore(tx: Tx, before: Date) {
  await tx.delete(rooms).where(lt(rooms.createdAt, before));
}
