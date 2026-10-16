import { userIdOf } from "@/lib/auth";
import { findRestaurants } from "@/lib/places";
import { NEAR_YOU, parseArea, parseCraving, parseName } from "@/lib/input";
import { toView } from "@/lib/room";
import { createRoom } from "@/lib/rooms";
import { bad } from "./input";

export async function POST(req: Request) {
  const userId = await userIdOf(req);
  if (!userId) return bad("Please reload the page", 401);
  const body = await req.json().catch(() => null);
  const name = parseName(body?.name);
  const area = parseArea(body?.area);
  const craving = parseCraving(body?.craving);
  const lat = Number.isFinite(body?.lat) ? (body.lat as number) : undefined;
  const lng = Number.isFinite(body?.lng) ? (body.lng as number) : undefined;
  if (!name) return bad("Please enter your name");
  if (!area && lat === undefined) return bad("Tell us where you're eating");

  const found = await findRestaurants({ area, lat, lng, craving });
  if (craving && found.source === "sample" && process.env.GOOGLE_MAPS_API_KEY) return bad(`Couldn't find ${craving} around there`);
  const room = await createRoom({
    userId,
    name,
    limits: { maxSpend: null }, // the area's currency isn't known until the search is back; set it in the lobby
    area: area || NEAR_YOU,
    craving,
    source: found.source,
    center: found.center,
    pool: found.restaurants,
  });
  return Response.json({ notice: found.error, room: toView(room, userId) });
}
