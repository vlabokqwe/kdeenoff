/**
 * Privacy-masked public leaderboard username (matches partner affiliate APIs
 * such as 500 Casino / Stake / GGE, e.g. "TurboSnail77" -> "Tu***77").
 * Already-masked strings from CSV exports (containing "*") pass through unchanged.
 */
export function formatLbUsername(name: unknown): string {
  const raw = String(name ?? "").trim();
  if (!raw || raw === "\u2014" || raw === "-") return raw;
  if (raw.includes("*")) return raw;
  const lower = raw.toLowerCase();
  if (lower === "hidden" || lower === "anonymous") return raw;

  const chars = Array.from(raw);
  const len = chars.length;
  if (len <= 2) {
    return `${chars[0]}***`;
  }
  if (len <= 4) {
    return `${chars[0]}***${chars[len - 1]}`;
  }
  if (len <= 6) {
    return `${chars.slice(0, 2).join("")}***${chars[len - 1]}`;
  }
  return `${chars.slice(0, 2).join("")}***${chars.slice(-2).join("")}`;
}

