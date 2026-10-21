// Pure deck rules. No database or Google, so `node --test` can run them directly.
import { fits, groupBudget, mainCurrency, type Limits, type PriceRange } from "./budget.ts";

/** One candidate in a room: only what the deck rules need. Names and photos live in the places table. */
export type PoolEntry = { id: string; priceRange?: PriceRange; addedBy?: string };

const DECK_SIZE = 20;

/** What the group will swipe: every hand-picked place, plus (unless picks only) the search's best 20 within the group's budget. */
export function buildDeck(pool: PoolEntry[], budgets: Limits[], picksOnly: boolean): string[] {
  const picked = pool.filter((r) => r.addedBy).map((r) => r.id);
  if (picksOnly) return picked;
  const max = groupBudget(budgets);
  const best = pool.filter((r) => !r.addedBy && fits(r, max)).slice(0, DECK_SIZE);
  return [...picked, ...best.map((r) => r.id)];
}

/** Budgets are amounts in the area's currency, e.g. AUD. */
export function currencyOf(pool: PoolEntry[]): string {
  return mainCurrency(pool.flatMap((r) => (r.priceRange ? [r.priceRange] : []))) ?? "USD";
}
