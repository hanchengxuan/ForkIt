import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeck, currencyOf, type PoolEntry } from "./deck.ts";

const aud = (id: string, from?: number, addedBy?: string): PoolEntry => ({
  id,
  priceRange: from === undefined ? undefined : { from, currency: "AUD" },
  addedBy,
});
const pool = [aud("a", 20), aud("b", 50), aud("c")];

test("the deck keeps places within the group's lowest budget; unpriced places stay", () => {
  assert.deepEqual(buildDeck(pool, [{ maxSpend: null }, { maxSpend: 30 }], false), ["a", "c"]);
  assert.deepEqual(buildDeck(pool, [{ maxSpend: null }], false), ["a", "b", "c"]);
});

test("hand-picked places come first and ignore the budget; picks only drops the search", () => {
  const withPick = [...pool, aud("d", 999, "bo")];
  assert.deepEqual(buildDeck(withPick, [{ maxSpend: 30 }], false), ["d", "a", "c"]);
  assert.deepEqual(buildDeck(withPick, [{ maxSpend: 30 }], true), ["d"]);
  assert.deepEqual(buildDeck(pool, [], true), []);
});

test("the search part of the deck stops at 20", () => {
  const many = Array.from({ length: 30 }, (_, i) => aud(`p${i}`));
  assert.equal(buildDeck(many, [], false).length, 20);
});

test("the room's currency is the one most places are priced in", () => {
  assert.equal(currencyOf([...pool, { id: "x", priceRange: { from: 9, currency: "JPY" } }]), "AUD");
  assert.equal(currencyOf([]), "USD");
});
