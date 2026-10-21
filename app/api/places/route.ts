import { userIdOf } from "@/lib/auth";
import { suggest } from "@/lib/google-places";
import { roomInfo } from "@/lib/service/view";
import { bad } from "@/lib/http";

/** Typeahead: ?q=newt&kind=area, or ?q=sushi&kind=restaurant&code=ABCD to favour places near that room. */
export async function GET(req: Request) {
  // Every search costs money on our Google key, so only people using the app (guests included) can call it
  if (!(await userIdOf(req))) return bad("Please reload the page", 401);
  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 80);
  const kind = params.get("kind") === "restaurant" ? "restaurant" : "area";
  if (q.length < 2) return Response.json([]);
  const code = params.get("code");
  const room = code ? await roomInfo(code.toUpperCase()) : undefined;
  const near = room?.centerLat != null && room.centerLng != null ? { latitude: room.centerLat, longitude: room.centerLng } : undefined;
  try {
    return Response.json(await suggest(q, kind, near));
  } catch (e) {
    console.error("Autocomplete failed:", e);
    return Response.json([]);
  }
}
