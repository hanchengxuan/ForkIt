// Room actions against a real Postgres. Needs a throwaway database, e.g. the local Docker one:
//   TEST_DATABASE_URL=postgresql://postgres:forkit@localhost:5432/forkit_test npm test
// Skipped without it. It never reads DATABASE_URL, so it can't touch the app's database.
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import type { Restaurant } from "../google-places.ts";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; // must be set before the db module loads

const place = (id: string, from?: number, currency = "AUD"): Restaurant => ({
  id,
  name: id.toUpperCase(),
  address: "",
  cuisine: "",
  photos: [],
  mapsUrl: "",
  priceRange: from === undefined ? undefined : { from, currency },
});

describe("room actions (Postgres)", { skip: url ? false : "set TEST_DATABASE_URL to run" }, () => {
  let svc: typeof import("./actions.ts");
  let view: typeof import("./view.ts");
  let db: (typeof import("../db/index.ts"))["db"];

  before(async () => {
    db = (await import("../db/index.ts")).db;
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db, { migrationsFolder: "drizzle" });
    svc = await import("./actions.ts");
    view = await import("./view.ts");
  });
  beforeEach(() => db.execute(sql`truncate rooms, places cascade`));
  after(() => db.$client.end());

  const join = (code: string, id: string, maxSpend: number | null = null) => svc.act(code, id, "join", { name: id, limits: { maxSpend } });
  async function lobby(...others: string[]) {
    const code = await svc.createRoom({ userId: "ann", name: "ann", area: "Newtown", source: "sample", pool: [place("a", 20), place("b", 50), place("c")] });
    for (const id of others) await join(code, id);
    return code;
  }
  async function voting(...others: string[]) {
    const code = await lobby(...others);
    await svc.act(code, "ann", "start", {});
    return code;
  }
  const see = async (code: string, me = "ann") => (await view.loadView(code, me))!;
  const vote = (code: string, me: string, restaurantId: unknown, v: unknown) => svc.act(code, me, "vote", { restaurantId, vote: v });
  const rejects = (p: Promise<unknown>, message: string) => assert.rejects(p, (e) => e instanceof svc.RoomError && e.message === message);

  test("joining adds a seat; joining twice keeps one seat", async () => {
    const code = await lobby();
    await svc.act(code, "bo", "join", { name: "Bo", limits: { maxSpend: 40 } });
    await svc.act(code, "bo", "join", { name: "Bo again", limits: { maxSpend: 40 } });
    assert.deepEqual(
      (await see(code)).members.map((m) => [m.id, m.name]),
      [["ann", "ann"], ["bo", "Bo"]],
    );
  });

  test("nobody joins once swiping starts, or past 12 people", async () => {
    await rejects(join(await voting(), "bo"), "This group has already started swiping");
    const full = await lobby(...Array.from({ length: 11 }, (_, i) => `m${i}`));
    await rejects(join(full, "late"), "This group is full");
  });

  test("strangers, guests and unknown actions are turned away", async () => {
    const code = await lobby("bo");
    await rejects(svc.act(code, "eve", "setLimits", { limits: { maxSpend: 10 } }), "You're not in this group");
    await rejects(svc.act(code, "bo", "start", {}), "Only the host can do that");
    await rejects(svc.act(code, "bo", "fly", {}), "Unknown action");
    await rejects(svc.act(code, "bo", "constructor", {}), "Unknown action");
    await rejects(svc.act("ZZZZ", "bo", "start", {}), "Room not found");
    assert.equal((await see(code)).status, "lobby");
  });

  test("lobby-only actions stop once swiping starts", async () => {
    const code = await voting("bo");
    await rejects(svc.act(code, "bo", "setLimits", { limits: { maxSpend: 10 } }), "Swiping has already started");
    assert.deepEqual((await see(code)).members[1].limits, { maxSpend: null });
  });

  test("start deals the deck within the group's lowest budget; unpriced places stay", async () => {
    const code = await lobby("bo");
    await svc.act(code, "bo", "setLimits", { limits: { maxSpend: 30 } });
    await svc.act(code, "ann", "start", {});
    const v = await see(code);
    assert.equal(v.status, "voting");
    assert.deepEqual(v.deck, ["a", "c"]);
    assert.deepEqual(Object.keys(v.restaurants).sort(), ["a", "c"]);
  });

  test("picks only: the deck is just the hand-added places, budget or not", async () => {
    const code = await lobby("bo");
    await rejects(svc.act(code, "bo", "setPicksOnly", { on: true }), "Only the host can do that");
    await svc.act(code, "ann", "setPicksOnly", { on: true });
    await rejects(svc.act(code, "ann", "start", {}), "Add a restaurant first");
    await svc.act(code, "bo", "addPlace", {}, { picked: place("d", 999) });
    await svc.act(code, "bo", "setLimits", { limits: { maxSpend: 30 } });
    assert.deepEqual((await see(code, "bo")).deck, ["d"]);
    await svc.act(code, "ann", "setPicksOnly", { on: false });
    assert.deepEqual((await see(code, "bo")).deck, ["d", "a", "c"]);
    await svc.act(code, "ann", "setPicksOnly", { on: true });
    await svc.act(code, "ann", "start", {});
    assert.deepEqual((await see(code)).deck, ["d"]);
  });

  test("one veto per person, kept by the database; taking it back frees it", async () => {
    const code = await voting("bo");
    await vote(code, "ann", "a", "veto");
    await rejects(vote(code, "ann", "b", "veto"), "You already used your veto");
    await vote(code, "ann", "a", "like");
    await vote(code, "ann", "b", "veto");
    const v = await see(code);
    assert.deepEqual(v.myVotes, { a: "like", b: "veto" });
    assert.equal(v.me?.vetoUsed, true);
  });

  test("votes for places off the deck, or made-up votes, are rejected", async () => {
    const code = await lobby("bo");
    await svc.act(code, "bo", "setLimits", { limits: { maxSpend: 30 } });
    await svc.act(code, "ann", "start", {});
    await rejects(vote(code, "ann", "zzz", "like"), "Invalid vote");
    await rejects(vote(code, "ann", "b", "like"), "Invalid vote"); // in the room, but over budget so not dealt
    await rejects(vote(code, "ann", "a", "superlike"), "Invalid vote");
    await rejects(vote(code, "ann", ["a"], "like"), "Invalid vote");
    assert.deepEqual((await see(code)).myVotes, {});
  });

  test("results arrive when the last person finishes, and votes show only then", async () => {
    const code = await voting("bo");
    for (const id of ["a", "b", "c"]) await vote(code, "ann", id, id === "b" ? "love" : "nope");
    let v = await see(code, "bo");
    assert.equal(v.status, "voting");
    assert.deepEqual(v.votes, {});
    assert.equal(v.members[0].done, true);
    for (const id of ["a", "b", "c"]) await vote(code, "bo", id, "like");
    v = await see(code, "bo");
    assert.equal(v.status, "results");
    assert.equal(v.winnerId, "b");
    assert.equal(v.votes.ann.b, "love");
    assert.equal(v.ranked[0].id, "b");
  });

  test("two phones voting at the same moment both count", async () => {
    const code = await voting("bo");
    await Promise.all([vote(code, "ann", "a", "love"), vote(code, "bo", "a", "like"), vote(code, "ann", "b", "nope")]);
    const v = await see(code);
    assert.deepEqual(
      v.members.map((m) => m.swiped),
      [2, 1],
    );
  });

  test("a tie starts a tap war that settles on the clock to the most taps", async () => {
    const code = await voting("bo");
    for (const id of ["a", "b", "c"]) await vote(code, "ann", id, id === "c" ? "nope" : "love");
    await svc.act(code, "ann", "reveal", {});
    let t = (await see(code)).tieBreak;
    assert.equal(t?.kind, "tapwar");
    if (t?.kind !== "tapwar") return;
    assert.deepEqual(t.candidates, ["a", "b"]);

    await svc.act(code, "ann", "tap", { counts: { b: 5 } }); // still counting down: dropped
    const now = Date.now();
    await db.execute(sql`update rooms set tie_starts_at = ${now - 1_000}, tie_ends_at = ${now + 9_000} where code = ${code}`);
    await svc.act(code, "ann", "tap", { counts: { b: 100, c: 99 } });
    await svc.act(code, "ann", "tap", { counts: { b: 100 } }); // over the 150 cap
    await svc.act(code, "bo", "tap", { counts: { a: 3 } });
    t = (await see(code, "bo")).tieBreak;
    assert.deepEqual(t?.kind === "tapwar" && [t.totals, t.mine], [{ a: 3, b: 150 }, { a: 3 }]);

    await svc.settleTapWar(code); // clock still running
    assert.equal((await see(code)).winnerId, undefined);
    await db.execute(sql`update rooms set tie_ends_at = ${now - 5_000} where code = ${code}`);
    await Promise.all([svc.settleTapWar(code), svc.settleTapWar(code)]); // two phones' polls at once
    const v = await see(code);
    assert.equal(v.winnerId, "b");
    assert.equal(v.tieBreak?.kind, "tapwar", "remembered as won by the tap war");
    await rejects(svc.act(code, "ann", "tap", { counts: { a: 1 } }), "The tap war is over");
  });

  test("a tap war nobody taps goes to the wheel, which the server has already decided", async () => {
    const code = await voting();
    for (const id of ["a", "b", "c"]) await vote(code, "ann", id, id === "c" ? "nope" : "love");
    await db.execute(sql`update rooms set tie_ends_at = ${Date.now() - 5_000} where code = ${code}`);
    await svc.settleTapWar(code);
    const v = await see(code);
    assert.equal(v.tieBreak?.kind, "roulette");
    assert.ok(v.tieBreak?.kind === "roulette" && v.tieBreak.afterTapWar);
    assert.ok(["a", "b"].includes(v.winnerId!));
  });

  test("adding a place caches its details and marks who picked it", async () => {
    const code = await lobby("bo");
    await rejects(svc.act(code, "bo", "addPlace", {}), "Pick a restaurant");
    await svc.act(code, "bo", "addPlace", {}, { picked: { ...place("d", 999), name: "Dumpling Bar" } });
    const v = await see(code, "bo");
    assert.equal(v.restaurants.d.addedBy, "bo");
    assert.equal(v.restaurants.d.name, "Dumpling Bar");
    assert.deepEqual(v.restaurants.d.priceRange, { from: 999, to: undefined, currency: "AUD" });
    await rejects(svc.act(code, "ann", "addPlace", {}, { picked: place("d") }), "D is already on the list");
  });

  test("a new search keeps hand-picked places and resets budgets when the currency changes", async () => {
    const code = await lobby("bo");
    await svc.act(code, "bo", "addPlace", {}, { picked: place("d") });
    await svc.act(code, "bo", "setLimits", { limits: { maxSpend: 30 } });
    await svc.act(code, "ann", "setSearch", { area: "Tokyo" }, { found: { restaurants: [place("x", 2000, "JPY")], source: "google" } });
    const v = await see(code);
    assert.deepEqual(v.deck, ["d", "x"]);
    assert.equal(v.area, "Tokyo");
    assert.equal(v.currency, "JPY");
    assert.deepEqual(v.members[1].limits, { maxSpend: null });
  });

  test("restart clears the round but keeps the people and places", async () => {
    const code = await voting("bo");
    await vote(code, "ann", "a", "veto");
    await svc.act(code, "ann", "restart", {});
    const v = await see(code);
    assert.equal(v.status, "lobby");
    assert.deepEqual(v.myVotes, {});
    assert.equal(v.me?.vetoUsed, false);
    assert.equal(v.members.length, 2);
    assert.deepEqual(v.deck, ["a", "b", "c"]);
  });

  test("signing in moves a guest's seat, host role, picks and votes to the real account", async () => {
    const code = await svc.createRoom({ userId: "guest", name: "G", area: "Newtown", source: "sample", pool: [place("a")] });
    await svc.act(code, "guest", "addPlace", {}, { picked: place("d") });
    await svc.act(code, "guest", "start", {});
    await vote(code, "guest", "a", "love");
    await svc.moveMember("guest", "real");
    const v = await see(code, "real");
    assert.equal(v.isHost, true);
    assert.deepEqual(v.myVotes, { a: "love" });
    assert.equal(v.restaurants.d.addedBy, "real");
    assert.deepEqual(
      v.members.map((m) => m.id),
      ["real"],
    );
  });

  test("every write bumps the version, so a poll holding the old one gets the new room", async () => {
    const code = await lobby();
    const before = (await view.roomMeta(code))!.version;
    await join(code, "bo");
    const after = (await view.roomMeta(code))!.version;
    assert.equal(after, before + 1);
    assert.equal((await see(code)).etag, view.etagOf(after, "ann"));
    await rejects(svc.act(code, "bo", "start", {}), "Only the host can do that");
    assert.equal((await view.roomMeta(code))!.version, after, "a refused action changes nothing");
  });

  test("creating a room sweeps week-old rooms and the cached places only they used", async () => {
    const old = await svc.createRoom({ userId: "ann", name: "ann", area: "", source: "sample", pool: [place("old"), place("shared")] });
    await db.execute(sql`update rooms set created_at = now() - interval '8 days' where code = ${old}`);
    await svc.createRoom({ userId: "bo", name: "bo", area: "", source: "sample", pool: [place("shared")] });
    assert.equal(await view.roomInfo(old), undefined);
    const left = await db.execute(sql`select place_id from places order by place_id`);
    assert.deepEqual(
      left.rows.map((r) => r.place_id),
      ["shared"],
    );
  });
});
