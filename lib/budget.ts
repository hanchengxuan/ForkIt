// Budget rules. No server imports, so the browser uses the same rules as the server.

/** Google's typical spend per person. `to` is missing for open-ended ranges like "A$100+". */
export type PriceRange = { from: number; to?: number; currency: string };

/** Most a person wants to spend, in the room's currency. null = no limit. */
export type Limits = { maxSpend: number | null };

/** The group's budget is its lowest budget. */
export function groupBudget(all: Limits[]): number | null {
  const set = all.map((l) => l.maxSpend).filter((m): m is number => m != null);
  return set.length ? Math.min(...set) : null;
}

/** You can eat there within budget if its cheapest typical spend fits. Unknown prices and hand-picked places stay in. */
export function fits(r: { priceRange?: PriceRange; addedBy?: string }, max: number | null): boolean {
  return max === null || !!r.addedBy || !r.priceRange || r.priceRange.from <= max;
}

/** The area's currency: the one most of its places are priced in. */
export function mainCurrency(ranges: PriceRange[]): string | undefined {
  const count = new Map<string, number>();
  for (const r of ranges) count.set(r.currency, (count.get(r.currency) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Slider range for this area: from its cheapest typical spend to its priciest. */
export function budgetRange(ranges: PriceRange[], currency: string): { min: number; max: number } | null {
  const all = ranges.filter((r) => r.currency === currency).flatMap((r) => [r.from, r.to ?? r.from]).filter((n) => n > 0);
  return all.length ? { min: Math.min(...all), max: Math.max(...all) } : null;
}

export function money(n: number, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

/** "A$20–40", or "A$100+" when Google gives no upper end. */
export function priceLabel(r: PriceRange): string {
  return r.to ? `${money(r.from, r.currency)}–${r.to.toLocaleString("en")}` : `${money(r.from, r.currency)}+`;
}
