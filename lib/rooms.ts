import "server-only";
import { randomInt } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { rooms } from "./db/schema";
import { budgetRange, fits, groupBudget, mainCurrency, type Limits } from "./budget";
import type { LatLng, Restaurant } from "./places";
import { decide, rank, resolveTapWar, tapTotals, type Outcome, type Ranked, type Vote } from "./scoring";

export type Member = { id: string; name: string; limits: Limits; done: boolean; vetoUsed: boolean };

export type TieBreak =
  | { kind: "tapwar"; candidates: string[]; startAt: number; endsAt: number; taps: Record<string, Record<string, number>> }
  | { kind: "roulette"; candidates: string[]; startAt: number; afterTapWar: boolean };

export type Room = {
  code: string;
  name?: string; // the group's display name; rooms from before names fall back to "<host>'s dinner"
  hostId: string;
  area: string;
  craving?: string; // what kind of food, e.g. "yum cha"; empty means any restaurant
  source: "google" | "sample";
  center?: LatLng; // where the search was, so "add a restaurant" suggests nearby places first
  status: "lobby" | "voting" | "results";
  pool: Restaurant[]; // up to 60 Google candidates, best first, plus places added by hand
  deck: string[]; // ids within everyone's budget, set when voting starts
  members: Member[];
  votes: Record<string, Record<string, Vote>>;
  ranked: Ranked[];
  tieBreak?: TieBreak;
  winnerId?: string;
  noMatch?: boolean;
};

const TAP_COUNTDOWN_MS = 3_000; // "3, 2, 1" so nobody gets a head start
const TAP_MS = 10_000;
const TAP_GRACE_MS = 1_000; // taps still in flight when the clock hits zero
const MAX_TAPS = 150; // shortcut: flat per-person cap (15 taps/sec) stops scripts, not fast thumbs
const SPIN_DELAY_MS = 1_500; // gives every phone time to poll before the wheel starts

export async function getRoom(code: string): Promise<Room | undefined> {
  const [row] = await db.select().from(rooms).where(eq(rooms.code, code));
  return row?.data;
}

export class RoomError extends Error {}

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

/** A member's id is their Better Auth user id (guest or signed in). */
export function newMember(id: string, name: string, limits: Limits): Member {
  return { id, name, limits, done: false, vetoUsed: false };
}

/** A guest signed in: their seats, votes and taps now belong to the real account. */
export async function moveMember(from: string, to: string) {
  const found = await db
    .select({ code: rooms.code })
    .from(rooms)
    .where(sql`${rooms.data}->'members' @> ${JSON.stringify([{ id: from }])}::jsonb`);
  for (const { code } of found) await updateRoom(code, (room) => renameMember(room, from, to));
}

export function renameMember(room: Room, from: string, to: string) {
  const me = room.members.find((m) => m.id === from);
  // Already in this room on the real account (another device): keep both seats as they are
  if (!me || room.members.some((m) => m.id === to)) return;
  me.id = to;
  if (room.hostId === from) room.hostId = to;
  for (const r of room.pool) if (r.addedBy === from) r.addedBy = to;
  const rekey = <T>(r: Record<string, T>) => {
    if (!(from in r)) return;
    r[to] = r[from];
    delete r[from];
  };
  rekey(room.votes);
  if (room.tieBreak?.kind === "tapwar") rekey(room.tieBreak.taps);
}

const DECK_SIZE = 20;

/** What the group will swipe: every hand-picked place, plus Google's best 20 within the group's budget. */
export function buildDeck(room: Pick<Room, "pool" | "members">): Restaurant[] {
  const max = groupBudget(room.members.map((m) => m.limits));
  const picked = room.pool.filter((r) => r.addedBy);
  const best = room.pool.filter((r) => !r.addedBy && fits(r, max)).slice(0, DECK_SIZE);
  return [...picked, ...best];
}

/** Budgets are amounts in the area's currency, e.g. AUD. */
export function currencyOf(pool: Restaurant[]): string {
  return mainCurrency(pool.flatMap((r) => (r.priceRange ? [r.priceRange] : []))) ?? "USD";
}

export function finishVoting(room: Room) {
  room.status = "results";
  room.ranked = rank(room.deck, room.votes);
  apply(room, decide(room.ranked), false);
}

/** Phones send their taps in small batches; batches outside the tapping window are dropped. */
export function addTaps(room: Room, memberId: string, counts: Record<string, unknown>, now = Date.now()) {
  const t = room.tieBreak;
  if (t?.kind !== "tapwar" || room.winnerId) throw new RoomError("The tap war is over");
  if (now < t.startAt || now > t.endsAt + TAP_GRACE_MS) return;
  const mine = (t.taps[memberId] ??= {});
  let total = Object.values(mine).reduce((a, b) => a + b, 0);
  for (const [id, n] of Object.entries(counts)) {
    if (!t.candidates.includes(id) || !Number.isInteger(n) || (n as number) < 0) continue;
    const add = Math.min(n as number, MAX_TAPS - total);
    mine[id] = (mine[id] ?? 0) + add;
    total += add;
  }
}

/** The tap war ends on the clock. Called on every read, so no timers needed. */
export function settleTapWar(room: Room, now = Date.now()): boolean {
  const t = room.tieBreak;
  if (t?.kind !== "tapwar" || room.winnerId || now < t.endsAt + TAP_GRACE_MS) return false;
  apply(room, resolveTapWar(t.candidates, t.taps), true);
  return true;
}

function apply(room: Room, o: Outcome, afterTapWar: boolean) {
  if (o.kind === "winner") room.winnerId = o.id;
  if (o.kind === "none") room.noMatch = true;
  if (o.kind === "tapwar") {
    const startAt = Date.now() + TAP_COUNTDOWN_MS;
    room.tieBreak = { kind: "tapwar", candidates: o.candidates, startAt, endsAt: startAt + TAP_MS, taps: {} };
  }
  if (o.kind === "roulette") {
    // The server picks; phones only animate, so everyone lands on the same place.
    room.winnerId = o.candidates[randomInt(o.candidates.length)];
    room.tieBreak = { kind: "roulette", candidates: o.candidates, startAt: Date.now() + SPIN_DELAY_MS, afterTapWar };
  }
}

export function restart(room: Room) {
  room.status = "lobby";
  room.deck = [];
  room.votes = {};
  room.ranked = [];
  room.tieBreak = undefined;
  room.winnerId = undefined;
  room.noMatch = undefined;
  for (const m of room.members) Object.assign(m, { done: false, vetoUsed: false });
}

/** What a phone is allowed to see. Other people's swipes stay hidden until results. */
export function toView(room: Room, meId: string | null) {
  const me = room.members.find((m) => m.id === meId) ?? null;
  const showVotes = room.status === "results";
  const deck = room.status === "lobby" ? buildDeck(room) : room.deck.map((id) => room.pool.find((r) => r.id === id)!);
  const t = room.tieBreak;
  return {
    code: room.code,
    name: room.name ?? `${room.members.find((m) => m.id === room.hostId)?.name}'s dinner`,
    area: room.area,
    craving: room.craving ?? "",
    source: room.source,
    currency: currencyOf(room.pool),
    status: room.status,
    now: Date.now(),
    me,
    isHost: me?.id === room.hostId,
    members: room.members.map((m) => ({
      id: m.id,
      name: m.name,
      limits: m.limits,
      done: m.done,
      isHost: m.id === room.hostId,
      swiped: Object.keys(room.votes[m.id] ?? {}).length,
    })),
    restaurants: Object.fromEntries(deck.map((r) => [r.id, r])), // only what's on screen: the pool is big
    budgetRange: budgetRange(
      room.pool.flatMap((r) => (r.priceRange ? [r.priceRange] : [])),
      currencyOf(room.pool),
    ),
    deck: deck.map((r) => r.id),
    myVotes: (me && room.votes[me.id]) ?? {},
    votes: showVotes ? room.votes : {},
    ranked: room.ranked,
    tieBreak:
      t?.kind === "tapwar"
        ? { ...t, taps: {}, totals: tapTotals(t.candidates, t.taps), mine: (me && t.taps[me.id]) ?? {} }
        : t,
    winnerId: room.winnerId,
    noMatch: room.noMatch ?? false,
  };
}

export type RoomView = ReturnType<typeof toView>;
