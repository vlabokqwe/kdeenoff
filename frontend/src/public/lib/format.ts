/** Small formatting helpers shared across the public pages. */
import type { Account } from "./types";

export function displayName(account: Account | null): string {
  if (!account) return "Account";
  if (account.linked && account.name) return String(account.name);
  if (account.email) {
    const nick = String(account.email).split("@")[0];
    return nick || "Account";
  }
  return "Account";
}

export function accountInitial(value: string): string {
  return (String(value || "").trim()[0] || "A").toUpperCase();
}

/** Only https or local site avatar paths are shown. */
export function safeAvatar(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (
    (raw.startsWith("/api/leaderboards/avatar/") || raw.startsWith("/img/")) &&
    !raw.startsWith("//") &&
    !raw.includes("..")
  ) {
    return raw;
  }
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

/** True when the visitor asked for less motion (read once, like the old scripts). */
export const reduceMotion =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
