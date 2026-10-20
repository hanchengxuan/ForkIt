"use client";

import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Act } from "@/lib/api-client";
import type { RoomView } from "@/lib/service/view";
import { Crown, Hand } from "../../icons";
import { Kbd, Photo } from "../../ui";

function useServerNow(serverNow: () => number, everyMs: number) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), everyMs);
    return () => clearInterval(id);
  }, [serverNow, everyMs]);
  return now;
}

const FLUSH_MS = 250;

const TILE_FILLS = ["bg-coral/80", "bg-sky/80", "bg-gold/85", "bg-[#f29ad8]/80", "bg-[#7ee0c3]/80"];

export function TapWar({ room, act, serverNow }: { room: RoomView; act: Act; serverNow: () => number }) {
  const t = room.tieBreak as Extract<RoomView["tieBreak"], { kind: "tapwar" }>;
  const now = useServerNow(serverNow, 100);
  const phase = now < t.startAt ? "ready" : now < t.endsAt ? "go" : "counting";
  // My taps are counted locally and shown instantly; the server only gets batches.
  const [myTaps, setMyTaps] = useState<Record<string, number>>({});
  const tapsRef = useRef<Record<string, number>>({});
  const sentRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const id = setInterval(() => {
      const delta: Record<string, number> = {};
      for (const [c, n] of Object.entries(tapsRef.current)) if (n > (sentRef.current[c] ?? 0)) delta[c] = n - (sentRef.current[c] ?? 0);
      if (Object.keys(delta).length === 0) return;
      sentRef.current = { ...tapsRef.current };
      act("tap", { counts: delta });
    }, FLUSH_MS);
    return () => clearInterval(id);
  }, [act]);

  const tap = useCallback(
    (id: string) => {
      if (phase !== "go") return;
      tapsRef.current = { ...tapsRef.current, [id]: (tapsRef.current[id] ?? 0) + 1 };
      setMyTaps(tapsRef.current);
    },
    [phase],
  );

  // Web: number keys tap the matching tile.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const id = t.candidates[Number(e.key) - 1];
      if (id && !e.repeat) tap(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [t.candidates, tap]);

  // Everyone else's taps from the server, plus my own live count.
  const score = (id: string) => t.totals[id] - (t.mine[id] ?? 0) + (myTaps[id] ?? 0);
  const best = Math.max(1, ...t.candidates.map(score));
  const mineTotal = Object.values(myTaps).reduce((a, b) => a + b, 0);
  const left = Math.max(0, (phase === "ready" ? t.startAt : t.endsAt) - now);
  const secs = Math.ceil(left / 1000);

  return (
    <div className="flex flex-1 flex-col gap-5 select-none lg:gap-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold tracking-[0.15em] text-coral lg:text-sm">IT&apos;S A {t.candidates.length}-WAY TIE</span>
          <h1 className="font-display text-[40px] leading-none font-extrabold tracking-tight lg:text-8xl">Tap war</h1>
        </div>
        <div className="flex items-center gap-5">
          <span className="hidden items-center gap-2 text-sm text-muted lg:flex">
            Click or press <Kbd>1</Kbd>–<Kbd>{Math.min(t.candidates.length, 9)}</Kbd>
          </span>
          <Ring value={phase === "go" ? left / 10_000 : phase === "ready" ? 1 : 0} label={phase === "go" ? String(secs) : phase === "ready" ? "" : "0"} />
        </div>
      </div>

      <div
        className={`relative grid flex-1 auto-rows-fr gap-2.5 lg:gap-4 ${
          t.candidates.length > 1 ? "grid-cols-2" : "grid-cols-1"
        } lg:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]`}
      >
        {t.candidates.map((id, i) => {
          const r = room.restaurants[id];
          const n = score(id);
          const leading = n > 0 && n === best;
          return (
            <motion.button
              key={id}
              onPointerDown={() => tap(id)}
              whileTap={phase === "go" ? { scale: 0.95 } : undefined}
              disabled={phase !== "go"}
              aria-label={`Tap for ${r.name}`}
              className={`relative min-h-36 touch-manipulation overflow-hidden rounded-[26px] text-left lg:min-h-[420px] lg:rounded-[30px] ${
                leading ? "border-[3px] border-lime text-night lg:border-4" : "text-paper"
              }`}
            >
              <Photo src={r.photos[0]} className={`absolute inset-0 size-full ${leading ? "" : "brightness-[0.55]"}`} />
              <span
                className={`absolute inset-x-0 bottom-0 transition-[height] duration-150 ${leading ? "bg-lime/85" : TILE_FILLS[i % TILE_FILLS.length]}`}
                style={{ height: `${(n / best) * 100}%` }}
              />
              <span className="absolute inset-0 flex flex-col justify-between p-3.5 lg:p-5">
                <span className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm leading-tight font-bold lg:text-base">
                    {leading && <Crown className="size-4 shrink-0" />}
                    <span className="line-clamp-2">{r.name}</span>
                  </span>
                  {i < 9 && (
                    <span className="hidden lg:block">
                      <Kbd>{i + 1}</Kbd>
                    </span>
                  )}
                </span>
                <motion.span key={n} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className="origin-bottom-left font-display text-6xl leading-[0.85] font-extrabold tabular-nums lg:text-[104px]">
                  {n}
                </motion.span>
              </span>
            </motion.button>
          );
        })}

        {phase !== "go" && (
          <div className="absolute inset-0 grid place-items-center rounded-[26px] bg-night/70 backdrop-blur-sm">
            {phase === "ready" ? (
              <motion.span key={secs} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-display text-[140px] font-extrabold text-lime">
                {secs}
              </motion.span>
            ) : (
              <span className="font-display text-4xl font-extrabold">Counting…</span>
            )}
          </div>
        )}
      </div>

      <p className="flex items-center justify-center gap-2 text-sm text-muted">
        <Hand className="size-[18px]" />
        {mineTotal ? `You tapped ${mineTotal}×` : "Tap fast. Most taps wins."}
      </p>
    </div>
  );
}

function Ring({ value, label }: { value: number; label: string }) {
  const c = 2 * Math.PI * 34;
  return (
    <span className="relative grid size-[78px] shrink-0 place-items-center lg:size-[110px]">
      <svg viewBox="0 0 78 78" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="39" cy="39" r="34" fill="none" stroke="var(--color-line)" strokeWidth="7" />
        <circle cx="39" cy="39" r="34" fill="none" stroke="var(--color-lime)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${value * c} ${c}`} className="transition-[stroke-dasharray] duration-100" />
      </svg>
      <span className="font-display text-3xl font-extrabold tabular-nums lg:text-[44px]">{label}</span>
    </span>
  );
}
