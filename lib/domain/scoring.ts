// Pure scoring rules. No imports so `node --test` can run the tests directly.

export const VOTES = ["nope", "like", "love", "veto"] as const;
export type Vote = (typeof VOTES)[number];

const POINTS: Record<Exclude<Vote, "veto">, number> = { nope: 0, like: 1, love: 2 };

export type Ranked = {
  id: string;
  score: number;
  loves: number;
  likes: number;
  nopes: number;
  vetoedBy: string[];
};

export type Outcome =
  | { kind: "winner"; id: string }
  | { kind: "tapwar"; candidates: string[] }
  | { kind: "roulette"; candidates: string[] }
  | { kind: "none" };

/** votes: memberId -> restaurantId -> vote. Vetoed places sink to the bottom. */
export function rank(deck: string[], votes: Record<string, Record<string, Vote>>): Ranked[] {
  const rows = deck.map((id) => {
    const r: Ranked = { id, score: 0, loves: 0, likes: 0, nopes: 0, vetoedBy: [] };
    for (const [memberId, byPlace] of Object.entries(votes)) {
      const v = byPlace[id];
      if (!v) continue;
      if (v === "veto") r.vetoedBy.push(memberId);
      else {
        r.score += POINTS[v];
        if (v === "love") r.loves++;
        if (v === "like") r.likes++;
        if (v === "nope") r.nopes++;
      }
    }
    return r;
  });
  // Equal scores keep deck order here; ties are settled by decide(), not silently.
  return rows.sort(
    (a, b) => Number(a.vetoedBy.length > 0) - Number(b.vetoedBy.length > 0) || b.score - a.score,
  );
}

const MAX_WHEEL = 8;

export function decide(ranked: Ranked[]): Outcome {
  const alive = ranked.filter((r) => r.vetoedBy.length === 0);
  if (alive.length === 0) return { kind: "none" };
  if (alive.length === 1) return { kind: "winner", id: alive[0].id };
  const top = alive[0].score;
  // Nobody liked anything: let fate choose among the places nobody vetoed.
  if (top === 0) return { kind: "roulette", candidates: alive.slice(0, MAX_WHEEL).map((r) => r.id) };
  const tied = alive.filter((r) => r.score === top);
  if (tied.length === 1) return { kind: "winner", id: tied[0].id };
  return { kind: "tapwar", candidates: tied.map((r) => r.id) };
}

/** taps: memberId -> candidate -> tap count. Most taps wins; a tie (or no taps at all) goes to the wheel. */
export function resolveTapWar(candidates: string[], taps: Record<string, Record<string, number>>): Outcome {
  const counts = tapTotals(candidates, taps);
  const max = Math.max(...Object.values(counts));
  const leaders = candidates.filter((c) => counts[c] === max);
  return leaders.length === 1 ? { kind: "winner", id: leaders[0] } : { kind: "roulette", candidates: leaders };
}

export function tapTotals(candidates: string[], taps: Record<string, Record<string, number>>): Record<string, number> {
  const totals = Object.fromEntries(candidates.map((c) => [c, 0]));
  for (const byPlace of Object.values(taps)) for (const c of candidates) totals[c] += byPlace[c] ?? 0;
  return totals;
}
