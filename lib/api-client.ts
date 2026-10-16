import type { ActionName, RoomView } from "./room";

export type Act = (action: ActionName, extra?: object) => Promise<void>;

export async function api<T = { room: RoomView; notice?: string }>(
  url: string,
  body?: object,
): Promise<T> {
  const res = await fetch(url, body ? { method: "POST", body: JSON.stringify(body) } : { cache: "no-store" });
  const json = await res.json().catch(() => ({ error: "Something went wrong" }));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong");
  return json;
}
