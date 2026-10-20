import { userIdOf } from "@/lib/auth";
import { findRestaurants } from "@/lib/google-places";
import { NEAR_YOU, parseArea, parseCraving, parseName } from "@/lib/domain/input";
import { createRoom } from "@/lib/service/actions";
import { loadView } from "@/lib/service/view";
import { bad } from "@/lib/http";

export async function POST(req: Request) {
  const userId = await userIdOf(req);
  if (!userId) return bad("Please reload the page", 401);
  const body = await req.json().catch(() => null);
  const name = parseName(body?.name);
  if (!name) return bad("Please enter your name");
  // The group brings its own list, so there's nowhere to search yet
  if (body?.picksOnly === true) {
    const code = await createRoom({
      userId,
      name,
      area: "",
      source: process.env.GOOGLE_MAPS_API_KEY ? "google" : "sample",
      pool: [],
      picksOnly: true,
    });
    return Response.json({ room: await loadView(code, userId) });
  }

  const area = parseArea(body?.area);
  const craving = parseCraving(body?.craving);
  const lat = Number.isFinite(body?.lat) ? (body.lat as number) : undefined;
  const lng = Number.isFinite(body?.lng) ? (body.lng as number) : undefined;
  if (!area && lat === undefined) return bad("Tell us where you're eating");

  const found = await findRestaurants({ area, lat, lng, craving });
  if (craving && found.source === "sample" && process.env.GOOGLE_MAPS_API_KEY) return bad(`Couldn't find ${craving} around there`);
  const code = await createRoom({
    userId,
    name,
    area: area || NEAR_YOU,
    craving,
    source: found.source,
    center: found.center,
    pool: found.restaurants,
  });
  return Response.json({ notice: found.error, room: await loadView(code, userId) });
}
