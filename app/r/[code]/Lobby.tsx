"use client";

import { useRef, useState } from "react";
import { priceLabel, type Limits } from "@/lib/budget";
import type { RoomView } from "@/lib/room";
import { Arrow, Check, Copy, Fork, Pencil, Pin, Plus, Search, Share, User, X } from "../../icons";
import type { Act } from "@/lib/api-client";
import { Avatar, budgetLabel, Button, Field, LimitsPicker, Photo, Suggest, useAccountName } from "../../ui";

export function JoinForm({ room, act }: { room: RoomView; act: Act }) {
  const accountName = useAccountName();
  const [name, setName] = useState("");
  const [limits, setLimits] = useState<Limits>({ maxSpend: null });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        act("join", { name: name || accountName, limits });
      }}
      className="flex flex-1 flex-col gap-6 lg:mx-auto lg:w-full lg:max-w-md lg:justify-center"
    >
      <div className="flex flex-col gap-3">
        <div className="flex -space-x-3">
          {room.members.slice(0, 5).map((m) => (
            <span key={m.id} className="rounded-full ring-4 ring-night">
              <Avatar name={m.name} size="lg" />
            </span>
          ))}
        </div>
        <h1 className="font-display text-5xl leading-[0.95] font-extrabold tracking-tight break-words">
          Join
          <br />
          <span className="text-lime">{room.name}</span>
        </h1>
      </div>
      <div className="flex flex-col gap-2.5">
        <Field icon={<User />} aria-label="Your name" placeholder="Your name" value={name || accountName} onChange={(e) => setName(e.target.value)} maxLength={24} required />
        <LimitsPicker value={limits} onChange={setLimits} room={room} />
      </div>
      <Button className="mt-auto lg:mt-0">
        Join <Arrow />
      </Button>
    </form>
  );
}

export function Lobby({ room, act }: { room: RoomView; act: Act }) {
  const [copied, setCopied] = useState(false);
  const left = room.deck.length;
  const host = room.members.find((m) => m.isHost)?.name;
  const preview = room.deck.map((id) => room.restaurants[id]).filter((r) => r.photos[0]);

  async function invite() {
    const url = location.href;
    if (navigator.share) {
      await navigator.share({ title: room.name, text: `Join ${room.name} on ForkIt (code ${room.code})`, url }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const start = room.isHost ? (
    <Button className="w-full" disabled={!left} onClick={() => act("start")}>
      Start swiping <Arrow />
    </Button>
  ) : (
    <p className="rounded-2xl bg-surface py-4 text-center text-muted">Waiting for {host} to start…</p>
  );

  return (
    <div className="flex flex-1 flex-col gap-8 lg:flex-row lg:items-stretch lg:gap-10 lg:pt-6">
      <div className="flex flex-col items-center gap-8 pt-6 lg:flex-1 lg:items-start lg:justify-center lg:pt-0">
        <div className="flex flex-col items-center gap-4 lg:items-start">
          <GroupName room={room} act={act} />
          <div className="flex items-center gap-3">
            <button onClick={invite} className="flex h-12 items-center gap-2 rounded-full bg-paper px-5 font-bold text-night">
              {copied ? <Check className="size-4" /> : <Share className="size-4 lg:hidden" />}
              {!copied && <Copy className="hidden size-4 lg:block" />}
              {copied ? "Link copied" : "Invite friends"}
            </button>
            <span className="text-sm text-faint">
              or code <span className="font-bold tracking-widest text-paper">{room.code}</span>
            </span>
          </div>
        </div>

        <ul className="flex flex-wrap justify-center gap-4 lg:justify-start">
          {room.members.map((m) => (
            <li key={m.id} className="flex w-16 flex-col items-center gap-1.5">
              <span className={m.id === room.me?.id ? "rounded-full ring-2 ring-lime ring-offset-4 ring-offset-night" : ""}>
                <Avatar name={m.name} size="lg" />
              </span>
              <span className="max-w-full truncate text-sm font-bold">{m.name}</span>
              <span className="text-center text-xs text-faint">{budgetLabel(m.limits, room.currency)}</span>
            </li>
          ))}
          <li className="grid size-16 place-items-center rounded-full border-2 border-dashed border-line text-faint" aria-label="Waiting for more friends">
            <Plus className="size-6" />
          </li>
        </ul>
      </div>

      <div className="mt-auto flex flex-col gap-4 lg:mt-0 lg:min-w-0 lg:flex-1 lg:rounded-[32px] lg:bg-surface lg:p-6">
        <div className="flex items-center gap-4 rounded-[20px] bg-surface p-3 lg:hidden">
          <div className="relative h-13 w-28 shrink-0">
            {preview.slice(0, 3).map((r, i) => (
              <span key={r.id} style={{ left: i * 30 }} className="absolute top-0">
                <Photo src={r.photos[0]} className="block size-13 rounded-[14px] border-2 border-surface" />
              </span>
            ))}
          </div>
          <DeckCount room={room} />
        </div>

        <SearchPicker room={room} act={act} />
        <MyBudget room={room} act={act} />

        <div className="hidden lg:flex lg:items-baseline lg:justify-between">
          <DeckCount room={room} />
        </div>
        <div className="hidden grid-cols-3 gap-2 lg:grid">
          {preview.slice(0, 6).map((r, i) => (
            <div key={r.id} className="relative aspect-square overflow-hidden rounded-2xl">
              <Photo src={r.photos[0]} className={`size-full ${i === 5 && left > 6 ? "brightness-[0.35]" : ""}`} />
              {i === 5 && left > 6 && (
                <span className="absolute inset-0 grid place-items-center font-display text-3xl font-extrabold">+{left - 5}</span>
              )}
            </div>
          ))}
        </div>
        <Places room={room} act={act} />
        <div className="lg:mt-auto">{start}</div>
      </div>
    </div>
  );
}

function DeckCount({ room }: { room: RoomView }) {
  const left = room.deck.length;
  return (
    <div className="flex flex-col">
      <span className="font-display text-2xl leading-none font-extrabold lg:text-3xl">
        {left} {left === 1 ? "place" : "places"}
      </span>
      <span className={`text-sm ${left ? "text-muted" : "text-coral"}`}>
        {room.picksOnly ? (left ? "added by your group" : "add a restaurant to start") : left ? "fit everyone's budget" : "nothing fits everyone's budget"}
        {room.source === "sample" && " · sample data"}
      </span>
    </div>
  );
}

/** Where and what the group is eating. The host can change either; the nearby list is searched again. */
function SearchPicker({ room, act }: { room: RoomView; act: Act }) {
  const [draft, setDraft] = useState<{ area: string; craving: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!draft)
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 lg:bg-night">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <Pin className="size-4 shrink-0 text-faint" />
            <span className="truncate font-bold">{room.area}</span>
          </span>
          <span className="flex min-w-0 items-center gap-2 text-sm text-muted">
            <Fork className="size-4 shrink-0 text-faint" />
            <span className="truncate">{room.craving || "Any food"}</span>
          </span>
        </span>
        {room.isHost && (
          <button onClick={() => setDraft({ area: room.area, craving: room.craving })} className="shrink-0 text-sm font-bold text-lime">
            Change
          </button>
        )}
      </div>
    );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!draft.area.trim()) return;
        setBusy(true);
        await act("setSearch", draft);
        setBusy(false);
        setDraft(null);
      }}
      className="flex flex-col gap-2"
    >
      <Suggest
        kind="area"
        icon={<Pin />}
        aria-label="Area"
        placeholder="Where?"
        value={draft.area}
        onChange={(e) => setDraft({ ...draft, area: e.target.value })}
        onPick={(s) => setDraft({ ...draft, area: s.secondary ? `${s.main}, ${s.secondary}` : s.main })}
        disabled={busy}
        required
      />
      <Field
        icon={<Fork />}
        aria-label="What are you craving?"
        placeholder="Craving? e.g. yum cha, fried chicken"
        value={draft.craving}
        onChange={(e) => setDraft({ ...draft, craving: e.target.value })}
        maxLength={40}
        disabled={busy}
      />
      <div className="flex gap-2">
        <Button className="flex-1" disabled={busy}>
          {busy ? "Finding places…" : "Search again"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
          Cancel
        </Button>
      </div>
      <p className="px-1 text-xs text-faint">Places you added by hand stay on the list.</p>
    </form>
  );
}

function MyBudget({ room, act }: { room: RoomView; act: Act }) {
  // Local copy so the slider moves instantly; saved once the person stops dragging
  const [limits, setLimits] = useState(room.me!.limits);
  const save = useRef<ReturnType<typeof setTimeout>>(undefined);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="px-1 text-xs font-bold tracking-wide text-faint uppercase">Your budget</span>
      <LimitsPicker
        room={room}
        value={limits}
        onChange={(l) => {
          setLimits(l);
          clearTimeout(save.current);
          save.current = setTimeout(() => act("setLimits", { limits: l }), 400);
        }}
      />
    </div>
  );
}

/** Everything in the deck, plus a search to add a specific restaurant by name. */
function Places({ room, act }: { room: RoomView; act: Act }) {
  const [query, setQuery] = useState("");
  const names = new Map(room.members.map((m) => [m.id, m.name]));
  return (
    <div className="flex flex-col gap-2">
      {room.source === "google" && (
        <Suggest
          kind="restaurant"
          code={room.code}
          icon={<Search />}
          aria-label="Add a restaurant"
          placeholder="Add a restaurant you want to try"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onPick={(s) => {
            setQuery("");
            act("addPlace", { placeId: s.id });
          }}
        />
      )}
      {(room.source === "google" || room.picksOnly) && (
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 text-sm font-bold lg:bg-night">
          Only places we add
          <input
            type="checkbox"
            role="switch"
            checked={room.picksOnly}
            disabled={!room.isHost}
            onChange={(e) => act("setPicksOnly", { on: e.target.checked })}
            className="size-5 accent-lime disabled:opacity-60"
          />
        </label>
      )}
      <details className="group rounded-2xl bg-surface lg:bg-night">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold">
          See all {room.deck.length} places
          <Plus className="size-4 text-faint transition group-open:rotate-45" />
        </summary>
        <ul className="flex max-h-72 flex-col overflow-y-auto px-2 pb-2">
          {room.deck.map((id) => {
            const r = room.restaurants[id];
            return (
              <li key={id} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                <Photo src={r.photos[0]} className="size-10 shrink-0 rounded-lg" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-bold">{r.name}</span>
                  <span className="truncate text-xs text-faint">
                    {[r.cuisine, r.priceRange && priceLabel(r.priceRange), r.addedBy && `added by ${names.get(r.addedBy) ?? "someone"}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <button
                  onClick={() => act("removePlace", { restaurantId: id })}
                  aria-label={`Remove ${r.name}`}
                  className="grid size-8 shrink-0 place-items-center rounded-full text-faint hover:bg-line hover:text-paper"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}

/** The group's name, big. The host can tap it to rename. */
function GroupName({ room, act }: { room: RoomView; act: Act }) {
  const [draft, setDraft] = useState<string | null>(null);
  const big = "font-display text-5xl leading-[0.95] font-extrabold tracking-tight text-lime lg:text-7xl";
  if (draft === null)
    return (
      <h1 className={`${big} max-w-full text-center break-words lg:text-left`}>
        {room.name}
        {room.isHost && (
          <button onClick={() => setDraft(room.name)} aria-label="Rename group" className="ml-3 align-middle text-faint hover:text-paper">
            <Pencil className="inline size-6 lg:size-8" />
          </button>
        )}
      </h1>
    );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (draft.trim() && draft.trim() !== room.name) await act("rename", { name: draft });
        setDraft(null);
      }}
      className="w-full"
    >
      <input
        aria-label="Group name"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => e.currentTarget.form?.requestSubmit()}
        onKeyDown={(e) => e.key === "Escape" && setDraft(null)}
        maxLength={40}
        autoFocus
        onFocus={(e) => e.currentTarget.select()} // typing replaces the default name
        className={`${big} w-full rounded-2xl bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-lime/60`}
      />
    </form>
  );
}
