"use client";

import { AnimatePresence, animate, motion, useMotionValue, useTransform, type PanInfo } from "motion/react";
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Restaurant } from "@/lib/places";
import type { RoomView } from "@/lib/room";
import type { Vote } from "@/lib/scoring";
import { Ban, ChevronUp, Heart, Star, X } from "../../icons";
import { Avatar, Button, Kbd, Photo, type Act } from "../../ui";
import { Details, DetailsBody, Meta, Photos } from "./Details";

const THRESHOLD = 110;

export function SwipeDeck({ room, act }: { room: RoomView; act: Act }) {
  // Votes we've sent but the next poll may not reflect yet.
  const [sent, setSent] = useState<Record<string, Vote>>({});
  const voted = { ...room.myVotes, ...sent };
  const remaining = room.deck.filter((id) => !voted[id]);
  const vetoUsed = Object.values(voted).includes("veto");
  const top = room.restaurants[remaining[0]];
  const next = room.restaurants[remaining[1]];
  const cardRef = useRef<CardHandle>(null);
  const [open, setOpen] = useState(false);

  const vote = useCallback(
    (v: Vote) => {
      if (!top) return;
      setSent((s) => ({ ...s, [top.id]: v }));
      act("vote", { restaurantId: top.id, vote: v });
    },
    [top, act],
  );

  // Voting from the open details: slide the sheet away first, then fling the card.
  const voteFromDetails = useCallback((v: Vote) => {
    setOpen(false);
    setTimeout(() => cardRef.current?.fling(v), 250);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = ({ ArrowLeft: "nope", ArrowRight: "like", ArrowUp: "love" } as const)[e.key as string];
      if (v && open) voteFromDetails(v);
      else if (v) cardRef.current?.fling(v);
      if ((e.key === "v" || e.key === "V") && !vetoUsed) cardRef.current?.fling("veto");
      if (e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, voteFromDetails, vetoUsed]);

  if (!top) return <Waiting room={room} act={act} />;
  const position = room.deck.length - remaining.length;

  return (
    <div className="flex flex-1 flex-col gap-4 lg:grid lg:grid-cols-[200px_minmax(0,1fr)_340px] lg:items-start lg:gap-10">
      {/* Phone: one bar segment per place + who's done. Web: a rail with everyone's progress. */}
      <div className="flex items-center gap-3 lg:hidden">
        <div className="flex flex-1 gap-[3px]">
          {room.deck.map((id, i) => (
            <span key={id} className={`h-1 flex-1 rounded-full ${i < position ? "bg-lime" : i === position ? "bg-paper" : "bg-line"}`} />
          ))}
        </div>
        <div className="flex -space-x-2">
          {room.members.map((m) => (
            <span key={m.id} className="rounded-full ring-2 ring-night">
              <Avatar name={m.name} size="sm" dim={!m.done && m.id !== room.me?.id} />
            </span>
          ))}
        </div>
      </div>
      <ProgressRail room={room} position={position} />

      <div className="flex flex-1 flex-col gap-5">
        <div className="relative mx-auto h-[calc(100dvh-250px)] max-h-[600px] min-h-[380px] w-full lg:h-[calc(100dvh-230px)] lg:max-w-[440px]">
          {next && <CardFace key={next.id} r={next} className="scale-95 opacity-50" />}
          <SwipeCard key={top.id} ref={cardRef} r={top} onVote={vote} onOpen={() => setOpen(true)} />
        </div>
        <VoteButtons onVote={(v) => cardRef.current?.fling(v)} vetoUsed={vetoUsed} keys />
      </div>

      <aside key={top.id} className="hidden flex-col gap-4 lg:flex">
        {top.photos.length > 1 && (
          <div className="grid grid-cols-3 gap-1.5">
            {top.photos.slice(0, 3).map((src, i) => (
              <Photo key={src} src={src} className={`aspect-square w-full rounded-[14px] ${i ? "opacity-60" : "outline-2 outline-offset-2 outline-lime"}`} />
            ))}
          </div>
        )}
        <DetailsBody r={top} />
      </aside>

      <AnimatePresence>
        {open && <Details key={top.id} r={top} onClose={close} actions={<VoteButtons onVote={voteFromDetails} />} />}
      </AnimatePresence>
    </div>
  );
}

function ProgressRail({ room, position }: { room: RoomView; position: number }) {
  const total = room.deck.length;
  return (
    <aside className="hidden flex-col gap-6 lg:flex">
      <div className="flex flex-col gap-2">
        <span className="font-display text-5xl leading-none font-extrabold">
          {Math.min(position + 1, total)}
          <span className="text-faint">/{total}</span>
        </span>
        <Bar value={position / total} />
      </div>
      <ul className="flex flex-col gap-3">
        {room.members.map((m) => (
          <li key={m.id} className="flex items-center gap-2.5">
            <Avatar name={m.name} done={m.done} />
            <Bar value={m.swiped / total} done={m.done} light />
          </li>
        ))}
      </ul>
    </aside>
  );
}

function Bar({ value, done, light }: { value: number; done?: boolean; light?: boolean }) {
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
      <div className={`h-full rounded-full transition-all ${done || !light ? "bg-lime" : "bg-paper"}`} style={{ width: `${value * 100}%` }} />
    </div>
  );
}

type CardHandle = { fling: (v: Vote) => void };

function SwipeCard({
  r,
  onVote,
  onOpen,
  ref,
}: {
  r: Restaurant;
  onVote: (v: Vote) => void;
  onOpen: () => void;
  ref: React.Ref<CardHandle>;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-250, 250], [-18, 18]);
  const yum = useTransform(x, [30, THRESHOLD], [0, 1]);
  const nope = useTransform(x, [-THRESHOLD, -30], [1, 0]);
  const love = useTransform(y, [-THRESHOLD, -30], [1, 0]);
  const scale = useMotionValue(1);
  const gone = useRef(false);
  const dragged = useRef(false); // a drag ends with a click; it must not open details or flip photos

  const fling = useCallback(
    async (v: Vote) => {
      if (gone.current) return;
      gone.current = true;
      const opts = { duration: 0.3 };
      if (v === "like") await animate(x, 600, opts);
      if (v === "nope") await animate(x, -600, opts);
      if (v === "love") await animate(y, -900, opts);
      if (v === "veto") await animate(scale, 0, opts);
      onVote(v);
    },
    [x, y, scale, onVote],
  );

  // Buttons and arrow keys fling the card the same way a swipe does.
  useImperativeHandle(ref, () => ({ fling }), [fling]);

  function onDragEnd(_: unknown, info: PanInfo) {
    const { offset, velocity } = info;
    if (offset.x > THRESHOLD || velocity.x > 600) fling("like");
    else if (offset.x < -THRESHOLD || velocity.x < -600) fling("nope");
    else if (offset.y < -THRESHOLD || velocity.y < -600) fling("love");
    else {
      animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
      animate(y, 0, { type: "spring", stiffness: 400, damping: 30 });
    }
  }

  return (
    <motion.div
      className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
      style={{ x, y, rotate, scale }}
      drag
      dragSnapToOrigin={false}
      onPointerDown={() => (dragged.current = false)}
      onDragStart={() => (dragged.current = true)}
      onClickCapture={(e) => dragged.current && e.stopPropagation()}
      onDragEnd={onDragEnd}
      initial={{ scale: 0.95, opacity: 0.7 }}
      animate={{ scale: 1, opacity: 1 }}
    >
      <CardFace r={r} onOpen={onOpen}>
        <Stamp style={{ opacity: yum }} className="top-10 left-5 -rotate-12 border-lime text-lime">
          YUM
        </Stamp>
        <Stamp style={{ opacity: nope }} className="top-10 right-5 rotate-12 border-coral text-coral">
          NOPE
        </Stamp>
        <Stamp style={{ opacity: love }} className="bottom-40 left-1/2 -translate-x-1/2 border-gold text-gold">
          LOVE IT
        </Stamp>
      </CardFace>
    </motion.div>
  );
}

function Stamp({ className, children, style }: { className: string; children: string; style: object }) {
  return (
    <motion.span
      style={style}
      className={`pointer-events-none absolute z-10 rounded-xl border-4 px-3 font-display text-[44px] font-extrabold tracking-wider ${className}`}
    >
      {children}
    </motion.span>
  );
}

/** A place card. Tap the photo to flip photos; tap the name (or the arrow) to open the full details. */
export function CardFace({
  r,
  className = "",
  onOpen,
  children,
}: {
  r: Restaurant;
  className?: string;
  onOpen?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={`lift absolute inset-0 overflow-hidden rounded-[30px] bg-surface select-none ${className}`}>
      <Photos r={r} />
      <div
        onClick={onOpen}
        className={`absolute inset-x-0 bottom-0 flex items-end gap-3 bg-gradient-to-t from-night/95 from-35% to-transparent px-5 pt-24 pb-5 ${
          onOpen ? "cursor-pointer" : ""
        }`}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="font-display text-4xl leading-[0.95] font-extrabold tracking-tight">{r.name}</h2>
          <Meta r={r} className="text-[15px]" />
        </div>
        {onOpen && (
          <button aria-label={`More about ${r.name}`} className="grid size-11 shrink-0 place-items-center rounded-full bg-paper/20 backdrop-blur hover:bg-paper/30">
            <ChevronUp />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function VoteButtons({ onVote, vetoUsed, keys }: { onVote: (v: Vote) => void; vetoUsed?: boolean; keys?: boolean }) {
  const small = "size-12 border-2 border-line bg-surface";
  return (
    <div className="flex items-start justify-center gap-4">
      {vetoUsed !== undefined && (
        <RoundButton label={vetoUsed ? "Veto used" : "Veto for everyone, 1 left"} hint="V" keys={keys} onClick={() => onVote("veto")} disabled={vetoUsed} className={`${small} text-muted`}>
          <Ban />
          {!vetoUsed && <span className="absolute -top-1 -right-1 grid size-[18px] place-items-center rounded-full bg-paper text-[11px] font-bold text-night">1</span>}
        </RoundButton>
      )}
      <RoundButton label="Nope" hint="←" keys={keys} onClick={() => onVote("nope")} className="size-[68px] border-2 border-coral bg-surface text-coral">
        <X className="size-[30px]" />
      </RoundButton>
      <RoundButton label="Yum" hint="→" keys={keys} onClick={() => onVote("like")} className="glow size-[68px] bg-lime text-night">
        <Heart className="size-[30px]" />
      </RoundButton>
      <RoundButton label="Love it" hint="↑" keys={keys} onClick={() => onVote("love")} className={`${small} text-gold`}>
        <Star />
      </RoundButton>
    </div>
  );
}

function RoundButton({
  label,
  hint,
  keys,
  className,
  children,
  onClick,
  disabled,
}: {
  label: string;
  hint: string;
  keys?: boolean;
  className: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        aria-label={label}
        title={label}
        onClick={onClick}
        disabled={disabled}
        className={`relative grid place-items-center rounded-full transition hover:scale-105 active:scale-95 disabled:opacity-30 ${className}`}
      >
        {children}
      </button>
      {keys && (
        <span className="hidden lg:block">
          <Kbd>{hint}</Kbd>
        </span>
      )}
    </div>
  );
}

export function Waiting({ room, act }: { room: RoomView; act: Act }) {
  const left = room.members.filter((m) => !m.done).length;
  return (
    <div className="flex flex-1 flex-col gap-8 lg:mx-auto lg:w-full lg:max-w-lg lg:justify-center">
      <div className="flex flex-col items-center gap-4 pt-8 text-center">
        <span className="glow grid size-24 place-items-center rounded-full bg-lime text-night">
          <Heart className="size-11" />
        </span>
        <h1 className="font-display text-5xl font-extrabold tracking-tight">Done!</h1>
        <p className="text-muted">Waiting for {left === 1 ? "1 friend" : `${left} friends`}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {room.members.map((m) => (
          <li key={m.id} className="flex items-center gap-3">
            <Avatar name={m.name} done={m.done} />
            <Bar value={m.swiped / room.deck.length} done={m.done} light />
            <span className="w-12 text-right text-sm text-faint tabular-nums">
              {m.swiped}/{room.deck.length}
            </span>
          </li>
        ))}
      </ul>
      {room.isHost && left > 0 && (
        <Button variant="ghost" className="mt-auto w-full lg:mt-0" onClick={() => act("reveal")}>
          Reveal results now
        </Button>
      )}
    </div>
  );
}
