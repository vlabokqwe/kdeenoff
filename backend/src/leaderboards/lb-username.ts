/** Public leaderboard name: exact username as entered in the admin panel. */
export function formatLbUsername(name: unknown): string {
  return String(name ?? "").trim();
}
