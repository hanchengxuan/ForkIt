"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Restaurant } from "@/lib/google-places";
import { Calendar, ChevronDown, Clock, Glass, Globe, Leaf, Phone, Pin, Star, Sun, Users } from "../../icons";
import { priceLabel } from "@/lib/domain/budget";
import { Photo } from "../../ui";

/** Photo with Tinder-style tap zones: right half = next photo, left half = previous. */
export function Photos({ r, className = "" }: { r: Restaurant; className?: string }) {
  const [i, setI] = useState(0);
  const photos = r.photos;
  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    if (photos.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const step = e.clientX - rect.left > rect.width / 2 ? 1 : -1;
    setI((p) => Math.min(photos.length - 1, Math.max(0, p + step)));
  }
  return (
    <div onClick={onClick} className={`absolute inset-0 bg-surface ${className}`}>
      <Photo src={photos[i]} alt={r.name} className="absolute inset-0 size-full" />
      {photos.length > 1 && (
        <div className="absolute inset-x-3.5 top-3 flex gap-1">
          {photos.map((_, n) => (
            <span key={n} className={`h-[3px] flex-1 rounded-full ${n === i ? "bg-paper" : "bg-paper/35"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Rating · price · open, as icons instead of words. */
export function Meta({ r, className = "" }: { r: Restaurant; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 font-bold ${className}`}>
      {r.rating && (
        <span className="flex items-center gap-1">
          <Star className="size-4 text-gold" />
          {r.rating}
        </span>
      )}
      {r.priceRange && <span className="text-muted">{priceLabel(r.priceRange)}</span>}
      {r.openNow !== undefined && (
        <span className={`flex items-center gap-1.5 ${r.openNow ? "text-lime" : "text-faint"}`}>
          <span className={`size-2 rounded-full ${r.openNow ? "bg-lime" : "bg-faint"}`} />
          {r.openNow ? "Open" : "Closed"}
        </span>
      )}
    </div>
  );
}

const HIGHLIGHT_ICONS: Record<string, React.ReactNode> = {
  Vegetarian: <Leaf className="size-5" />,
  Groups: <Users className="size-5" />,
  Bookings: <Calendar className="size-5" />,
  Outdoor: <Sun className="size-5" />,
  Cocktails: <Glass className="size-5" />,
};

/** "Friday: 12:00 – 11:30 PM" → "Till 11:30 PM". Google lists Monday first. */
function closesToday(r: Restaurant): string | null {
  const today = r.hours?.[(new Date().getDay() + 6) % 7];
  const close = today?.split(/[–-]/).at(-1)?.trim();
  if (!today || !close || /closed/i.test(today)) return r.openNow === false ? "Closed" : null;
  return /24 hours/i.test(today) ? "24 hours" : `Till ${close}`;
}

/** Everything we know about a place. Used in the phone sheet and the web side panel. */
export function DetailsBody({ r }: { r: Restaurant }) {
  const site = safeUrl(r.website);
  const closes = closesToday(r);
  const tiles = [
    ...(closes ? [{ label: closes, icon: <Clock className="size-5 text-lime" /> }] : []),
    ...(r.highlights ?? []).map((h) => ({ label: h, icon: HIGHLIGHT_ICONS[h] })),
  ].slice(0, 4);
  const review = r.reviews?.[0];

  return (
    <div className="flex flex-col gap-5">
      {tiles.length > 0 && (
        <div className="grid grid-cols-4 gap-2 lg:grid-cols-2">
          {tiles.map((t) => (
            <div key={t.label} className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface px-1 py-3 text-center lg:flex-row lg:gap-2.5 lg:px-3.5 lg:text-left">
              {t.icon}
              <span className="text-xs font-bold lg:text-sm">{t.label}</span>
            </div>
          ))}
        </div>
      )}

      {r.summary && <p className="text-[15px] leading-snug text-muted">{r.summary}</p>}

      {review && (
        <figure className="relative rounded-2xl bg-surface p-4 pl-10">
          <span className="absolute top-2 left-3.5 font-display text-4xl leading-none font-extrabold text-lime" aria-hidden>
            &ldquo;
          </span>
          <blockquote className="line-clamp-4 text-[15px] leading-snug">{review.text}</blockquote>
          <figcaption className="mt-2 flex items-center gap-2 text-xs text-faint">
            <span className="tracking-widest text-gold">{"★".repeat(Math.round(review.rating))}</span>
            {review.author} · Google
          </figcaption>
        </figure>
      )}

      <div className="flex gap-2">
        {r.phone && (
          <a href={`tel:${r.phone}`} aria-label={`Call ${r.phone}`} className="grid size-12 shrink-0 place-items-center rounded-full bg-surface hover:bg-line">
            <Phone className="size-[18px]" />
          </a>
        )}
        {site && (
          <a href={site.href} target="_blank" rel="noreferrer" aria-label={`Website: ${site.hostname}`} className="grid size-12 shrink-0 place-items-center rounded-full bg-surface hover:bg-line">
            <Globe className="size-[18px]" />
          </a>
        )}
        <a href={r.mapsUrl} target="_blank" rel="noreferrer" className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full bg-surface px-4 text-sm font-bold hover:bg-line">
          <Pin className="size-[18px] shrink-0" />
          <span className="truncate">{r.address || "Directions"}</span>
        </a>
      </div>
    </div>
  );
}

/** Phone: the opened card slides up as a full-screen sheet, like a Tinder profile. */
export function Details({ r, onClose, actions }: { r: Restaurant; onClose: () => void; actions?: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      role="dialog"
      aria-label={r.name}
      className="fixed inset-0 z-30 overflow-y-auto bg-night"
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 380, damping: 38 }}
    >
      <div className="mx-auto max-w-md pb-36">
        <div className="relative aspect-[390/380] select-none">
          <Photos r={r} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-night to-transparent" />
          <button
            onClick={onClose}
            aria-label="Close details"
            className="absolute right-5 -bottom-6 z-10 grid size-12 place-items-center rounded-full bg-paper text-night"
          >
            <ChevronDown className="size-6" />
          </button>
        </div>
        <div className="relative -mt-8 flex flex-col gap-5 px-5">
          <div className="flex flex-col gap-1.5 pr-14">
            <h2 className="font-display text-[38px] leading-[0.95] font-extrabold tracking-tight">{r.name}</h2>
            <Meta r={r} className="text-[15px]" />
          </div>
          <DetailsBody r={r} />
        </div>
      </div>
      {actions && <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-night from-60% to-transparent pt-10 pb-6">{actions}</div>}
    </motion.div>
  );
}

/** Website links come from Google: only ever link to real http(s) pages. */
function safeUrl(u?: string): URL | null {
  try {
    const url = new URL(u ?? "");
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}
