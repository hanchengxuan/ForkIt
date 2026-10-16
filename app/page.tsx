"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Arrow, Crown, Fork, Heart, Pin, Send, Share, Star, User, X } from "./icons";
import { ensureSession } from "@/lib/auth-client";
import { api } from "@/lib/api-client";
import { Account, Button, CodeJoin, Field, Logo, Suggest, useAccountName } from "./ui";

export default function Home() {
  const router = useRouter();
  const [joining, setJoining] = useState(false);

  // The code form gets its own history entry, so the phone's back gesture (and Cancel) returns here
  function openJoin() {
    history.pushState({ joining: true }, "");
    setJoining(true);
  }
  useEffect(() => {
    const onBack = () => setJoining(false);
    addEventListener("popstate", onBack);
    return () => removeEventListener("popstate", onBack);
  }, []);
  const accountName = useAccountName();
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [craving, setCraving] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function locate() {
    setError("");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
        setArea("");
      },
      () => setError("Couldn't get your location — type an area instead"),
    );
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await ensureSession();
      const res = await api("/api/rooms", { name: name || accountName, area, craving, ...coords });
      router.push(`/r/${res.room.code}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 overflow-hidden px-6 pt-6 pb-8 lg:max-w-6xl lg:px-10">
      <nav className="flex items-center justify-between gap-4">
        <Logo className="text-[26px] lg:text-3xl" />
        <span className="flex-1" />
        <Account />
        <JoinBox open={joining} onToggle={() => (joining ? history.back() : openJoin())} />
      </nav>

      {joining ? (
        <div className="lg:hidden">
          <CodeJoin />
        </div>
      ) : null}

      <div className={`flex flex-1 flex-col gap-6 lg:flex-row-reverse lg:items-center lg:gap-14 ${joining ? "max-lg:hidden" : ""}`}>
        <HeroStack />

        <div className="flex flex-1 flex-col gap-6 lg:gap-8">
          <h1 className="font-display text-[46px] leading-[0.95] font-extrabold tracking-[-0.03em] lg:text-[124px] lg:leading-[0.88]">
            Swipe.
            <br />
            <span className="text-lime">Eat.</span>
          </h1>

          <form onSubmit={create} className="flex flex-1 flex-col gap-2.5 lg:max-w-[480px] lg:flex-none">
            <div className="grid gap-2.5 lg:grid-cols-2">
              <Field icon={<User />} aria-label="Your name" placeholder="Your name" value={name || accountName} onChange={(e) => setName(e.target.value)} maxLength={24} required />
              <Suggest
                kind="area"
                icon={<Pin />}
                aria-label="Where are you eating?"
                placeholder="Where?"
                value={coords ? "Near me" : area}
                onChange={(e) => {
                  setCoords(null);
                  setArea(e.target.value);
                }}
                onPick={(s) => setArea(s.secondary ? `${s.main}, ${s.secondary}` : s.main)}
                required
              >
                <button
                  type="button"
                  onClick={locate}
                  aria-label="Use my location"
                  className={`grid size-10 shrink-0 place-items-center rounded-xl ${coords ? "bg-lime text-night" : "bg-line text-lime"}`}
                >
                  <Send className="size-[18px]" />
                </button>
              </Suggest>
            </div>
            <Field
              icon={<Fork />}
              aria-label="What are you craving?"
              placeholder="Craving? e.g. yum cha, fried chicken (optional)"
              value={craving}
              onChange={(e) => setCraving(e.target.value)}
              maxLength={40}
            />
            <Button className="mt-auto lg:mt-0" disabled={busy}>
              {busy ? "Finding places…" : "Start a group"}
              {!busy && <Arrow />}
            </Button>
            {error && <p className="text-sm font-medium text-coral">{error}</p>}
          </form>

          <div className="hidden gap-6 text-sm text-muted lg:flex">
            <Step icon={<Share className="size-4 text-paper" />}>Share a code</Step>
            <Step icon={<Heart className="size-4 text-lime" />}>Everyone swipes</Step>
            <Step icon={<Crown className="size-4 text-gold" />}>One winner</Step>
          </div>
        </div>
      </div>
    </main>
  );
}

function Step({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span className="grid size-8 place-items-center rounded-full bg-surface">{icon}</span>
      {children}
    </span>
  );
}

/** Mobile: a "Join" pill that swaps the page to the code form. Web: the code box sits in the nav. */
function JoinBox({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <>
      <button onClick={onToggle} className="rounded-full border-[1.5px] border-line px-4 py-2 text-sm font-bold lg:hidden">
        {open ? "Cancel" : "Join"}
      </button>
      <div className="hidden lg:block">
        <CodeJoin inline />
      </div>
    </>
  );
}

/** Three fanned cards with a nope and a yum badge: the whole idea of the app in one picture. */
function HeroStack() {
  return (
    <div className="relative mx-auto h-[250px] w-full max-w-[340px] shrink-0 lg:h-[540px] lg:max-w-[520px] lg:flex-1" aria-hidden>
      <div className="lift absolute top-[12%] left-[6%] grid h-[76%] w-[44%] -rotate-[10deg] place-items-center rounded-[22px] bg-sky text-night/70 lg:rounded-[30px]">
        <Fork className="size-1/3" />
      </div>
      <div className="lift absolute top-[12%] right-[6%] grid h-[76%] w-[44%] rotate-[10deg] place-items-center rounded-[22px] bg-gold text-night/70 lg:rounded-[30px]">
        <Star className="size-1/3" />
      </div>
      <div className="lift absolute top-0 left-1/2 flex h-[92%] w-[52%] -translate-x-1/2 flex-col justify-end gap-2 rounded-[24px] border-4 border-night bg-surface p-4 lg:rounded-[32px] lg:p-6">
        <span className="absolute inset-x-0 top-[22%] text-center font-display text-7xl font-extrabold text-lime lg:text-[150px]">?</span>
        <span className="h-3 w-3/4 rounded-full bg-paper/80 lg:h-5" />
        <span className="h-2 w-1/2 rounded-full bg-line lg:h-3" />
      </div>
      <span className="absolute bottom-[4%] left-[8%] grid size-14 -rotate-12 place-items-center rounded-full bg-coral text-night lg:size-20">
        <X className="size-6 lg:size-8" />
      </span>
      <span className="glow absolute right-[8%] bottom-0 grid size-16 rotate-[10deg] place-items-center rounded-full bg-lime text-night lg:size-24">
        <Heart className="size-7 lg:size-10" />
      </span>
    </div>
  );
}
