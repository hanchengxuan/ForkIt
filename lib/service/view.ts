import "server-only";
import { db } from "../db/index.ts";
import { budgetRange, type Limits } from "../domain/budget.ts";
import { buildDeck, currencyOf } from "../domain/deck.ts";
import { rank, tapTotals } from "../domain/scoring.ts";
import * as members from "../repo/members.ts";
import * as places from "../repo/places.ts";
import * as rooms from "../repo/rooms.ts";
import * as taps from "../repo/taps.ts";
import * as votes from "../repo/votes.ts";

/** Changes when the room or the viewer does, so a phone holding this view can skip re-downloading it. */
export const etagOf = (version: number, meId: string | null) => `${version}:${meId ?? ""}`;

/** Small columns only: what a poll needs to decide between "unchanged", "settle the tap war" and a full view. */
export const roomMeta = (code: string) => rooms.meta(db, code);

/** The room row without its members or places, for checks a route makes before taking the lock. */
export const roomInfo = (code: string) => rooms.get(db, code);

/**
 * What a phone is allowed to see. Other people's swipes stay hidden until results.
 * One read-only REPEATABLE READ transaction, so every table is read at the same moment.
 */
export async function loadView(code: string, meId: string | null) {
  return db.transaction(
    async (tx) => {
      const room = await rooms.get(tx, code);
      if (!room) return undefined;
      const people = await members.list(tx, code);
      const pool = await places.pool(tx, code);
      const allVotes = await votes.all(tx, code);
      const allTaps = room.outcome === "tapwar" ? await taps.all(tx, code) : {};

      const limitsOf = (m: (typeof people)[number]): Limits => ({ maxSpend: m.maxSpend });
      const deck =
        room.phase === "lobby"
          ? buildDeck(pool, people.map(limitsOf), room.picksOnly)
          : pool
              .filter((p) => p.deckPosition !== null)
              .sort((a, b) => a.deckPosition! - b.deckPosition!)
              .map((p) => p.id);
      const swiped = (id: string) => Object.keys(allVotes[id] ?? {}).length;
      const done = (id: string) => room.phase !== "lobby" && swiped(id) >= deck.length;
      const myVotes = (meId && allVotes[meId]) || {};
      const meRow = people.find((m) => m.userId === meId);
      const currency = currencyOf(pool);
      const candidates = room.candidates ?? [];

      return {
        etag: etagOf(room.version, meId),
        code: room.code,
        name: room.name,
        area: room.area,
        craving: room.craving,
        source: room.source,
        currency,
        picksOnly: room.picksOnly,
        status: room.phase,
        now: Date.now(),
        me: meRow
          ? { id: meRow.userId, name: meRow.name, limits: limitsOf(meRow), done: done(meRow.userId), vetoUsed: Object.values(myVotes).includes("veto") }
          : null,
        isHost: meId === room.hostId,
        members: people.map((m) => ({
          id: m.userId,
          name: m.name,
          limits: limitsOf(m),
          done: done(m.userId),
          isHost: m.userId === room.hostId,
          swiped: swiped(m.userId),
        })),
        restaurants: await places.cards(tx, code, deck), // only what's on screen: the pool is big
        budgetRange: budgetRange(
          pool.flatMap((r) => (r.priceRange ? [r.priceRange] : [])),
          currency,
        ),
        deck,
        myVotes,
        votes: room.phase === "results" ? allVotes : {},
        ranked: room.phase === "results" ? rank(deck, allVotes) : [],
        tieBreak:
          room.outcome === "tapwar"
            ? {
                kind: "tapwar" as const,
                candidates,
                startAt: room.tieStartsAt!,
                endsAt: room.tieEndsAt!,
                totals: tapTotals(candidates, allTaps),
                mine: (meId && allTaps[meId]) || {},
              }
            : room.outcome === "roulette"
              ? { kind: "roulette" as const, candidates, startAt: room.tieStartsAt!, afterTapWar: room.afterTapWar ?? false }
              : undefined,
        winnerId: room.winnerId ?? undefined,
        noMatch: room.outcome === "none",
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export type RoomView = NonNullable<Awaited<ReturnType<typeof loadView>>>;
