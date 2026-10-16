import type { Limits } from "./budget";

export function parseName(v: unknown): string | null {
  const name = typeof v === "string" ? v.trim().slice(0, 24) : "";
  return name || null;
}

export function parseLimits(v: unknown): Limits | null {
  const m = (v as Partial<Limits> | undefined)?.maxSpend;
  if (m === null) return { maxSpend: null };
  if (!Number.isInteger(m) || (m as number) < 1 || (m as number) > 1_000_000) return null;
  return { maxSpend: m as number };
}

export const parseArea = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 80) : "");

export const parseGroupName = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 40) : "");

export const parseCraving = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 40) : "");

/** The area label for rooms searched from the phone's location. */
export const NEAR_YOU = "Near you";
