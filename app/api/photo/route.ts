// Streams Google place photos through our server so the API key stays private.
const PHOTO_NAME = /^places\/[\w-]+\/photos\/[\w-]+$/;

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name") ?? "";
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!PHOTO_NAME.test(name) || !key) return new Response("Not found", { status: 404 });

  const res = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=800&key=${key}`);
  if (!res.ok || !res.body) return new Response("Photo unavailable", { status: 502 });
  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
