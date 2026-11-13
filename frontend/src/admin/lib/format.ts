/** Formatting helpers shared by all admin pages (identical to the legacy admin.js). */

const moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const money = (cents: unknown): string => moneyFmt.format((Number(cents) || 0) / 100);

export const fmtDate = (ms: unknown): string =>
  ms ? new Date(Number(ms)).toLocaleString("en-US") : "—";

/** ms → value for `<input type="datetime-local">` in the browser's local time zone. */
export const localISO = (ms: unknown): string => {
  if (!ms) return "";
  const d = new Date(Number(ms));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** `datetime-local` value (local time) → ms, or null when empty/invalid. */
export const fromLocalISO = (s: FormDataEntryValue | string | null | undefined): number | null =>
  s ? Date.parse(String(s)) || null : null;

export const DAY_MS = 24 * 3600 * 1000;
