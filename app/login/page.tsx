"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Arrow, User } from "../icons";
import { Button, Field, Logo } from "../ui";

export default function Login() {
  const router = useRouter();
  const [signUp, setSignUp] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = signUp
      ? await authClient.signUp.email({ name, email, password })
      : await authClient.signIn.email({ email, password });
    if (error) {
      setError(error.message ?? "Something went wrong");
      setBusy(false);
      return;
    }
    const next = new URLSearchParams(location.search).get("next");
    // Only same-site paths, so the link can't bounce people to another site
    router.push(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 pt-6 pb-8">
      <Logo className="text-[26px]" />
      <form onSubmit={submit} className="flex flex-1 flex-col justify-center gap-6">
        <h1 className="font-display text-5xl leading-[0.95] font-extrabold tracking-tight">
          {signUp ? "Create your" : "Welcome"}
          <br />
          <span className="text-lime">{signUp ? "account." : "back."}</span>
        </h1>
        <div className="flex flex-col gap-2.5">
          {signUp && (
            <Field icon={<User />} aria-label="Your name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} required />
          )}
          <Field icon={<span aria-hidden>@</span>} aria-label="Email" type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Field
            icon={<span aria-hidden>*</span>}
            aria-label="Password"
            type="password"
            autoComplete={signUp ? "new-password" : "current-password"}
            placeholder="Password (8+ characters)"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-coral">
            {error}
          </p>
        )}
        <Button disabled={busy}>
          {signUp ? "Sign up" : "Sign in"} <Arrow />
        </Button>
        <button type="button" onClick={() => setSignUp(!signUp)} className="text-sm text-muted hover:text-paper">
          {signUp ? "Have an account? Sign in" : "New here? Create an account"}
        </button>
      </form>
    </main>
  );
}
