import { userIdOf } from "@/lib/auth";
import { findRestaurants, placeDetails, type Restaurant } from "@/lib/places";
import { NEAR_YOU, parseArea, parseCraving } from "@/lib/input";
import { act, RoomError, settleTapWar, tapWarOver, toView } from "@/lib/room";
import { getRoom, updateRoom } from "@/lib/rooms";
import { bad } from "@/lib/http";

export async function GET(req: Request, ctx: RouteContext<"/api/rooms/[code]">) {
  const { code } = await ctx.params;
  const me = await userIdOf(req);
  let room = await getRoom(code.toUpperCase());
  if (!room) return bad("No group with that code", 404);
  // Only lock and write once the clock has run out; tap war polls come in every 0.4s from every phone
  if (tapWarOver(room)) room = await updateRoom(room.code, settleTapWar);
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
    const room = await updateRoom(code.toUpperCase(), (room) => act(room, memberId, body.action, body, { found, picked }));
    return Response.json({ room: toView(room, memberId) });
  } catch (e) {
    if (e instanceof RoomError) return bad(e.message, e.message === "Room not found" ? 404 : 400);
    throw e;
  }
}
