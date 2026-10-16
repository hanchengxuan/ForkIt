import { userIdOf } from "@/lib/auth";
import { findRestaurants, placeDetails, type Restaurant } from "@/lib/places";
import {
  addTaps,
  currencyOf,
  finishVoting,
  buildDeck,
  getRoom,
  newMember,
  restart,
  RoomError,
  settleTapWar,
  toView,
  updateRoom,
  type Room,
} from "@/lib/rooms";
import { VOTES, type Vote } from "@/lib/scoring";
import { bad, NEAR_YOU, parseArea, parseCraving, parseGroupName, parseLimits, parseName } from "../input";

export async function GET(req: Request, ctx: RouteContext<"/api/rooms/[code]">) {
  const { code } = await ctx.params;
  const me = await userIdOf(req);
  let room = await getRoom(code.toUpperCase());
  if (!room) return bad("No group with that code", 404);
  if (room.tieBreak?.kind === "tapwar" && !room.winnerId) room = await updateRoom(room.code, settleTapWar);
  return Response.json(toView(room, me));
}

export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]">) {
  const { code } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.action !== "string") return bad("Missing action");

  const memberId = await userIdOf(req);
  if (!memberId) return bad("Please reload the page", 401);

  // Google calls happen before the row lock, so a slow search never holds up other phones
  let found: Awaited<ReturnType<typeof findRestaurants>> | undefined;
  let picked: Restaurant | undefined;
  if (body.action === "setSearch") {
    const area = parseArea(body.area);
    if (!area) return bad("Tell us where you're eating");
    const current = await getRoom(code.toUpperCase());
    if (current?.hostId !== memberId) return bad("Only the host can do that");
    const craving = parseCraving(body.craving);
    // "Near you" rooms were searched by coordinates, so search there again
    const near = area === NEAR_YOU && current.area === NEAR_YOU && current.center;
    found = await findRestaurants(near ? { lat: near.latitude, lng: near.longitude, craving } : { area, craving });
    if (found.source === "sample" && found.error !== "GOOGLE_MAPS_API_KEY is not set")
      return bad(`Couldn't find ${craving || "restaurants"} around ${area}`);
  }
  if (body.action === "addPlace") {
    if (typeof body.placeId !== "string" || !body.placeId) return bad("Pick a restaurant");
    picked = await placeDetails(body.placeId).catch((e) => {
      console.error("Place details failed:", e);
      return undefined;
    });
    if (!picked) return bad("Couldn't load that restaurant");
  }

  try {
    const room = await updateRoom(code.toUpperCase(), (room) => {
      if (body.action === "join") return join(room, memberId, body);
      const me = room.members.find((m) => m.id === memberId);
      if (!me) throw new RoomError("You're not in this group");
      const host = () => {
        if (me.id !== room.hostId) throw new RoomError("Only the host can do that");
      };
      const lobby = () => {
        if (room.status !== "lobby") throw new RoomError("Swiping has already started");
      };

      switch (body.action) {
        case "start": {
          host();
          if (room.status !== "lobby") throw new RoomError("Already started");
          room.deck = buildDeck(room).map((r) => r.id);
          if (room.deck.length === 0) throw new RoomError("No places fit everyone's budget");
          room.status = "voting";
          break;
        }
        case "vote": {
          if (room.status !== "voting") throw new RoomError("Voting is closed");
          const vote = body.vote as Vote;
          if (!VOTES.includes(vote) || !room.deck.includes(body.restaurantId)) throw new RoomError("Invalid vote");
          const mine = (room.votes[me.id] ??= {});
          if (vote === "veto") {
            if (me.vetoUsed && mine[body.restaurantId] !== "veto") throw new RoomError("You already used your veto");
            me.vetoUsed = true;
          } else if (mine[body.restaurantId] === "veto") me.vetoUsed = false;
          mine[body.restaurantId] = vote;
          if (Object.keys(mine).length === room.deck.length) me.done = true;
          if (room.members.every((m) => m.done)) finishVoting(room);
          break;
        }
        case "reveal": {
          host();
          if (room.status !== "voting") throw new RoomError("Voting is closed");
          finishVoting(room);
          break;
        }
        case "tap": {
          if (typeof body.counts !== "object" || !body.counts) throw new RoomError("Invalid taps");
          addTaps(room, me.id, body.counts);
          break;
        }
        case "rename": {
          host();
          const name = parseGroupName(body.name);
          if (!name) throw new RoomError("Give the group a name");
          room.name = name;
          break;
        }
        case "setLimits": {
          lobby();
          const limits = parseLimits(body.limits);
          if (!limits) throw new RoomError("Pick a budget");
          me.limits = limits;
          break;
        }
        case "setSearch": {
          host();
          lobby();
          // Hand-picked places stay; the nearby list is swapped for the new area's
          const kept = room.pool.filter((r) => r.addedBy);
          const was = currencyOf(room.pool);
          room.pool = [...found!.restaurants.filter((r) => !kept.some((k) => k.id === r.id)), ...kept];
          // A budget of 40 means nothing once AUD becomes JPY; everyone picks again
          if (currencyOf(room.pool) !== was) for (const m of room.members) m.limits = { maxSpend: null };
          room.area = parseArea(body.area);
          room.craving = parseCraving(body.craving);
          room.source = found!.source;
          room.center = found!.center;
          break;
        }
        case "addPlace": {
          lobby();
          const existing = room.pool.find((r) => r.id === picked!.id);
          if (existing?.addedBy) throw new RoomError(`${existing.name} is already on the list`);
          if (existing) existing.addedBy = me.id; // was hidden by the budget; asking for it by name brings it back
          else if (room.pool.filter((r) => r.addedBy).length >= MAX_PICKED) throw new RoomError("That's plenty of picks");
          else room.pool.push({ ...picked!, addedBy: me.id });
          break;
        }
        case "removePlace": {
          lobby();
          room.pool = room.pool.filter((r) => r.id !== body.restaurantId);
          break;
        }
        case "restart": {
          host();
          restart(room);
          break;
        }
        default:
          throw new RoomError("Unknown action");
      }
    });
    return Response.json({ room: toView(room, memberId) });
  } catch (e) {
    if (e instanceof RoomError) return bad(e.message, e.message === "Room not found" ? 404 : 400);
    throw e;
  }
}

const MAX_PICKED = 20;

function join(room: Room, id: string, body: { name?: unknown; limits?: unknown }) {
  if (room.members.some((m) => m.id === id)) return;
  if (room.status !== "lobby") throw new RoomError("This group has already started swiping");
  const name = parseName(body.name);
  const limits = parseLimits(body.limits);
  if (!name || !limits) throw new RoomError("Please enter your name");
  if (room.members.length >= 12) throw new RoomError("This group is full");
  room.members.push(newMember(id, name, limits));
}
