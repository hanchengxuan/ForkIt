// Pure room rules: no database or Google, so `node --test` can run them directly.
import { randomInt } from "node:crypto";
import { budgetRange, fits, groupBudget, mainCurrency, type Limits } from "./budget.ts";
import { parseArea, parseCraving, parseGroupName, parseLimits, parseName } from "./input.ts";
import type { LatLng, Restaurant } from "./places";
import { decide, rank, resolveTapWar, tapTotals, VOTES, type Outcome, type Ranked, type Vote } from "./scoring.ts";

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
  picksOnly?: boolean; // host's choice: swipe only places added by hand, no Google suggestions
  members: Member[];
  votes: Record<string, Record<string, Vote>>;
  ranked: Ranked[];
  tieBreak?: TieBreak;
  winnerId?: string;
  noMatch?: boolean;
};

export class RoomError extends Error {}

const MAX_MEMBERS = 12;
const MAX_PICKED = 20;
const DECK_SIZE = 20;
const TAP_COUNTDOWN_MS = 3_000; // "3, 2, 1" so nobody gets a head start
const TAP_MS = 10_000;
const TAP_GRACE_MS = 1_000; // taps still in flight when the clock hits zero
const MAX_TAPS = 150; // shortcut: flat per-person cap (15 taps/sec) stops scripts, not fast thumbs
const SPIN_DELAY_MS = 1_500; // gives every phone time to poll before the wheel starts

/** A member's id is their Better Auth user id (guest or signed in). */
export function newMember(id: string, name: string, limits: Limits): Member {
  return { id, name, limits, done: false, vetoUsed: false };
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

/** What the group will swipe: every hand-picked place, plus (unless picks only) Google's best 20 within the group's budget. */
export function buildDeck(room: Pick<Room, "pool" | "members" | "picksOnly">): Restaurant[] {
  const picked = room.pool.filter((r) => r.addedBy);
  if (room.picksOnly) return picked;
  const max = groupBudget(room.members.map((m) => m.limits));
  const best = room.pool.filter((r) => !r.addedBy && fits(r, max)).slice(0, DECK_SIZE);
  return [...picked, ...best];
}

/** Budgets are amounts in the area's currency, e.g. AUD. */
export function currencyOf(pool: Restaurant[]): string {
  return mainCurrency(pool.flatMap((r) => (r.priceRange ? [r.priceRange] : []))) ?? "USD";
}

function finishVoting(room: Room) {
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

/** True once the tap war's clock has run out and nobody has settled it yet. */
export function tapWarOver(room: Room, now = Date.now()): boolean {
  const t = room.tieBreak;
  return t?.kind === "tapwar" && !room.winnerId && now >= t.endsAt + TAP_GRACE_MS;
}

/** The tap war ends on the clock, so reads settle it and no timers are needed. */
export function settleTapWar(room: Room, now = Date.now()) {
  const t = room.tieBreak;
  if (t?.kind !== "tapwar" || !tapWarOver(room, now)) return;
  apply(room, resolveTapWar(t.candidates, t.taps), true);
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

/** A new search, done before the row lock so a slow Google call never holds up other phones. */
export type Found = { restaurants: Restaurant[]; source: Room["source"]; center?: LatLng };

/** Work the route does before the row lock (Google calls), handed to the action that needs it. */
export type Prepared = { found?: Found; picked?: Restaurant };

type Body = Record<string, unknown>;

type Action = {
  hostOnly?: boolean;
  lobbyOnly?: boolean;
  run: (room: Room, me: Member, body: Body, prepared: Prepared) => void;
};

/** Every action a member can take. A new feature is a new entry here, plus a test in room.test.ts. */
const ACTIONS = {
  start: {
    hostOnly: true,
    run(room) {
      if (room.status !== "lobby") throw new RoomError("Already started");
      room.deck = buildDeck(room).map((r) => r.id);
      if (room.deck.length === 0) throw new RoomError(room.picksOnly ? "Add a restaurant first" : "No places fit everyone's budget");
      room.status = "voting";
    },
  },
  vote: {
    run(room, me, { vote, restaurantId }) {
      if (room.status !== "voting") throw new RoomError("Voting is closed");
      if (!VOTES.includes(vote as Vote) || typeof restaurantId !== "string" || !room.deck.includes(restaurantId))
        throw new RoomError("Invalid vote");
      const mine = (room.votes[me.id] ??= {});
      if (vote === "veto") {
        if (me.vetoUsed && mine[restaurantId] !== "veto") throw new RoomError("You already used your veto");
        me.vetoUsed = true;
      } else if (mine[restaurantId] === "veto") me.vetoUsed = false;
      mine[restaurantId] = vote as Vote;
      if (Object.keys(mine).length === room.deck.length) me.done = true;
      if (room.members.every((m) => m.done)) finishVoting(room);
    },
  },
  reveal: {
    hostOnly: true,
    run(room) {
      if (room.status !== "voting") throw new RoomError("Voting is closed");
      finishVoting(room);
    },
  },
  tap: {
    run(room, me, { counts }) {
      if (typeof counts !== "object" || !counts) throw new RoomError("Invalid taps");
      addTaps(room, me.id, counts as Body);
    },
  },
  rename: {
    hostOnly: true,
    run(room, _me, body) {
      const name = parseGroupName(body.name);
      if (!name) throw new RoomError("Give the group a name");
      room.name = name;
    },
  },
  setLimits: {
    lobbyOnly: true,
    run(_room, me, body) {
      const limits = parseLimits(body.limits);
      if (!limits) throw new RoomError("Pick a budget");
      me.limits = limits;
    },
  },
  setSearch: {
    hostOnly: true,
    lobbyOnly: true,
    run(room, _me, body, { found }) {
      if (!found) throw new RoomError("Tell us where you're eating");
      // Hand-picked places stay; the nearby list is swapped for the new area's
      const kept = room.pool.filter((r) => r.addedBy);
      const was = currencyOf(room.pool);
      room.pool = [...found.restaurants.filter((r) => !kept.some((k) => k.id === r.id)), ...kept];
      // A budget of 40 means nothing once AUD becomes JPY; everyone picks again
      if (currencyOf(room.pool) !== was) for (const m of room.members) m.limits = { maxSpend: null };
      room.area = parseArea(body.area);
      room.craving = parseCraving(body.craving);
      room.source = found.source;
      room.center = found.center;
    },
  },
  setPicksOnly: {
    hostOnly: true,
    lobbyOnly: true,
    run(room, _me, { on }) {
      room.picksOnly = on === true;
    },
  },
  addPlace: {
    lobbyOnly: true,
    run(room, me, _body, { picked }) {
      if (!picked) throw new RoomError("Pick a restaurant");
      const existing = room.pool.find((r) => r.id === picked.id);
      if (existing?.addedBy) throw new RoomError(`${existing.name} is already on the list`);
      if (existing) existing.addedBy = me.id; // was hidden by the budget; asking for it by name brings it back
      else if (room.pool.filter((r) => r.addedBy).length >= MAX_PICKED) throw new RoomError("That's plenty of picks");
      else room.pool.push({ ...picked, addedBy: me.id });
    },
  },
  removePlace: {
    lobbyOnly: true,
    run(room, _me, { restaurantId }) {
      room.pool = room.pool.filter((r) => r.id !== restaurantId);
    },
  },
  restart: {
    hostOnly: true,
    run(room) {
      room.status = "lobby";
      room.deck = [];
      room.votes = {};
      room.ranked = [];
      room.tieBreak = undefined;
      room.winnerId = undefined;
      room.noMatch = undefined;
      for (const m of room.members) Object.assign(m, { done: false, vetoUsed: false });
    },
  },
} satisfies Record<string, Action>;

/** What a phone can send as `action`, so the client gets a compile error for a typo. */
export type ActionName = keyof typeof ACTIONS | "join";

function join(room: Room, id: string, body: Body) {
  if (room.members.some((m) => m.id === id)) return;
  if (room.status !== "lobby") throw new RoomError("This group has already started swiping");
  const name = parseName(body.name);
  const limits = parseLimits(body.limits);
  if (!name || !limits) throw new RoomError("Please enter your name");
  if (room.members.length >= MAX_MEMBERS) throw new RoomError("This group is full");
  room.members.push(newMember(id, name, limits));
}

/** Applies one action from a phone. Throws RoomError for anything the player should be told. */
export function act(room: Room, memberId: string, action: string, body: Body, prepared: Prepared = {}) {
  if (action === "join") return join(room, memberId, body);
  const me = room.members.find((m) => m.id === memberId);
  if (!me) throw new RoomError("You're not in this group");
  const a: Action | undefined = Object.hasOwn(ACTIONS, action) ? ACTIONS[action as keyof typeof ACTIONS] : undefined;
  if (!a) throw new RoomError("Unknown action");
  if (a.hostOnly && me.id !== room.hostId) throw new RoomError("Only the host can do that");
  if (a.lobbyOnly && room.status !== "lobby") throw new RoomError("Swiping has already started");
  a.run(room, me, body, prepared);
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
    picksOnly: room.picksOnly ?? false,
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
