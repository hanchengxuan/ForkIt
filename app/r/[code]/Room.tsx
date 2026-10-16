"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomView } from "@/lib/room";
import { Pin } from "../../icons";
import { ensureSession } from "@/lib/auth-client";
import { Account, api, Button, CodeJoin, Logo, type Act } from "../../ui";
import { JoinForm, Lobby } from "./Lobby";
import { Results } from "./Results";
import { SwipeDeck, Waiting } from "./SwipeDeck";

const POLL_MS = 1500;
const FAST_POLL_MS = 400; // tap war bars should feel live

export default function Room({ code }: { code: string }) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const skew = useRef(0); // server clock minus ours, so countdowns match on every phone

  const receive = useCallback((r: RoomView) => {
    skew.current = r.now - Date.now();
    setRoom(r);
  }, []);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      let fast = false;
      try {
        await ensureSession();
        const r = await api<RoomView>(`/api/rooms/${code}`);
        receive(r);
        fast = r.tieBreak?.kind === "tapwar" && !r.winnerId;
      } catch (e) {
        if ((e as Error).message.startsWith("No group")) setNotFound(true);
      }
      if (!stop) timer = setTimeout(tick, fast ? FAST_POLL_MS : POLL_MS);
    };
    let timer = setTimeout(tick, 0);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [code, receive]);

  const act: Act = useCallback(
    async (action, extra) => {
      setError("");
      try {
        const res = await api(`/api/rooms/${code}`, { action, ...extra });
        receive(res.room);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [code, receive],
  );

  const serverNow = useCallback(() => Date.now() + skew.current, []);

  if (notFound)
    return (
      <Shell>
        <Notice title={`No group called ${code}`} body="Double-check the code with whoever invited you." />
      </Shell>
    );
  if (!room)
    return (
      <Shell>
        <p className="text-faint">Loading…</p>
      </Shell>
    );

  let screen: React.ReactNode;
  if (!room.me)
    screen =
      room.status === "lobby" ? (
        <JoinForm room={room} act={act} />
      ) : (
        <Notice title="This group already started swiping" body="Ask them to start a new round, or create your own group." />
      );
  else if (room.status === "lobby") screen = <Lobby room={room} act={act} />;
  else if (room.status === "voting")
    screen = room.me.done ? <Waiting room={room} act={act} /> : <SwipeDeck room={room} act={act} />;
  else screen = <Results room={room} act={act} serverNow={serverNow} />;

  return (
    <Shell area={room.area}>
      {screen}
      {error && (
        <p role="alert" className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md rounded-xl bg-paper px-4 py-3 text-center text-sm font-medium text-night">
          {error}
        </p>
      )}
    </Shell>
  );
}

function Shell({ area, children }: { area?: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 pt-5 pb-6 lg:max-w-6xl lg:px-10 lg:pt-7">
      <header className="flex items-center justify-between">
        <Logo className="text-2xl lg:text-3xl" />
        <span className="flex items-center gap-4">
          {area && (
            <span className="flex items-center gap-1.5 text-sm text-muted">
              <Pin className="size-4" />
              {area}
            </span>
          )}
          <span className="hidden lg:block">
            <CodeJoin inline />
          </span>
          <Account />
        </span>
      </header>
      {children}
    </main>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-3 text-center">
      <h1 className="font-display text-4xl font-extrabold">{title}</h1>
      <p className="text-muted">{body}</p>
      <Link href="/" className="mx-auto mt-4">
        <Button tabIndex={-1}>Back home</Button>
      </Link>
    </div>
  );
}
