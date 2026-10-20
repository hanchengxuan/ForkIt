import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, notExists, sql } from "drizzle-orm";
import type { Q, Tx } from "../db/index.ts";
import { places, roomPlaces } from "../db/schema.ts";
import type { PoolEntry } from "../domain/deck.ts";
import type { Restaurant } from "../google-places.ts";

/** Caches Google's details; a place seen again is refreshed. */
export async function upsert(tx: Tx, restaurants: Restaurant[]) {
  if (restaurants.length === 0) return;
  const rows = restaurants.map(({ priceRange, ...data }) => ({
    placeId: data.id,
    priceFrom: priceRange?.from ?? null,
    priceTo: priceRange?.to ?? null,
    currency: priceRange?.currency ?? null,
    data,
  }));
  await tx
    .insert(places)
    .values(rows)
    .onConflictDoUpdate({
      target: places.placeId,
      set: {
        priceFrom: sql`excluded.price_from`,
        priceTo: sql`excluded.price_to`,
        currency: sql`excluded.currency`,
        data: sql`excluded.data`,
        fetchedAt: sql`now()`,
      },
    });
}

/** Places no room uses any more; called when expired rooms are swept, so cached Google data goes with them. */
export async function deleteUnused(tx: Tx) {
  await tx.delete(places).where(notExists(tx.select().from(roomPlaces).where(eq(roomPlaces.placeId, places.placeId))));
}

const priceRangeOf = (r: { priceFrom: number | null; priceTo: number | null; currency: string | null }) =>
  r.priceFrom !== null && r.currency ? { from: r.priceFrom, to: r.priceTo ?? undefined, currency: r.currency } : undefined;

/** The room's candidates, best first, with just what the deck rules need (no `data`). */
export async function pool(q: Q, code: string): Promise<(PoolEntry & { deckPosition: number | null })[]> {
  const rows = await q
    .select({
      id: roomPlaces.placeId,
      addedBy: roomPlaces.addedBy,
      deckPosition: roomPlaces.deckPosition,
      priceFrom: places.priceFrom,
      priceTo: places.priceTo,
      currency: places.currency,
    })
    .from(roomPlaces)
    .innerJoin(places, eq(places.placeId, roomPlaces.placeId))
    .where(eq(roomPlaces.roomCode, code))
    .orderBy(asc(roomPlaces.position));
  return rows.map((r) => ({ id: r.id, addedBy: r.addedBy ?? undefined, priceRange: priceRangeOf(r), deckPosition: r.deckPosition }));
}

/** The deck dealt when voting started, in order. */
export async function deck(q: Q, code: string): Promise<string[]> {
  const rows = await q
    .select({ id: roomPlaces.placeId })
    .from(roomPlaces)
    .where(and(eq(roomPlaces.roomCode, code), isNotNull(roomPlaces.deckPosition)))
    .orderBy(asc(roomPlaces.deckPosition));
  return rows.map((r) => r.id);
}

/** Full cards for the places on screen. */
export async function cards(q: Q, code: string, ids: string[]): Promise<Record<string, Restaurant>> {
  if (ids.length === 0) return {};
  const rows = await q
    .select({ data: places.data, addedBy: roomPlaces.addedBy, priceFrom: places.priceFrom, priceTo: places.priceTo, currency: places.currency })
    .from(roomPlaces)
    .innerJoin(places, eq(places.placeId, roomPlaces.placeId))
    .where(and(eq(roomPlaces.roomCode, code), inArray(roomPlaces.placeId, ids)));
  return Object.fromEntries(rows.map((r) => [r.data.id, { ...r.data, priceRange: priceRangeOf(r), addedBy: r.addedBy ?? undefined }]));
}

/** Adds candidates after the current last one. Places already in the room are left as they are. */
export async function addToRoom(tx: Tx, code: string, ids: string[], addedBy?: string) {
  if (ids.length === 0) return;
  const [{ next }] = await tx
    .select({ next: sql<number>`coalesce(max(${roomPlaces.position}) + 1, 0)::int` })
    .from(roomPlaces)
    .where(eq(roomPlaces.roomCode, code));
  await tx
    .insert(roomPlaces)
    .values(ids.map((placeId, i) => ({ roomCode: code, placeId, position: next + i, addedBy })))
    .onConflictDoNothing();
}

export async function setAddedBy(tx: Tx, code: string, placeId: string, addedBy: string | null) {
  await tx.update(roomPlaces).set({ addedBy }).where(and(eq(roomPlaces.roomCode, code), eq(roomPlaces.placeId, placeId)));
}

export async function renameAddedBy(tx: Tx, code: string, from: string, to: string) {
  await tx.update(roomPlaces).set({ addedBy: to }).where(and(eq(roomPlaces.roomCode, code), eq(roomPlaces.addedBy, from)));
}

export async function removeFromRoom(tx: Tx, code: string, placeId: string) {
  await tx.delete(roomPlaces).where(and(eq(roomPlaces.roomCode, code), eq(roomPlaces.placeId, placeId)));
}

/** Drops the old search results; hand-picked places stay. */
export async function removeSearchResults(tx: Tx, code: string) {
  await tx.delete(roomPlaces).where(and(eq(roomPlaces.roomCode, code), isNull(roomPlaces.addedBy)));
}

/** Deals the deck in one statement: each id gets its index as deck_position, everything else none. */
export async function setDeck(tx: Tx, code: string, ids: string[]) {
  await tx
    .update(roomPlaces)
    .set({ deckPosition: sql`array_position(array[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::text[], ${roomPlaces.placeId}) - 1` })
    .where(eq(roomPlaces.roomCode, code));
}
