import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { pgError, type Q, type Tx } from "../db/index.ts";
import { roomMembers, roomPlaces, votes } from "../db/schema.ts";
import type { Vote } from "../domain/scoring.ts";

export type Votes = Record<string, Record<string, Vote>>; // memberId -> placeId -> vote

/**
 * Records a vote for a place on the deck. Returns "off deck" when the place isn't on it, and "veto used"
 * when the database's one-veto-per-person index rejects a second veto.
 */
export async function cast(tx: Tx, code: string, userId: string, placeId: string, vote: Vote): Promise<"ok" | "off deck" | "veto used"> {
  try {
    const res = await tx.execute(sql`
      insert into ${votes} (room_code, user_id, place_id, vote)
      select ${code}, ${userId}, ${placeId}, ${vote}::vote
      where exists (
        select 1 from ${roomPlaces}
        where ${roomPlaces.roomCode} = ${code} and ${roomPlaces.placeId} = ${placeId} and ${roomPlaces.deckPosition} is not null
      )
      on conflict (room_code, user_id, place_id) do update set vote = excluded.vote
      returning place_id`);
    return res.rows.length ? "ok" : "off deck";
  } catch (e) {
    if (pgError(e).constraint === "votes_one_veto_idx") return "veto used";
    throw e;
  }
}

export async function all(q: Q, code: string): Promise<Votes> {
  const rows = await q.select().from(votes).where(eq(votes.roomCode, code));
  const out: Votes = {};
  for (const r of rows) (out[r.userId] ??= {})[r.placeId] = r.vote;
  return out;
}

/** True once every member has voted on every place on the deck. */
export async function everyoneDone(q: Q, code: string): Promise<boolean> {
  const [{ behind }] = await q
    .select({
      behind: sql<number>`count(*)::int`,
    })
    .from(roomMembers)
    .where(
      and(
        eq(roomMembers.roomCode, code),
        sql`(select count(*) from ${votes} where ${votes.roomCode} = ${code} and ${votes.userId} = ${roomMembers.userId})
          < (select count(*) from ${roomPlaces} where ${roomPlaces.roomCode} = ${code} and ${roomPlaces.deckPosition} is not null)`,
      ),
    );
  return behind === 0;
}

export async function clear(tx: Tx, code: string) {
  await tx.delete(votes).where(eq(votes.roomCode, code));
}
