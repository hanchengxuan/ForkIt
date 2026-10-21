import assert from "node:assert/strict";
import { test } from "node:test";
import { budgetRange, fits, groupBudget, mainCurrency, priceLabel } from "./budget.ts";

const aud = (from: number, to?: number) => ({ from, to, currency: "AUD" });

test("group budget is the lowest one set; nobody set means no limit", () => {
  assert.equal(groupBudget([{ maxSpend: 60 }, { maxSpend: null }, { maxSpend: 40 }]), 40);
  assert.equal(groupBudget([{ maxSpend: null }, { maxSpend: null }]), null);
});

test("a place fits when its cheapest typical spend is within budget", () => {
  assert.equal(fits({ priceRange: aud(40, 60) }, 40), true);
  assert.equal(fits({ priceRange: aud(80, 200) }, 60), false);
  assert.equal(fits({ priceRange: aud(100) }, 60), false);
  assert.equal(fits({ priceRange: aud(80, 200) }, null), true, "no limit");
  assert.equal(fits({}, 20), true, "unknown price stays in");
  assert.equal(fits({ priceRange: aud(80, 200), addedBy: "m1" }, 20), true, "hand-picked stays in");
});

test("slider range spans the area's prices, in its main currency", () => {
  const ranges = [aud(20, 40), aud(40, 60), aud(80, 200), aud(1, 20), { from: 2000, to: 30000, currency: "JPY" }];
  assert.equal(mainCurrency(ranges), "AUD");
  assert.deepEqual(budgetRange(ranges, "AUD"), { min: 1, max: 200 });
  assert.deepEqual(budgetRange([aud(100)], "AUD"), { min: 100, max: 100 });
  assert.equal(budgetRange([], "AUD"), null);
  assert.equal(mainCurrency([]), undefined);
});

test("price labels", () => {
  assert.equal(priceLabel(aud(20, 40)), "A$20–40");
  assert.equal(priceLabel(aud(100)), "A$100+");
  assert.equal(priceLabel({ from: 2000, to: 3000, currency: "JPY" }), "¥2,000–3,000");
});
