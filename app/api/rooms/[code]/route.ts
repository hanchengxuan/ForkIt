import { userIdOf } from "@/lib/auth";
import { findRestaurants, placeDetails, type Restaurant } from "@/lib/google-places";
import { NEAR_YOU, parseArea, parseCraving } from "@/lib/domain/input";
import { tapClockOut } from "@/lib/domain/outcome";
import { act, RoomError, settleTapWar, type Found } from "@/lib/service/actions";
import { etagOf, loadView, roomInfo, roomMeta } from "@/lib/service/view";
import { bad } from "@/lib/http";

export async function GET(req: Request, ctx: RouteContext<"/api/rooms/[code]">) {
  const code = (await ctx.params).code.toUpperCase();
  const me = await userIdOf(req);
  const meta = await roomMeta(code);
  if (!meta) return bad("No group with that code", 404);
  // Only lock and write once the clock has run out; tap war polls come in every 0.4s from every phone
  if (meta.outcome === "tapwar" && !meta.winnerId && meta.tieEndsAt !== null && tapClockOut(meta.tieEndsAt)) await settleTapWar(code);
  // Nothing changed since this phone's copy: skip loading the room. `now` still goes out for the clock skew
  else if (new URL(req.url).searchParams.get("v") === etagOf(meta.version, me)) return Response.json({ unchanged: true, now: Date.now() });
  const view = await loadView(code, me);
  return view ? Response.json(view) : bad("No group with that code", 404);
}

export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]">) {
  const code = (await ctx.params).code.toUpperCase();
  const body = await req.json().catch(() => null);
  if (!body || typeof body.action !== "string") return bad("Missing action");

  const memberId = await userIdOf(req);
  if (!memberId) return bad("Please reload the page", 401);

  // Google calls happen before the room lock, so a slow search never holds up other phones
  let found: Found | undefined;
  let picked: Restaurant | undefined;
  if (body.action === "setSearch") {
    const area = parseArea(body.area);
    if (!area) return bad("Tell us where you're eating");
    const current = await roomInfo(code);
    if (current?.hostId !== memberId) return bad("Only the host can do that");
    const craving = parseCraving(body.craving);
    // "Near you" rooms were searched by coordinates, so search there again
    const near = area === NEAR_YOU && current.area === NEAR_YOU && current.centerLat !== null && current.centerLng !== null;
    const result = await findRestaurants(near ? { lat: current.centerLat!, lng: current.centerLng!, craving } : { area, craving });
    if (result.source === "sample" && result.error !== "GOOGLE_MAPS_API_KEY is not set")
      return bad(`Couldn't find ${craving || "restaurants"} around ${area}`);
    found = result;
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
    await act(code, memberId, body.action, body, { found, picked });
    return Response.json({ room: await loadView(code, memberId) });
  } catch (e) {
    if (e instanceof RoomError) return bad(e.message, e.message === "Room not found" ? 404 : 400);
    throw e;
  }
}
