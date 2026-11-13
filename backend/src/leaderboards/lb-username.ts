/** Public leaderboard name: first two characters of the input + six asterisks. */
export function maskLbUsername(name: unknown): string {
  const s = String(name || "").trim();
  if (!s) return "";
  return `${s.slice(0, 2)}******`;
}
