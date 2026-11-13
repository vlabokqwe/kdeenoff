/** JSON shapes of the public API (see backend routes). */

export type UserRole = "player" | "streamer" | "admin";

export interface RaffleBanInfo {
  permanent: boolean;
  bannedUntil: number | null;
}

export interface Account {
  linked: boolean;
  name: string;
  avatarUrl: string;
  email: string;
  emailVerified: boolean;
  partnerUsername?: string;
  raffleBan?: RaffleBanInfo | null;
  role?: UserRole;
  isAdmin?: boolean;
  isStreamer?: boolean;
}

export interface Board {
  id?: number;
  slug: string;
  title?: string;
  subtitle?: string;
  partner?: string;
  partner_signup_url?: string;
  avatar_style?: string;
  prize_pool_cents?: number;
  starts_at?: number;
  ends_at?: number;
  badge?: string;
  promo_code?: string;
  sort_order?: number;
  show_in_drawer?: number;
  show_on_home?: number;
  is_demo?: number;
}

export interface SiteSettings {
  promo_code: string;
  partner_name: string;
  partner_signup_url: string;
  headline_prize: string;
  kick_channel: string;
  kick_url: string;
  telegram_url: string;
}

export interface BoardPlayer {
  rank?: number;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  wagered_cents?: number;
  prize_cents?: number;
  empty_spot?: boolean | number;
}

export interface BoardSpot {
  rank?: number;
  prize_cents?: number;
  hidden?: boolean | number;
}

export interface BoardDetail {
  board?: Board;
  players?: BoardPlayer[];
  spots?: BoardSpot[];
}

export type RaffleEndMode = "timer" | "manual";
export type RaffleSpinMode = "winner" | "elimination";
export type RaffleSpinSpeed = "normal" | "fast" | "instant";
export type RaffleSpinKind = "winner" | "elimination" | null;

export interface RaffleWinner {
  id: number;
  order: number;
  name: string;
  avatar_url?: string;
  ticket_no?: number;
  won_at: number;
  kick_user_id?: string;
  kick_name?: string;
  partner_username?: string | null;
  is_banned?: boolean;
  banned_until?: number | null;
}

export interface Raffle {
  id?: number;
  title?: string;
  prize?: string;
  note?: string | null;
  winner?: string | null;
  winners?: RaffleWinner[];
  starts_at?: number;
  ends_at?: number;
  end_mode?: RaffleEndMode;
  ended_at?: number | null;
  spin_mode?: RaffleSpinMode;
  spin_speed?: RaffleSpinSpeed;
  spin_duration_ms?: number;
  exclude_prev_winner?: boolean | number;
  entries_locked?: boolean | number;
  last_eliminated?: string | null;
  last_spin_at?: number | null;
  last_spin_kind?: RaffleSpinKind;
  hidden?: boolean | number;
  is_demo?: boolean | number;
  updated_at?: number;
  entries?: number;
  entry_count?: number;
  active_entries?: number;
  active_entry_count?: number;
  eliminated_entries?: number;
  eliminated_entry_count?: number;
  is_open?: boolean;
}

export interface RaffleParticipant {
  id: number;
  name: string;
  avatar_url?: string;
  joined_at: number;
  ticket_no: number;
  is_winner: boolean;
  is_eliminated?: boolean;
  eliminated_at?: number | null;
  eliminated_order?: number | null;
  kick_user_id?: string;
  kick_name?: string;
  partner_username?: string | null;
  is_banned?: boolean;
  banned_until?: number | null;
}

export interface RaffleDetailResponse {
  raffle: Raffle;
  winners?: RaffleWinner[];
  participants: RaffleParticipant[];
  viewer: {
    linked: boolean;
    joined: boolean;
    banned?: boolean;
    banned_until?: number | null;
  };
}

export interface RaffleList {
  raffles?: Raffle[];
}

export interface RafflesMine {
  linked?: boolean;
  joined?: number[];
}

export interface RaffleJoin {
  ok?: boolean;
  joined?: boolean;
  already?: boolean;
}

export interface KickMessage {
  id?: string | number | null;
  content?: string;
  sender?: { username?: string; identity?: { color?: string } };
}
