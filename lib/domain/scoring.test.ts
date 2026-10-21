import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, rank, resolveTapWar } from "./scoring.ts";

const deck = ["a", "b", "c"];

test("clear winner", () => {
  const ranked = rank(deck, { ann: { a: "love", b: "like" }, bo: { a: "like", b: "nope" } });
  assert.deepEqual(ranked.map((r) => [r.id, r.score]), [["a", 3], ["b", 1], ["c", 0]]);
  assert.deepEqual(decide(ranked), { kind: "winner", id: "a" });
});

test("a veto removes a place even if it scores highest", () => {
  const ranked = rank(deck, { ann: { a: "love", b: "like" }, bo: { a: "veto", b: "like" } });
  assert.equal(ranked.at(-1)!.id, "a");
  assert.deepEqual(ranked.at(-1)!.vetoedBy, ["bo"]);
  assert.deepEqual(decide(ranked), { kind: "winner", id: "b" });
});

test("a tie for first goes to a tap war", () => {
  const ranked = rank(deck, { ann: { a: "love", b: "like" }, bo: { a: "nope", b: "like" } });
  assert.deepEqual(decide(ranked), { kind: "tapwar", candidates: ["a", "b"] });
});

test("nobody liked anything spins the wheel over non-vetoed places", () => {
  const ranked = rank(deck, { ann: { a: "nope", b: "nope", c: "veto" } });
  assert.deepEqual(decide(ranked), { kind: "roulette", candidates: ["a", "b"] });
});

test("the only place left standing wins, even with no likes", () => {
  assert.deepEqual(decide(rank(["a", "b"], { ann: { a: "nope", b: "veto" } })), { kind: "winner", id: "a" });
});

test("everything vetoed means no result", () => {
  assert.deepEqual(decide(rank(["a"], { ann: { a: "veto" } })), { kind: "none" });
});

test("most taps wins, a tap tie or no taps spins the wheel", () => {
  assert.deepEqual(resolveTapWar(["a", "b"], { ann: { a: 30, b: 2 }, bo: { b: 20 } }), { kind: "winner", id: "a" });
  assert.deepEqual(resolveTapWar(["a", "b", "c"], { ann: { a: 5 }, bo: { b: 5, c: 1 } }), {
    kind: "roulette",
    candidates: ["a", "b"],
  });
  assert.deepEqual(resolveTapWar(["a", "b"], {}), { kind: "roulette", candidates: ["a", "b"] });
});

test("taps on places outside the tie are ignored", () => {
  assert.deepEqual(resolveTapWar(["a", "b"], { ann: { zzz: 99, b: 1 } }), { kind: "winner", id: "b" });
});

test("every tied place enters the tap war, not just the first few", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const ranked = rank(ids, { ann: Object.fromEntries(ids.map((id) => [id, "like" as const])) });
  assert.deepEqual(decide(ranked), { kind: "tapwar", candidates: ids });
});
