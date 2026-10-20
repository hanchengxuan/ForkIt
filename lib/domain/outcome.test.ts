import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptTaps, inTapWindow, settle, tapClockOut } from "./outcome.ts";

test("a clear winner, no match, a tap war with a countdown, or a wheel the server decides", () => {
  assert.deepEqual(settle({ kind: "winner", id: "a" }, false), { outcome: "winner", winnerId: "a" });
  assert.deepEqual(settle({ kind: "none" }, false), { outcome: "none" });
  assert.deepEqual(settle({ kind: "tapwar", candidates: ["a", "b"] }, false, 1_000), {
    outcome: "tapwar",
    candidates: ["a", "b"],
    tieStartsAt: 4_000,
    tieEndsAt: 14_000,
  });
  const wheel = settle({ kind: "roulette", candidates: ["a", "b"] }, true, 1_000);
  assert.equal(wheel.outcome, "roulette");
  if (wheel.outcome !== "roulette") return;
  assert.ok(wheel.candidates.includes(wheel.winnerId));
  assert.equal(wheel.afterTapWar, true);
});

test("taps count from the start until a one-second grace after the end", () => {
  assert.equal(inTapWindow(100, 200, 99), false);
  assert.equal(inTapWindow(100, 200, 1_200), true);
  assert.equal(inTapWindow(100, 200, 1_201), false);
  assert.equal(tapClockOut(200, 1_199), false, "still in the grace window");
  assert.equal(tapClockOut(200, 1_200), true);
});

test("only candidates and whole positive counts are accepted, up to 150 per person", () => {
  assert.deepEqual(acceptTaps(["a", "b"], 0, { a: 3, c: 99, b: -1, x: "7" }), { a: 3 });
  assert.deepEqual(acceptTaps(["a", "b"], 0, { a: 1.5 }), {});
  assert.deepEqual(acceptTaps(["a", "b"], 100, { a: 100, b: 100 }), { a: 50 });
  assert.deepEqual(acceptTaps(["a", "b"], 150, { a: 1 }), {});
});
