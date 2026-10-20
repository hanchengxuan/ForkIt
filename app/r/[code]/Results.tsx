"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import type { RoomView } from "@/lib/service/view";
import type { Vote } from "@/lib/domain/scoring";
import { Ban, ChevronUp, Crown, Heart, Refresh, Send, Star, X } from "../../icons";
import type { Act } from "@/lib/api-client";
import { Avatar, Button, Photo } from "../../ui";
import { Details, Meta } from "./Details";
import { TapWar } from "./TapWar";
import { Wheel } from "./Wheel";

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
