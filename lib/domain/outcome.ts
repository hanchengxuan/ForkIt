// Pure rules for how a round ends: winner, tap war, or wheel. No database, so `node --test` runs them directly.
import { randomInt } from "node:crypto";
import type { Outcome } from "./scoring.ts";

const TAP_COUNTDOWN_MS = 3_000; // "3, 2, 1" so nobody gets a head start
const TAP_MS = 10_000;
const TAP_GRACE_MS = 1_000; // taps still in flight when the clock hits zero
const MAX_TAPS = 150; // shortcut: flat per-person cap (15 taps/sec) stops scripts, not fast thumbs
const SPIN_DELAY_MS = 1_500; // gives every phone time to poll before the wheel starts

/** What the room stores once results are out; one shape per way a round can end. */
export type Result =
  | { outcome: "winner"; winnerId: string }
  | { outcome: "none" }
  | { outcome: "tapwar"; candidates: string[]; tieStartsAt: number; tieEndsAt: number }
  | { outcome: "roulette"; candidates: string[]; winnerId: string; tieStartsAt: number; afterTapWar: boolean };

/** Turns a scoring outcome into what to store. The wheel is decided here, so every phone lands on the same place. */
export function settle(o: Outcome, afterTapWar: boolean, now = Date.now()): Result {
  if (o.kind === "winner") return { outcome: "winner", winnerId: o.id };
  if (o.kind === "none") return { outcome: "none" };
  if (o.kind === "tapwar") {
    const tieStartsAt = now + TAP_COUNTDOWN_MS;
    return { outcome: "tapwar", candidates: o.candidates, tieStartsAt, tieEndsAt: tieStartsAt + TAP_MS };
  }
  const winnerId = o.candidates[randomInt(o.candidates.length)];
  return { outcome: "roulette", candidates: o.candidates, winnerId, tieStartsAt: now + SPIN_DELAY_MS, afterTapWar };
}

/** Taps arriving before the start or after the grace window don't count. */
export const inTapWindow = (startsAt: number, endsAt: number, now = Date.now()) => now >= startsAt && now <= endsAt + TAP_GRACE_MS;

/** The tap war ends on the clock, so the first read after this settles it and no timers are needed. */
export const tapClockOut = (endsAt: number, now = Date.now()) => now >= endsAt + TAP_GRACE_MS;

/** Which taps in a phone's batch count: candidates only, whole positive numbers, up to the per-person cap. */
export function acceptTaps(candidates: string[], alreadyTapped: number, counts: Record<string, unknown>): Record<string, number> {
  const accepted: Record<string, number> = {};
  let total = alreadyTapped;
  for (const [id, n] of Object.entries(counts)) {
    if (!candidates.includes(id) || !Number.isInteger(n) || (n as number) <= 0) continue;
    const add = Math.min(n as number, MAX_TAPS - total);
    if (add <= 0) break;
    accepted[id] = (accepted[id] ?? 0) + add;
    total += add;
  }
  return accepted;
}
