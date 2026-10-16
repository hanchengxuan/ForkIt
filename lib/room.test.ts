import { test } from "node:test";
import assert from "node:assert/strict";
import type { Restaurant } from "./places";
import { act, addTaps, newMember, renameMember, RoomError, settleTapWar, tapWarOver, toView, type Room } from "./room.ts";

const place = (id: string, from?: number): Restaurant => ({
  id,
  name: id.toUpperCase(),
  address: "",
  cuisine: "",
  photos: [],
  mapsUrl: "",
  priceRange: from === undefined ? undefined : { from, currency: "AUD" },
});

function lobby(...others: string[]): Room {
  return {
    code: "ABCD",
    hostId: "ann",
    area: "Newtown",
    source: "sample",
    status: "lobby",
    pool: [place("a", 20), place("b", 50), place("c")],
    deck: [],
    members: ["ann", ...others].map((id) => newMember(id, id, { maxSpend: null })),
    votes: {},
    ranked: [],
  };
}

function voting(...others: string[]): Room {
  const room = lobby(...others);
  act(room, "ann", "start", {});
  return room;
}

const rejects = (fn: () => void, message: string) => assert.throws(fn, (e) => e instanceof RoomError && e.message === message);

test("joining adds a seat; joining twice keeps one seat", () => {
  const room = lobby();
  act(room, "bo", "join", { name: "Bo", limits: { maxSpend: 40 } });
  act(room, "bo", "join", { name: "Bo again", limits: { maxSpend: 40 } });
  assert.deepEqual(
    room.members.map((m) => [m.id, m.name]),
    [["ann", "ann"], ["bo", "Bo"]],
  );
});

test("nobody joins once swiping starts, or past 12 people", () => {
  rejects(() => act(voting(), "bo", "join", { name: "Bo", limits: { maxSpend: null } }), "This group has already started swiping");
  const full = lobby(...Array.from({ length: 11 }, (_, i) => `m${i}`));
  rejects(() => act(full, "late", "join", { name: "Late", limits: { maxSpend: null } }), "This group is full");
});

test("strangers, guests and unknown actions are turned away", () => {
  const room = lobby("bo");
  rejects(() => act(room, "eve", "setLimits", { limits: { maxSpend: 10 } }), "You're not in this group");
  rejects(() => act(room, "bo", "start", {}), "Only the host can do that");
  rejects(() => act(room, "bo", "fly", {}), "Unknown action");
  rejects(() => act(room, "bo", "constructor", {}), "Unknown action");
  assert.equal(room.status, "lobby");
});

test("lobby-only actions stop once swiping starts", () => {
  const room = voting("bo");
  rejects(() => act(room, "bo", "setLimits", { limits: { maxSpend: 10 } }), "Swiping has already started");
  assert.deepEqual(room.members[1].limits, { maxSpend: null });
});

test("start deals the deck within the group's lowest budget; unpriced places stay", () => {
  const room = lobby("bo");
  act(room, "bo", "setLimits", { limits: { maxSpend: 30 } });
  act(room, "ann", "start", {});
  assert.equal(room.status, "voting");
  assert.deepEqual(room.deck, ["a", "c"]);
});

test("one veto per person; taking it back frees it", () => {
  const room = voting("bo");
  act(room, "ann", "vote", { restaurantId: "a", vote: "veto" });
  rejects(() => act(room, "ann", "vote", { restaurantId: "b", vote: "veto" }), "You already used your veto");
  act(room, "ann", "vote", { restaurantId: "a", vote: "like" });
  act(room, "ann", "vote", { restaurantId: "b", vote: "veto" });
  assert.deepEqual(room.votes.ann, { a: "like", b: "veto" });
});

test("votes for places off the deck, or made-up votes, are rejected", () => {
  const room = voting();
  rejects(() => act(room, "ann", "vote", { restaurantId: "zzz", vote: "like" }), "Invalid vote");
  rejects(() => act(room, "ann", "vote", { restaurantId: "a", vote: "superlike" }), "Invalid vote");
  rejects(() => act(room, "ann", "vote", { restaurantId: ["a"], vote: "like" }), "Invalid vote");
  assert.deepEqual(room.votes, {});
});

test("results arrive when the last person finishes, and votes show only then", () => {
  const room = voting("bo");
  for (const id of ["a", "b", "c"]) act(room, "ann", "vote", { restaurantId: id, vote: id === "b" ? "love" : "nope" });
  assert.equal(room.status, "voting");
  assert.deepEqual(toView(room, "bo").votes, {});
  for (const id of ["a", "b", "c"]) act(room, "bo", "vote", { restaurantId: id, vote: "like" });
  assert.equal(room.status, "results");
  assert.equal(room.winnerId, "b");
  assert.equal(toView(room, "bo").votes.ann.b, "love");
});

test("a tie starts a tap war that settles on the clock to the most taps", () => {
  const room = voting("bo");
  for (const id of ["a", "b", "c"]) act(room, "ann", "vote", { restaurantId: id, vote: id === "c" ? "nope" : "love" });
  act(room, "ann", "reveal", {});
  const t = room.tieBreak;
  assert.equal(t?.kind, "tapwar");
  if (t?.kind !== "tapwar") return;
  assert.deepEqual(t.candidates, ["a", "b"]);

  addTaps(room, "ann", { b: 5, c: 99 }, t.startAt);
  addTaps(room, "bo", { a: 3 }, t.startAt);
  assert.equal(tapWarOver(room, t.endsAt), false, "still in the grace window");
  settleTapWar(room, t.endsAt);
  assert.equal(room.winnerId, undefined);

  const late = t.endsAt + 5_000;
  assert.equal(tapWarOver(room, late), true);
  settleTapWar(room, late);
  assert.equal(room.winnerId, "b");
  assert.equal(tapWarOver(room, late), false, "settled once");
});

test("each person's taps are capped at 150", () => {
  const room = voting();
  room.tieBreak = { kind: "tapwar", candidates: ["a", "b"], startAt: 0, endsAt: 10, taps: {} };
  addTaps(room, "ann", { a: 100 }, 5);
  addTaps(room, "ann", { a: 100, b: 100 }, 5);
  assert.deepEqual(room.tieBreak.taps.ann, { a: 150, b: 0 });
});

test("adding a place uses the restaurant the route already looked up", () => {
  const room = lobby("bo");
  rejects(() => act(room, "bo", "addPlace", {}), "Pick a restaurant");
  act(room, "bo", "addPlace", {}, { picked: place("d", 999) });
  assert.equal(room.pool.find((r) => r.id === "d")?.addedBy, "bo");
  rejects(() => act(room, "ann", "addPlace", {}, { picked: place("d") }), "D is already on the list");
});

test("a new search keeps hand-picked places and resets budgets when the currency changes", () => {
  const room = lobby("bo");
  act(room, "bo", "addPlace", {}, { picked: place("d") });
  act(room, "bo", "setLimits", { limits: { maxSpend: 30 } });
  const yen = { ...place("x"), priceRange: { from: 2000, currency: "JPY" } };
  act(room, "ann", "setSearch", { area: "Tokyo" }, { found: { restaurants: [yen], source: "google" } });
  assert.deepEqual(room.pool.map((r) => r.id), ["x", "d"]);
  assert.equal(room.area, "Tokyo");
  assert.deepEqual(room.members[1].limits, { maxSpend: null });
});

test("restart clears the round but keeps the people", () => {
  const room = voting("bo");
  act(room, "ann", "vote", { restaurantId: "a", vote: "veto" });
  act(room, "ann", "restart", {});
  assert.equal(room.status, "lobby");
  assert.deepEqual(room.votes, {});
  assert.deepEqual(room.deck, []);
  assert.equal(room.members.length, 2);
  assert.equal(room.members[0].vetoUsed, false);
});

test("signing in moves a guest's seat, host role and votes to the real account", () => {
  const room = voting("guest");
  room.hostId = "guest";
  act(room, "guest", "vote", { restaurantId: "a", vote: "love" });
  renameMember(room, "guest", "real");
  assert.equal(room.hostId, "real");
  assert.deepEqual(room.votes, { real: { a: "love" } });
  assert.ok(room.members.some((m) => m.id === "real"));
});
