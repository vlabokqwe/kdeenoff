export const PENDING_RAFFLE_JOIN_KEY = "kdeenoff-pending-raffle-join";

export interface PendingRaffleJoin {
  raffleId: number;
  raffleTitle?: string;
  rafflePrize?: string;
  kickPrompted?: boolean;
}

export function getPendingRaffleJoin(): PendingRaffleJoin | null {
  try {
    const raw = sessionStorage.getItem(PENDING_RAFFLE_JOIN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingRaffleJoin>;
    const id = Number(parsed?.raffleId);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    return {
      raffleId: id,
      raffleTitle: typeof parsed.raffleTitle === "string" ? parsed.raffleTitle : undefined,
      rafflePrize: typeof parsed.rafflePrize === "string" ? parsed.rafflePrize : undefined,
      kickPrompted: Boolean(parsed.kickPrompted),
    };
  } catch {
    return null;
  }
}

export function setPendingRaffleJoin(next: PendingRaffleJoin): void {
  if (!Number.isSafeInteger(next.raffleId) || next.raffleId <= 0) return;
  try {
    sessionStorage.setItem(
      PENDING_RAFFLE_JOIN_KEY,
      JSON.stringify({
        raffleId: next.raffleId,
        raffleTitle: next.raffleTitle || undefined,
        rafflePrize: next.rafflePrize || undefined,
        kickPrompted: Boolean(next.kickPrompted),
      }),
    );
  } catch {
    /* private mode */
  }
}

export function clearPendingRaffleJoin(): void {
  try {
    sessionStorage.removeItem(PENDING_RAFFLE_JOIN_KEY);
  } catch {
    /* private mode */
  }
}

export function isSiteRegistered(
  account: { emailVerified?: boolean; email?: string } | null | undefined,
): boolean {
  return Boolean(account && account.emailVerified && account.email);
}

export function hasPartnerUsername(
  account: { partnerUsername?: string } | null | undefined,
): boolean {
  return Boolean(account && typeof account.partnerUsername === "string" && account.partnerUsername.trim());
}

export function buildRaffleEntryPath(raffleId: number): string {
  return `/raffles/${raffleId}/?join=1`;
}

export function buildRaffleEntryUrl(raffleId: number): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${buildRaffleEntryPath(raffleId)}`;
}
