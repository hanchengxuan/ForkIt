"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { authClient, ensureSession, signOut } from "@/lib/auth-client";
import type { Suggestion } from "@/lib/places";
import { money, type Limits } from "@/lib/budget";
import type { RoomView } from "@/lib/room";
import { Arrow, Check, Fork } from "./icons";

export type Act = (action: string, extra?: object) => Promise<void>;

export async function api<T = { room: RoomView; notice?: string }>(
  url: string,
  body?: object,
): Promise<T> {
  const res = await fetch(url, body ? { method: "POST", body: JSON.stringify(body) } : { cache: "no-store" });
  const json = await res.json().catch(() => ({ error: "Something went wrong" }));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong");
  return json;
}


/** Shows who's signed in. Guests see a sign-in link; their rooms move to the account when they sign in. */
export function Account() {
  const { data, isPending } = authClient.useSession();
  const path = usePathname();
  if (isPending) return null;
  if (!data || data.user.isAnonymous)
    return (
      <Link href={`/login?next=${encodeURIComponent(path)}`} className="text-sm font-bold text-muted hover:text-paper">
        Sign in
      </Link>
    );
  return (
    <span className="flex items-center gap-3 text-sm">
      <span className="max-w-32 truncate font-bold">{data.user.name}</span>
      <button onClick={() => signOut()} className="text-muted hover:text-paper">
        Sign out
      </button>
    </span>
  );
}

/** A signed-in user's name, to prefill "Your name". Empty for guests. */
export function useAccountName() {
  const { data } = authClient.useSession();
  return data && !data.user.isAnonymous ? data.user.name : "";
}

export function Logo({ className = "text-2xl" }: { className?: string }) {
  return (
    <Link href="/" className={`font-display font-extrabold tracking-tight ${className}`}>
      fork<span className="text-lime">it</span>
    </Link>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  const look =
    variant === "primary"
      ? "bg-lime text-night glow hover:brightness-105"
      : "border-2 border-line text-paper hover:border-faint";
  return (
    <button
      className={`flex h-14 items-center justify-center gap-2.5 rounded-2xl px-5 text-[17px] font-bold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${look} ${className}`}
      {...props}
    />
  );
}

/** A dark pill input with a leading icon. `children` go after the input (e.g. a locate button). */
export function Field({
  icon,
  children,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: React.ReactNode; children?: React.ReactNode }) {
  return (
    <label className="flex h-14 items-center gap-3 rounded-2xl bg-surface pr-2 pl-4 ring-lime/60 focus-within:ring-2">
      <span className="text-faint">{icon}</span>
      <input className="min-w-0 flex-1 bg-transparent text-base outline-none" {...input} />
      {children}
    </label>
  );
}

/**
 * A Field with Google typeahead under it. Typing calls onChange; choosing a suggestion calls onPick.
 * `code` biases restaurant results toward that room's area.
 */
export function Suggest({
  kind,
  code,
  onPick,
  ...field
}: React.ComponentProps<typeof Field> & { kind: "area" | "restaurant"; code?: string; onPick: (s: Suggestion) => void }) {
  const q = String(field.value ?? "");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const list = useId();

  useEffect(() => {
    if (!open || q.trim().length < 2) return; // only while the person is typing here
    let live = true;
    const t = setTimeout(async () => {
      await ensureSession().catch(() => {});
      const r = await api<Suggestion[]>(`/api/places?${new URLSearchParams({ q, kind, ...(code && { code }) })}`).catch(() => []);
      if (live) {
        setResults(r);
        setActive(0);
      }
    }, 250); // wait for a pause in typing; each lookup costs a Google call
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, kind, code, open]);

  const shown = open && q.trim().length >= 2 && results.length > 0;
  const pick = (r: Suggestion) => {
    setOpen(false);
    setResults([]);
    onPick(r);
  };

  return (
    <div className="relative">
      <Field
        {...field}
        role="combobox"
        aria-expanded={shown}
        aria-controls={list}
        aria-autocomplete="list"
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setOpen(true);
          field.onChange?.(e);
        }}
        onKeyDown={(e) => {
          if (!shown) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a + (e.key === "ArrowDown" ? 1 : results.length - 1)) % results.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {shown && (
        <ul id={list} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-2xl border border-line bg-night shadow-2xl">
          {results.map((r, i) => (
            <li
              key={r.id}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: click would fire after the input's blur closed the list
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer flex-col px-4 py-2.5 ${i === active ? "bg-surface" : ""}`}
            >
              <span className="truncate font-bold">{r.main}</span>
              {r.secondary && <span className="truncate text-sm text-faint">{r.secondary}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const budgetLabel = (l: Limits, currency: string) => (l.maxSpend == null ? "Any budget" : `Up to ${money(l.maxSpend, currency)}`);

/**
 * Budget is the one hard limit. Everything else is a preference, decided by swiping.
 * Any amount across this area's prices; one past the priciest place means "no limit".
 */
export function LimitsPicker({ value, onChange, room }: { value: Limits; onChange: (l: Limits) => void; room: RoomView }) {
  if (!room.budgetRange) return <p className="rounded-2xl bg-surface px-4 py-3 text-sm text-faint">No prices listed around here, so there&apos;s no budget to set.</p>;
  const { min, max } = room.budgetRange;
  const none = max + 1;
  const at = value.maxSpend == null ? none : Math.min(Math.max(value.maxSpend, min), max);
  const label = at === none ? "No limit" : `Up to ${money(at, room.currency)}`;
  return (
    <label className="flex flex-col gap-2.5 rounded-2xl bg-surface px-4 py-3">
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-bold text-lime tabular-nums">{label}</span>
        <span className="min-w-0 truncate text-sm text-faint">per person</span>
      </span>
      <input
        type="range"
        min={min}
        max={none}
        step={1}
        value={at}
        onChange={(e) => {
          const v = Number(e.target.value);
          onChange({ maxSpend: v >= none ? null : v });
        }}
        aria-label="Budget per person"
        aria-valuetext={`${label} per person`}
        className="h-2 w-full cursor-pointer accent-lime"
      />
      <span className="flex justify-between text-xs text-faint" aria-hidden>
        <span>{money(min, room.currency)}</span>
        <span>No limit</span>
      </span>
    </label>
  );
}

const AVATAR_COLORS = ["bg-coral", "bg-sky", "bg-gold", "bg-lime", "bg-[#f29ad8]", "bg-[#7ee0c3]"];

export function avatarColor(name: string) {
  return AVATAR_COLORS[[...name].reduce((h, c) => h + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
}

export function Avatar({
  name,
  done,
  size = "md",
  dim,
}: {
  name: string;
  done?: boolean;
  size?: "sm" | "md" | "lg";
  dim?: boolean;
}) {
  const s = { sm: "size-6 text-[11px]", md: "size-10 text-base", lg: "size-16 text-2xl" }[size];
  return (
    <span
      className={`relative grid shrink-0 place-items-center rounded-full font-display font-extrabold text-night ${avatarColor(name)} ${s} ${
        dim ? "opacity-40" : ""
      }`}
      aria-hidden
    >
      {name[0]?.toUpperCase()}
      {done && (
        <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-lime text-night ring-2 ring-night">
          <Check className="size-3" />
        </span>
      )}
    </span>
  );
}

/** Restaurant photo, or a dark tile with a fork when Google has none. */
export function Photo({ src, className = "", alt = "" }: { src?: string; className?: string; alt?: string }) {
  if (!src)
    return (
      <span className={`grid place-items-center bg-surface text-line ${className}`} aria-hidden>
        <Fork className="size-1/3 max-h-24" />
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element -- proxied Google photos, sizes vary
  return <img src={src} alt={alt} draggable={false} className={`object-cover ${className}`} />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md border-[1.5px] border-line px-1.5 py-0.5 font-sans text-xs font-bold text-faint">{children}</kbd>;
}

/** Jump to a group by its 4-letter code. */
export function CodeJoin({ inline }: { inline?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/r/${code.trim().toUpperCase()}`);
      }}
      className={inline ? "flex gap-2" : "flex flex-col gap-3"}
    >
      <input
        aria-label="Group code"
        placeholder="CODE"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        maxLength={4}
        autoCapitalize="characters"
        autoFocus={!inline}
        className={`rounded-2xl bg-surface text-center font-display font-extrabold tracking-[0.3em] outline-none focus:ring-2 focus:ring-lime/60 ${
          inline ? "h-11 w-32 text-lg" : "h-24 text-5xl"
        }`}
      />
      {inline ? (
        <button disabled={code.trim().length !== 4} className="h-11 rounded-xl bg-paper px-4 text-sm font-bold text-night disabled:opacity-40">
          Join
        </button>
      ) : (
        <Button disabled={code.trim().length !== 4}>
          Join group <Arrow />
        </Button>
      )}
    </form>
  );
}
