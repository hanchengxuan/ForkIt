import "server-only";
import { randomInt } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { rooms } from "./db/schema";
import type { Limits } from "./budget";
import type { LatLng, Restaurant } from "./places";
import { newMember, renameMember, RoomError, type Room } from "./room";

export async function getRoom(code: string): Promise<Room | undefined> {
  const [row] = await db.select().from(rooms).where(eq(rooms.code, code));
  return row?.data;
}

/** FOR UPDATE locks the row, so concurrent swipes and taps on one room apply one at a time. */
export function updateRoom(code: string, change: (room: Room) => void): Promise<Room> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(rooms).where(eq(rooms.code, code)).for("update");
    if (!row) throw new RoomError("Room not found");
    change(row.data);
    await tx.update(rooms).set({ data: row.data }).where(eq(rooms.code, code));
    return row.data;
  });
}

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ"; // no I/L/O, easy to read out loud

export async function createRoom(input: {
  userId: string;
  name: string;
  limits: Limits;
  area: string;
  craving?: string;
  source: Room["source"];
  center?: LatLng;
  pool: Restaurant[];
}): Promise<Room> {
  const host = newMember(input.userId, input.name, input.limits);
  const room: Room = {
    code: "",
    name: `${input.name}'s dinner`,
    hostId: host.id,
    area: input.area,
    craving: input.craving,
    source: input.source,
    center: input.center,
    status: "lobby",
    pool: input.pool,
    deck: [],
    members: [host],
    votes: {},
    ranked: [],
  };
  // Retry on a taken code; ON CONFLICT makes the check and the insert one step
  for (;;) {
    room.code = Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
    const inserted = await db.insert(rooms).values({ code: room.code, data: room }).onConflictDoNothing().returning({ code: rooms.code });
    if (inserted.length) break;
  }
  return room;
}

/** A guest signed in: their seats, votes and taps now belong to the real account. */
export async function moveMember(from: string, to: string) {
  const found = await db
    .select({ code: rooms.code })
    .from(rooms)
    .where(sql`${rooms.data}->'members' @> ${JSON.stringify([{ id: from }])}::jsonb`);
  for (const { code } of found) await updateRoom(code, (room) => renameMember(room, from, to));
}
