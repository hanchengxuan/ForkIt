"use client";

import { useEffect, useState } from "react";
import type { RoomView } from "@/lib/room";

const SPIN_MS = 5000;
const WHEEL_COLORS = ["#c8f03c", "#ff5c4d", "#8fb8ff", "#ffc93c", "#f29ad8", "#7ee0c3"];

export function Wheel({ room, serverNow, onDone }: { room: RoomView; serverNow: () => number; onDone: () => void }) {
  const t = room.tieBreak as Extract<RoomView["tieBreak"], { kind: "roulette" }>;
  const n = t.candidates.length;
  const seg = 360 / n;
  const target = t.candidates.indexOf(room.winnerId!);
  const finalAngle = 360 * 6 - (target * seg + seg / 2);
  // Phones that open the page after the spin skip straight to the result.
  const [phase, setPhase] = useState<"wait" | "spin" | "done">(() =>
    serverNow() > t.startAt + SPIN_MS ? "done" : "wait",
  );

  useEffect(() => {
    if (phase === "done") {
      const id = setTimeout(onDone, 1200);
      return () => clearTimeout(id);
    }
    // Timed from the server's start time, so re-renders from polling don't push the finish back.
    const delay = (phase === "wait" ? t.startAt : t.startAt + SPIN_MS) - serverNow();
    const id = setTimeout(() => setPhase(phase === "wait" ? "spin" : "done"), Math.max(0, delay));
    return () => clearTimeout(id);
  }, [phase, t.startAt, serverNow, onDone]);

  const point = (deg: number, r = 100) => {
    const rad = (deg * Math.PI) / 180;
    return `${Math.sin(rad) * r} ${-Math.cos(rad) * r}`;
  };

  return (
    <div className="flex flex-1 flex-col items-center gap-6 text-center">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-bold tracking-[0.15em] text-coral">{t.afterTapWar ? "STILL TIED" : "NOBODY SAID YES"}</span>
        <h1 className="font-display text-[40px] leading-none font-extrabold tracking-tight lg:text-7xl">Wheel of fate</h1>
      </div>

      <div className="relative aspect-square w-full max-w-[340px] lg:max-w-[460px]">
        <svg viewBox="0 0 24 24" className="absolute -top-2 left-1/2 z-10 size-10 -translate-x-1/2 text-paper drop-shadow" aria-hidden>
          <path d="M4 4h16L12 20z" fill="currentColor" />
        </svg>
        <svg
          viewBox="-104 -104 208 208"
          className="size-full"
          style={{
            transform: `rotate(${phase === "wait" ? 0 : finalAngle}deg)`,
            transition: phase === "spin" ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.8, 0.18, 1)` : "none",
          }}
          role="img"
          aria-label={`Wheel with ${t.candidates.map((id) => room.restaurants[id].name).join(", ")}`}
        >
          <circle r="103" fill="var(--color-surface)" />
          {t.candidates.map((id, i) => {
            const a0 = i * seg;
            const mid = a0 + seg / 2;
            const name = room.restaurants[id].name;
            return (
              <g key={id}>
                <path d={`M0 0 L${point(a0)} A100 100 0 ${seg > 180 ? 1 : 0} 1 ${point(a0 + seg)} Z`} fill={WHEEL_COLORS[i % WHEEL_COLORS.length]} stroke="var(--color-night)" strokeWidth="2" />
                <text transform={`rotate(${mid - 90}) translate(58 0)`} textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="700" fill="#121014">
                  {name.length > 16 ? `${name.slice(0, 15)}…` : name}
                </text>
              </g>
            );
          })}
          <circle r="14" fill="var(--color-night)" stroke="var(--color-paper)" strokeWidth="3" />
        </svg>
      </div>
      <p className="h-10 font-display text-3xl font-extrabold text-lime">
        {phase === "done" && room.restaurants[room.winnerId!].name}
      </p>
    </div>
  );
}
