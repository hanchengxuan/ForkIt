"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomView } from "@/lib/rooms";
import type { Vote } from "@/lib/scoring";
import { Ban, ChevronUp, Crown, Hand, Heart, Refresh, Send, Star, X } from "../../icons";
import { Avatar, Button, Kbd, Photo, type Act } from "../../ui";
import { Details, Meta } from "./Details";

type Props = { room: RoomView; act: Act; serverNow: () => number };

export function Results(props: Props) {
  const { room } = props;
  const t = room.tieBreak;
  const [spun, setSpun] = useState(false);
  const onSpun = useCallback(() => setSpun(true), []);

  if (room.noMatch) return <NoMatch {...props} />;
  if (t?.kind === "tapwar" && !room.winnerId) return <TapWar {...props} />;
  if (t?.kind === "roulette" && !spun) return <Wheel {...props} onDone={onSpun} />;
  return <Winner {...props} />;
}

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

function TapWar({ room, act, serverNow }: Props) {
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

const SPIN_MS = 5000;
const WHEEL_COLORS = ["#c8f03c", "#ff5c4d", "#8fb8ff", "#ffc93c", "#f29ad8", "#7ee0c3"];

function Wheel({ room, serverNow, onDone }: Props & { onDone: () => void }) {
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

function Winner({ room, act }: Props) {
  const r = room.restaurants[room.winnerId!];
  const row = room.ranked.find((x) => x.id === r.id);
  const badge =
    room.tieBreak?.kind === "roulette" ? "Chosen by the wheel" : room.tieBreak?.kind === "tapwar" ? "Won the tap war" : "Tonight's pick";
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  // Tie-break winner goes first, the rest stay in score order.
  const podium = [...room.ranked]
    .filter((x) => x.vetoedBy.length === 0)
    .sort((a, b) => Number(b.id === room.winnerId) - Number(a.id === room.winnerId))
    .slice(0, 3);

  return (
    <div className="flex flex-1 flex-col gap-6 lg:flex-row lg:gap-8">
      <Confetti />
      <button
        onClick={() => setOpen(true)}
        aria-label={`More about ${r.name}`}
        className="relative -mx-5 -mt-5 h-[460px] shrink-0 overflow-hidden text-left lg:mx-0 lg:mt-0 lg:h-auto lg:min-h-[640px] lg:flex-[1.4] lg:rounded-[36px]"
      >
        <Photo src={r.photos[0]} className="absolute inset-0 size-full" />
        <span className="absolute inset-0 bg-gradient-to-t from-night from-[8%] via-night/10 via-60% to-night/40" />
        <ConfettiBits />
        <span className="absolute inset-x-5 bottom-5 flex flex-col gap-3 lg:inset-x-9 lg:bottom-9">
          <span className="flex items-center gap-1.5 self-start rounded-full bg-lime px-3 py-1.5 text-[13px] font-bold text-night">
            <Crown className="size-3.5" />
            {badge}
          </span>
          <span className="font-display text-5xl leading-[0.9] font-extrabold tracking-tight lg:text-[104px]">{r.name}</span>
          <span className="flex flex-wrap items-center gap-4 text-sm font-bold lg:text-base">
            {row && (
              <>
                <Stat icon={<Heart className="size-4 text-lime" />} label={`${row.likes + row.loves} of ${room.members.length} said yes`}>
                  {row.likes + row.loves}/{room.members.length}
                </Stat>
                <Stat icon={<Star className="size-4 text-gold" />} label={`${row.loves} loved it`}>
                  {row.loves}
                </Stat>
                <Stat icon={<X className="size-4 text-coral" />} label={`${row.nopes} said nope`}>
                  {row.nopes}
                </Stat>
              </>
            )}
            <Meta r={r} className="text-muted" />
            <ChevronUp className="ml-auto size-5 text-muted" />
          </span>
        </span>
      </button>

      <div className="flex flex-1 flex-col gap-5">
        <Podium room={room} ids={podium.map((p) => p.id)} />
        <VoteBars room={room} />
        <div className="mt-auto flex gap-2.5">
          {room.isHost && (
            <Button variant="ghost" aria-label="Swipe again with the same group" title="Swipe again" className="w-14 shrink-0 px-0" onClick={() => act("restart")}>
              <Refresh />
            </Button>
          )}
          <a href={r.mapsUrl} target="_blank" rel="noreferrer" className="glow flex h-14 flex-1 items-center justify-center gap-2.5 rounded-2xl bg-lime text-[17px] font-bold text-night">
            <Send /> Let&apos;s go
          </a>
        </div>
      </div>
      <AnimatePresence>{open && <Details r={r} onClose={close} />}</AnimatePresence>
    </div>
  );
}

function Stat({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5" aria-label={label}>
      {icon}
      {children}
    </span>
  );
}

/** 2 · 1 · 3, like a sports podium. */
function Podium({ room, ids }: { room: RoomView; ids: string[] }) {
  const order = [ids[1], ids[0], ids[2]];
  const heights = ["h-14 lg:h-24", "h-20 lg:h-36", "h-10 lg:h-16"];
  const place = [2, 1, 3];
  return (
    <div className="grid grid-cols-3 items-end gap-2 lg:rounded-[30px] lg:bg-surface lg:px-6 lg:pt-7">
      {order.map((id, i) =>
        id ? (
          <div key={id} className="flex min-w-0 flex-col items-center gap-1.5">
            <Photo src={room.restaurants[id].photos[0]} className={`rounded-full ${place[i] === 1 ? "size-16 border-[3px] border-lime lg:size-20" : "size-12 border-2 border-line lg:size-16"}`} />
            <span className="w-full truncate text-center text-xs font-bold lg:text-sm">{room.restaurants[id].name}</span>
            <span
              className={`grid w-full place-items-center rounded-t-xl font-display font-extrabold ${heights[i]} ${
                place[i] === 1 ? "bg-lime text-3xl text-night lg:text-4xl" : "bg-surface text-2xl text-muted lg:bg-line"
              }`}
            >
              {place[i]}
            </span>
          </div>
        ) : (
          <div key={i} />
        ),
      )}
    </div>
  );
}

const VOTE_BAR: Record<Vote, string> = { love: "bg-gold", like: "bg-lime", nope: "bg-line", veto: "bg-coral" };
const VOTE_LABEL: Record<Vote, string> = { love: "Love", like: "Yum", nope: "Nope", veto: "Veto" };

/** How each person swiped, as one stacked bar each. */
function VoteBars({ room }: { room: RoomView }) {
  const order: Vote[] = ["love", "like", "nope", "veto"];
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-surface p-4 lg:p-5" aria-label="How everyone voted">
      {room.members.map((m) => {
        const mine = Object.values(room.votes[m.id] ?? {});
        const count = (v: Vote) => mine.filter((x) => x === v).length;
        return (
          <div key={m.id} className="flex items-center gap-3">
            <Avatar name={m.name} size="sm" />
            <div className="flex flex-1 gap-1" title={order.map((v) => `${VOTE_LABEL[v]} ${count(v)}`).join(" · ")}>
              {order.map((v) =>
                count(v) ? <span key={v} className={`h-2.5 rounded-full ${VOTE_BAR[v]}`} style={{ flex: count(v) }} /> : null,
              )}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3 pl-9 text-xs text-muted">
        {order.map((v) => (
          <span key={v} className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${VOTE_BAR[v]}`} />
            {VOTE_LABEL[v]}
          </span>
        ))}
      </div>
    </section>
  );
}

function NoMatch({ room, act }: Props) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <span className="grid size-24 place-items-center rounded-full bg-coral text-night">
        <Ban className="size-12" />
      </span>
      <h1 className="font-display text-5xl font-extrabold tracking-tight">All vetoed.</h1>
      <p className="text-muted">Tough crowd. Try again with a new round.</p>
      {room.isHost ? (
        <Button className="mt-4 w-full max-w-xs" onClick={() => act("restart")}>
          <Refresh /> Swipe again
        </Button>
      ) : (
        <p className="mt-4 text-faint">Waiting for the host…</p>
      )}
    </div>
  );
}

const CONFETTI_COLORS = ["bg-lime", "bg-coral", "bg-gold", "bg-sky", "bg-paper"];

/** Static confetti on the winner photo. */
function ConfettiBits() {
  const bits = [
    [8, 12, 25, "h-6 w-3"], [24, 6, 0, "size-3"], [80, 9, -30, "h-7 w-3.5"], [90, 24, 0, "size-3"],
    [16, 30, -12, "h-5 w-2.5"], [66, 18, 40, "h-5 w-2.5"], [48, 34, 0, "size-2.5"],
  ] as const;
  return (
    <span aria-hidden>
      {bits.map(([x, y, rot, size], i) => (
        <span
          key={i}
          className={`absolute rounded-[3px] ${size} ${CONFETTI_COLORS[i % CONFETTI_COLORS.length]} ${size.startsWith("size") ? "rounded-full" : ""}`}
          style={{ left: `${x}%`, top: `${y}%`, transform: `rotate(${rot}deg)` }}
        />
      ))}
    </span>
  );
}

/** A one-off burst of falling confetti when the winner appears. */
function Confetti() {
  const [bits] = useState(() =>
    Array.from({ length: 28 }, (_, i) => ({
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      spin: (Math.random() - 0.5) * 720,
      round: i % 3 === 0,
    })),
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden" aria-hidden>
      {bits.map((b, i) => (
        <motion.span
          key={i}
          className={`absolute -top-6 ${b.color} ${b.round ? "size-3 rounded-full" : "h-5 w-2.5 rounded-[3px]"}`}
          style={{ left: `${b.left}%` }}
          animate={{ y: "110vh", rotate: b.spin, opacity: [1, 1, 0] }}
          transition={{ duration: 2.6, delay: b.delay, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}
