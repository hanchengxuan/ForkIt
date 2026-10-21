import "server-only";
import { randomInt } from "node:crypto";
import { db, type Tx } from "../db/index.ts";
import type { Limits } from "../domain/budget.ts";
import { buildDeck, currencyOf } from "../domain/deck.ts";
import { parseArea, parseCraving, parseGroupName, parseLimits, parseName } from "../domain/input.ts";
import { acceptTaps, inTapWindow, settle, tapClockOut } from "../domain/outcome.ts";
import { decide, rank, resolveTapWar, VOTES, type Vote } from "../domain/scoring.ts";
import type { LatLng, Restaurant } from "../google-places.ts";
import * as members from "../repo/members.ts";
import * as places from "../repo/places.ts";
import * as rooms from "../repo/rooms.ts";
import type { MemberRow, RoomRow } from "../repo/rooms.ts";
import * as taps from "../repo/taps.ts";
import * as votes from "../repo/votes.ts";

/** Something the player should be told, e.g. "Voting is closed". Routes turn it into a 400. */
export class RoomError extends Error {}

const MAX_MEMBERS = 12;
const MAX_PICKED = 20;
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ"; // no I/L/O, easy to read out loud
// 4 letters give ~280k codes, so old rooms must go or new ones run out of codes
const ROOM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CODE_TRIES = 20;

/** A new search, done before the room lock so a slow Google call never holds up other phones. */
export type Found = { restaurants: Restaurant[]; source: RoomRow["source"]; center?: LatLng };

/** Work the route does before the lock (Google calls), handed to the action that needs it. */
export type Prepared = { found?: Found; picked?: Restaurant };

type Body = Record<string, unknown>;
type Ctx = { tx: Tx; room: RoomRow; me: MemberRow; body: Body; prepared: Prepared };

type Action = {
  hostOnly?: boolean;
  lobbyOnly?: boolean;
  run: (ctx: Ctx) => Promise<void>;
};

const limitsOf = (m: MemberRow): Limits => ({ maxSpend: m.maxSpend });

async function finishVoting(tx: Tx, code: string) {
  const ranked = rank(await places.deck(tx, code), await votes.all(tx, code));
  await rooms.setResult(tx, code, settle(decide(ranked), false));
}

/** Every action a member can take. A new feature is a new entry here, plus a test in actions.test.ts. */
const ACTIONS = {
  start: {
    hostOnly: true,
    async run({ tx, room }) {
      if (room.phase !== "lobby") throw new RoomError("Already started");
      const deck = buildDeck(await places.pool(tx, room.code), (await members.list(tx, room.code)).map(limitsOf), room.picksOnly);
      if (deck.length === 0) throw new RoomError(room.picksOnly ? "Add a restaurant first" : "No places fit everyone's budget");
      await places.setDeck(tx, room.code, deck);
      await rooms.update(tx, room.code, { phase: "voting" });
    },
  },
  vote: {
    async run({ tx, room, me, body: { vote, restaurantId } }) {
      if (room.phase !== "voting") throw new RoomError("Voting is closed");
      if (!VOTES.includes(vote as Vote) || typeof restaurantId !== "string") throw new RoomError("Invalid vote");
      const cast = await votes.cast(tx, room.code, me.userId, restaurantId, vote as Vote);
      if (cast === "off deck") throw new RoomError("Invalid vote");
      if (cast === "veto used") throw new RoomError("You already used your veto");
      if (await votes.everyoneDone(tx, room.code)) await finishVoting(tx, room.code);
    },
  },
  reveal: {
    hostOnly: true,
    async run({ tx, room }) {
      if (room.phase !== "voting") throw new RoomError("Voting is closed");
      await finishVoting(tx, room.code);
    },
  },
  tap: {
    async run({ tx, room, me, body: { counts } }) {
      if (typeof counts !== "object" || !counts) throw new RoomError("Invalid taps");
      if (room.outcome !== "tapwar" || room.winnerId || room.tieStartsAt === null || room.tieEndsAt === null)
        throw new RoomError("The tap war is over");
      // Batches outside the tapping window are dropped, not refused: phones keep sending for a moment
      if (!inTapWindow(room.tieStartsAt, room.tieEndsAt)) return;
      const accepted = acceptTaps(room.candidates ?? [], await taps.totalOf(tx, room.code, me.userId), counts as Body);
      await taps.add(tx, room.code, me.userId, accepted);
    },
  },
  rename: {
    hostOnly: true,
    async run({ tx, room, body }) {
      const name = parseGroupName(body.name);
      if (!name) throw new RoomError("Give the group a name");
      await rooms.update(tx, room.code, { name });
    },
  },
  setLimits: {
    lobbyOnly: true,
    async run({ tx, room, me, body }) {
      const limits = parseLimits(body.limits);
      if (!limits) throw new RoomError("Pick a budget");
      await members.setMaxSpend(tx, room.code, me.userId, limits.maxSpend);
    },
  },
  setSearch: {
    hostOnly: true,
    lobbyOnly: true,
    async run({ tx, room, body, prepared: { found } }) {
      if (!found) throw new RoomError("Tell us where you're eating");
      const was = currencyOf(await places.pool(tx, room.code));
      // Hand-picked places stay; the nearby list is swapped for the new area's
      await places.upsert(tx, found.restaurants);
      await places.removeSearchResults(tx, room.code);
      await places.addToRoom(tx, room.code, found.restaurants.map((r) => r.id));
      // A budget of 40 means nothing once AUD becomes JPY; everyone picks again
      if (currencyOf(await places.pool(tx, room.code)) !== was) await members.clearBudgets(tx, room.code);
      await rooms.update(tx, room.code, {
        area: parseArea(body.area),
        craving: parseCraving(body.craving),
        source: found.source,
        centerLat: found.center?.latitude ?? null,
        centerLng: found.center?.longitude ?? null,
      });
    },
  },
  setPicksOnly: {
    hostOnly: true,
    lobbyOnly: true,
    async run({ tx, room, body: { on } }) {
      await rooms.update(tx, room.code, { picksOnly: on === true });
    },
  },
  addPlace: {
    lobbyOnly: true,
    async run({ tx, room, me, prepared: { picked } }) {
      if (!picked) throw new RoomError("Pick a restaurant");
      const pool = await places.pool(tx, room.code);
      const existing = pool.find((r) => r.id === picked.id);
      if (existing?.addedBy) throw new RoomError(`${picked.name} is already on the list`);
      await places.upsert(tx, [picked]);
      // Was hidden by the budget; asking for it by name brings it back
      if (existing) return places.setAddedBy(tx, room.code, picked.id, me.userId);
      if (pool.filter((r) => r.addedBy).length >= MAX_PICKED) throw new RoomError("That's plenty of picks");
      await places.addToRoom(tx, room.code, [picked.id], me.userId);
    },
  },
  removePlace: {
    lobbyOnly: true,
    async run({ tx, room, body: { restaurantId } }) {
      if (typeof restaurantId === "string") await places.removeFromRoom(tx, room.code, restaurantId);
    },
  },
  restart: {
    hostOnly: true,
    async run({ tx, room }) {
      await votes.clear(tx, room.code);
      await taps.clear(tx, room.code);
      await places.setDeck(tx, room.code, []);
      await rooms.backToLobby(tx, room.code);
    },
  },
} satisfies Record<string, Action>;

/** What a phone can send as `action`, so the client gets a compile error for a typo. */
export type ActionName = keyof typeof ACTIONS | "join";

async function join(tx: Tx, room: RoomRow, userId: string, body: Body) {
  if (room.phase !== "lobby") throw new RoomError("This group has already started swiping");
  const name = parseName(body.name);
  const limits = parseLimits(body.limits);
  if (!name || !limits) throw new RoomError("Please enter your name");
  if ((await members.count(tx, room.code)) >= MAX_MEMBERS) throw new RoomError("This group is full");
  await members.insert(tx, { roomCode: room.code, userId, name, maxSpend: limits.maxSpend });
}

/**
 * Applies one action from a phone inside one transaction: lock the room row, check who may do it,
 * run it, bump the version. Throws RoomError for anything the player should be told.
 */
export async function act(code: string, userId: string, action: string, body: Body, prepared: Prepared = {}) {
  await db.transaction(async (tx) => {
    const locked = await rooms.lockWithMember(tx, code, userId);
    if (!locked) throw new RoomError("Room not found");
    const { room, me } = locked;
    if (action === "join") {
      if (me) return; // already in: nothing changed
      await join(tx, room, userId, body);
    } else {
      if (!me) throw new RoomError("You're not in this group");
      const a: Action | undefined = Object.hasOwn(ACTIONS, action) ? ACTIONS[action as keyof typeof ACTIONS] : undefined;
      if (!a) throw new RoomError("Unknown action");
      if (a.hostOnly && me.userId !== room.hostId) throw new RoomError("Only the host can do that");
      if (a.lobbyOnly && room.phase !== "lobby") throw new RoomError("Swiping has already started");
      await a.run({ tx, room, me, body, prepared });
    }
    await rooms.bumpVersion(tx, code);
  });
}

/** The tap war ends on the clock, so a poll settles it and no timers are needed. Safe to call twice. */
export async function settleTapWar(code: string) {
  await db.transaction(async (tx) => {
    const r = await rooms.lock(tx, code);
    // Re-checked under the lock: another phone's poll may have settled it a moment ago
    if (r?.outcome !== "tapwar" || r.winnerId || r.tieEndsAt === null || !tapClockOut(r.tieEndsAt)) return;
    const o = resolveTapWar(r.candidates ?? [], await taps.all(tx, code));
    // A winner stays a tap war (results say "Won the tap war"); another tie goes to the wheel
    if (o.kind === "winner") await rooms.update(tx, code, { winnerId: o.id });
    else await rooms.setResult(tx, code, settle(o, true));
    await rooms.bumpVersion(tx, code);
  });
}

export async function createRoom(input: {
  userId: string;
  name: string;
  area: string;
  craving?: string;
  source: RoomRow["source"];
  center?: LatLng;
  pool: Restaurant[];
  picksOnly?: boolean;
}): Promise<string> {
  return db.transaction(async (tx) => {
    // Creating a room sweeps expired ones, so codes free up without a cron job
    await rooms.deleteCreatedBefore(tx, new Date(Date.now() - ROOM_TTL_MS));
    await places.deleteUnused(tx);
    await places.upsert(tx, input.pool);
    for (let i = 0; i < MAX_CODE_TRIES; i++) {
      const code = Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
      const inserted = await rooms.insert(tx, {
        code,
        name: `${input.name}'s dinner`,
        hostId: input.userId,
        area: input.area,
        craving: input.craving ?? "",
        source: input.source,
        centerLat: input.center?.latitude,
        centerLng: input.center?.longitude,
        picksOnly: input.picksOnly ?? false,
      });
      if (!inserted) continue;
      // The area's currency isn't known until the search is back, so budgets start open and are set in the lobby
      await members.insert(tx, { roomCode: code, userId: input.userId, name: input.name, maxSpend: null });
      await places.addToRoom(tx, code, input.pool.map((r) => r.id));
      return code;
    }
    throw new Error("No free room codes");
  });
}

/** A guest signed in: their seats, host roles, picks, votes and taps now belong to the real account. */
export async function moveMember(from: string, to: string) {
  for (const code of await members.roomsOf(db, from)) {
    await db.transaction(async (tx) => {
      const locked = await rooms.lockWithMember(tx, code, to);
      // Already in this room on the real account (another device): keep both seats as they are
      if (!locked || locked.me) return;
      await members.rename(tx, code, from, to); // votes and taps follow (ON UPDATE CASCADE)
      await places.renameAddedBy(tx, code, from, to);
      if (locked.room.hostId === from) await rooms.update(tx, code, { hostId: to });
      await rooms.bumpVersion(tx, code);
    });
  }
}
