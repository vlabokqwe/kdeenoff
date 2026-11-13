/** Shapes of the admin API rows (only the fields the panel uses). */

export interface Board {
  id: number;
  slug: string;
  title: string;
  subtitle?: string | null;
  partner?: string | null;
  partner_signup_url?: string | null;
  prize_pool_cents?: number | null;
  starts_at?: number | null;
  ends_at?: number | null;
  hidden?: number | null;
  archived?: number | null;
  player_count?: number | null;
  avatar_style?: string | null;
  badge?: string | null;
  promo_code?: string | null;
  sort_order?: number | null;
  show_in_drawer?: number | null;
  show_on_home?: number | null;
  is_demo?: number | null;
  auto_hidden_above_rank?: number | null;
  auto_rank_by_wagered?: number | null;
  auto_wager_growth_enabled?: number | null;
  auto_wager_growth_pct?: number | null;
  auto_wager_growth_interval_ms?: number | null;
}

export interface Player {
  id: number;
  username: string;
  rank?: number | null;
  avatar_url?: string | null;
  avatar_sid?: string | null;
  is_registered?: number | null;
  wagered_cents: number;
  prize_cents: number;
  wag_growth_enabled?: number | null;
  wag_growth_hours?: number | null;
  wag_growth_pct?: number | null;
}

export interface Spot {
  rank: number;
  prize_cents: number;
  hidden?: number | null;
}

export interface BoardDetail {
  board: Board;
  players?: Player[];
  spots?: Spot[];
}

export interface Raffle {
  id: number;
  title: string;
  prize?: string | null;
  winner?: string | null;
  note?: string | null;
  starts_at?: number | null;
  ends_at?: number | null;
  end_mode?: "timer" | "manual" | null;
  ended_at?: number | null;
  hidden?: number | boolean | null;
  is_demo?: number | boolean | null;
  entry_count?: number | null;
}

export interface DemoSummary {
  demoBoards: Array<{
    id: number;
    slug: string;
    title: string;
    prize_pool_cents: number;
    ends_at: number;
    archived: number;
    hidden: number;
  }>;
  demoRaffles: Array<{
    id: number;
    title: string;
    prize: string;
    ends_at: number;
    hidden: number;
  }>;
  counts: {
    boards: number;
    raffles: number;
    total: number;
  };
}

export interface AuditEntry {
  at?: number | null;
  actor_email?: string | null;
  action?: string | null;
  target?: string | null;
  meta_json?: string | null;
}

export type SiteSettings = Record<string, string | null | undefined>;
