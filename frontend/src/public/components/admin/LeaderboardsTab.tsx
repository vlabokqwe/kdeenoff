import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  buildWagerGrowthSchedule,
  clampWagerGrowthIntervalMs,
  clampWagerGrowthPct,
} from "../../../shared/wager-growth-schedule";
import { useNow } from "../../hooks/useNow";
import { adminApi, errorCode } from "../../lib/api";
import { boardHref, countdown, money, moneyShort, partnerLabel } from "../../lib/boards";
import {
  IconArchive,
  IconArrowDown,
  IconArrowLeft,
  IconArrowUp,
  IconBolt,
  IconCheck,
  IconClose,
  IconCopy,
  IconDownload,
  IconExternal,
  IconEye,
  IconEyeOff,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSort,
  IconTrash,
  IconTrophy,
  IconUpload,
} from "./AdminIcons";
import {
  csvEscape,
  downloadTextFile,
  fmtShortDate,
  fromLocalISO,
  toLocalISO,
  type AdminBoard,
  type AdminBoardDetail,
  type AdminPlayer,
  type AdminSpot,
  type ToastKind,
} from "./adminTypes";

type BoardFilter = "all" | "active" | "hidden" | "ended" | "archived";
type StudioSubTab = "players" | "spots" | "settings";

interface PlayerDraft {
  username: string;
  wageredUsd: string;
  prizeUsd: string;
  wagGrowthEnabled: boolean;
  wagGrowthPct: string;
  wagGrowthHours: string;
}

interface SpotDraft {
  rank: number;
  prizeUsd: string;
  hidden: boolean;
}

interface LeaderboardsTabProps {
  boardSlug: string | null;
  createTrigger: number;
  onSelectBoardSlug: (slug: string | null) => void;
  notify: (text: string, kind?: ToastKind) => void;
  onChanged: () => void;
  onOpenPublicPath: (path: string) => void;
}

function slugifyInput(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

function centsToUsdInput(cents: number | null | undefined): string {
  const n = (Number(cents) || 0) / 100;
  if (!Number.isFinite(n) || n <= 0) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function usdInputToCents(raw: string): number {
  const cleaned = String(raw || "").replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

function normalizeAdminAvatarStyle(raw: string | null | undefined): string {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "none" || v === "kdeenoff-camo") return v;
  if (v === "kdeenoff-luxe" || v === "olympus-gold") return "kdeenoff-luxe";
  return "kdeenoff";
}

function playerAvatarPreview(player: AdminPlayer, avatarStyle: string | null | undefined): string {
  const mode = normalizeAdminAvatarStyle(avatarStyle);
  if (mode === "none") return "";
  if (player.avatar_url && !player.avatar_url.includes("dicebear.com")) {
    return player.avatar_url;
  }
  if (!player.is_registered) {
    return "/api/leaderboards/avatar/neutral.svg?v=zeus1&preset=neutral";
  }
  const seed = encodeURIComponent(
    String(player.username || player.avatar_sid || player.id || "player")
      .trim()
      .toLowerCase() || "player",
  );
  const query =
    mode === "kdeenoff-luxe"
      ? "?v=ape3&preset=luxe"
      : mode === "kdeenoff-camo"
        ? "?v=ape3&preset=camo"
        : "?v=ape3";
  return `/api/leaderboards/avatar/${seed}.svg${query}`;
}

const TOP_10_WEIGHTS = [0.4, 0.2, 0.12, 0.07, 0.05, 0.04, 0.035, 0.03, 0.03, 0.025];
const TOP_5_WEIGHTS = [0.45, 0.25, 0.15, 0.1, 0.05];
const TOP_3_WEIGHTS = [0.5, 0.3, 0.2];

type InitialSpotPreset = "top10" | "top5" | "top3" | "empty";

function buildInitialSpots(
  preset: InitialSpotPreset,
  poolCents: number,
): { rank: number; prize_cents: number; hidden: number }[] {
  if (preset === "empty" || poolCents <= 0) return [];
  const weights =
    preset === "top10"
      ? TOP_10_WEIGHTS
      : preset === "top5"
        ? TOP_5_WEIGHTS
        : TOP_3_WEIGHTS;
  return weights.map((w, idx) => ({
    rank: idx + 1,
    prize_cents: Math.round((poolCents * w) / 100) * 100,
    hidden: 0,
  }));
}

export function LeaderboardsTab({
  boardSlug,
  createTrigger,
  onSelectBoardSlug,
  notify,
  onChanged,
  onOpenPublicPath,
}: LeaderboardsTabProps) {
  const now = useNow();
  const [boards, setBoards] = useState<AdminBoard[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [search, setSearch] = useState("");
  const [confirmDeleteSlug, setConfirmDeleteSlug] = useState<string | null>(null);

  // Create Leaderboard state
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [newSubtitle, setNewSubtitle] = useState("");
  const [newPoolUsd, setNewPoolUsd] = useState("10000");
  const [newPartner, setNewPartner] = useState("stake");
  const [newPartnerUrl, setNewPartnerUrl] = useState("https://stake.com/?c=KDEENOFF");
  const [newAvatarStyle, setNewAvatarStyle] = useState("kdeenoff");
  const [newBadge, setNewBadge] = useState("");
  const [newPromoCode, setNewPromoCode] = useState("KDEENOFF");
  const [newSortOrder, setNewSortOrder] = useState("0");
  const [newSpotPreset, setNewSpotPreset] = useState<InitialSpotPreset>("top10");
  const [newShowInDrawer, setNewShowInDrawer] = useState(true);
  const [newShowOnHome, setNewShowOnHome] = useState(true);
  const [newIsDemo, setNewIsDemo] = useState(false);
  const [newStartsAt, setNewStartsAt] = useState(() => toLocalISO(Date.now()));
  const [newEndsAt, setNewEndsAt] = useState(() => toLocalISO(Date.now() + 14 * 86400_000));

  // Race Studio state
  const [studioTab, setStudioTab] = useState<StudioSubTab>("players");
  const [detail, setDetail] = useState<AdminBoardDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Players state
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerDrafts, setPlayerDrafts] = useState<Record<number, PlayerDraft>>({});
  const [savingPlayerId, setSavingPlayerId] = useState<number | null>(null);
  const [confirmDeletePlayerId, setConfirmDeletePlayerId] = useState<number | null>(null);
  const [quickUser, setQuickUser] = useState("");
  const [quickWagerUsd, setQuickWagerUsd] = useState("");
  const [quickPrizeUsd, setQuickPrizeUsd] = useState("");
  const [quickGrowth, setQuickGrowth] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);

  // CSV Import state
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvMode, setCsvMode] = useState<"merge" | "replace">("merge");
  const [importingCsv, setImportingCsv] = useState(false);

  // 72h Growth Inspector state
  const [growthInspectId, setGrowthInspectId] = useState<number | null>(null);

  // Spot Prizes state
  const [spotCount, setSpotCount] = useState(15);
  const [spotDrafts, setSpotDrafts] = useState<SpotDraft[]>([]);
  const [spotsDirty, setSpotsDirty] = useState(false);
  const [savingSpots, setSavingSpots] = useState(false);

  // Race Settings form state
  const [cfgTitle, setCfgTitle] = useState("");
  const [cfgNewSlug, setCfgNewSlug] = useState("");
  const [cfgSubtitle, setCfgSubtitle] = useState("");
  const [cfgPoolUsd, setCfgPoolUsd] = useState("0");
  const [cfgPartner, setCfgPartner] = useState("stake");
  const [cfgPartnerUrl, setCfgPartnerUrl] = useState("");
  const [cfgBadge, setCfgBadge] = useState("");
  const [cfgPromoCode, setCfgPromoCode] = useState("");
  const [cfgSortOrder, setCfgSortOrder] = useState("0");
  const [cfgShowInDrawer, setCfgShowInDrawer] = useState(true);
  const [cfgShowOnHome, setCfgShowOnHome] = useState(true);
  const [cfgIsDemo, setCfgIsDemo] = useState(false);
  const [cfgStartsAt, setCfgStartsAt] = useState("");
  const [cfgEndsAt, setCfgEndsAt] = useState("");
  const [cfgAvatarStyle, setCfgAvatarStyle] = useState("kdeenoff");
  const [cfgHidden, setCfgHidden] = useState(false);
  const [cfgAutoRank, setCfgAutoRank] = useState(true);
  const [cfgAutoHiddenRank, setCfgAutoHiddenRank] = useState("25");
  const [cfgGrowthEnabled, setCfgGrowthEnabled] = useState(false);
  const [cfgGrowthPct, setCfgGrowthPct] = useState("3");
  const [cfgGrowthHours, setCfgGrowthHours] = useState("12");
  const [savingCfg, setSavingCfg] = useState(false);

  const lastTriggerRef = useRef(createTrigger);

  const loadBoards = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await adminApi<{ boards?: AdminBoard[] }>("/api/admin/leaderboards");
      setBoards(res.boards || []);
    } catch (err) {
      notify(`Failed to load leaderboards: ${errorCode(err)}`, "error");
    } finally {
      setLoadingList(false);
    }
  }, [notify]);

  const hydrateDetail = useCallback((d: AdminBoardDetail) => {
    setDetail(d);
    const pMap: Record<number, PlayerDraft> = {};
    for (const p of d.players) {
      pMap[p.id] = {
        username: p.username || "",
        wageredUsd: centsToUsdInput(p.wagered_cents),
        prizeUsd: centsToUsdInput(p.prize_cents),
        wagGrowthEnabled: Boolean(p.wag_growth_enabled),
        wagGrowthPct: p.wag_growth_pct != null ? String(p.wag_growth_pct) : "",
        wagGrowthHours: p.wag_growth_hours != null ? String(p.wag_growth_hours) : "",
      };
    }
    setPlayerDrafts(pMap);

    const maxExistingRank = d.spots.reduce((m, s) => Math.max(m, Number(s.rank) || 0), 15);
    const totalRows = Math.max(15, Math.min(50, maxExistingRank));
    setSpotCount(totalRows);
    const byRank = new Map<number, AdminSpot>();
    for (const s of d.spots) byRank.set(Number(s.rank), s);
    const nextSpots: SpotDraft[] = [];
    for (let r = 1; r <= totalRows; r++) {
      const found = byRank.get(r);
      nextSpots.push({
        rank: r,
        prizeUsd: centsToUsdInput(found?.prize_cents ?? 0),
        hidden: Boolean(found?.hidden),
      });
    }
    setSpotDrafts(nextSpots);
    setSpotsDirty(false);

    const b = d.board;
    setCfgTitle(b.title || "");
    setCfgNewSlug(b.slug || "");
    setCfgSubtitle(b.subtitle || "");
    setCfgPoolUsd(centsToUsdInput(b.prize_pool_cents));
    setCfgPartner(b.partner || "stake");
    setCfgPartnerUrl(b.partner_signup_url || "");
    setCfgBadge(b.badge || "");
    setCfgPromoCode(b.promo_code || "");
    setCfgSortOrder(String(Number(b.sort_order) || 0));
    setCfgShowInDrawer(b.show_in_drawer !== 0);
    setCfgShowOnHome(b.show_on_home !== 0);
    setCfgIsDemo(Boolean(b.is_demo));
    setCfgStartsAt(toLocalISO(b.starts_at));
    setCfgEndsAt(toLocalISO(b.ends_at));
    setCfgAvatarStyle(normalizeAdminAvatarStyle(b.avatar_style));
    setCfgHidden(Boolean(b.hidden));
    setCfgAutoRank(Boolean(b.auto_rank_by_wagered));
    setCfgAutoHiddenRank(String(b.auto_hidden_above_rank ?? 25));
    setCfgGrowthEnabled(Boolean(b.auto_wager_growth_enabled));
    setCfgGrowthPct(String(b.auto_wager_growth_pct ?? 3));
    const hrs = Math.max(
      0.5,
      Math.round(((Number(b.auto_wager_growth_interval_ms) || 43_200_000) / 3_600_000) * 10) / 10,
    );
    setCfgGrowthHours(String(hrs));
  }, []);

  const loadDetail = useCallback(
    async (slug: string, silent = false) => {
      if (!silent) setLoadingDetail(true);
      try {
        const res = await adminApi<AdminBoardDetail>(
          `/api/admin/leaderboards/${encodeURIComponent(slug)}`,
        );
        hydrateDetail(res);
      } catch (err) {
        notify(`Failed to load board "${slug}": ${errorCode(err)}`, "error");
        onSelectBoardSlug(null);
      } finally {
        if (!silent) setLoadingDetail(false);
      }
    },
    [hydrateDetail, notify, onSelectBoardSlug],
  );

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  useEffect(() => {
    if (boardSlug) {
      setConfirmDeletePlayerId(null);
      setGrowthInspectId(null);
      void loadDetail(boardSlug);
    } else {
      setDetail(null);
    }
  }, [boardSlug, loadDetail]);

  useEffect(() => {
    if (createTrigger > lastTriggerRef.current) {
      lastTriggerRef.current = createTrigger;
      onSelectBoardSlug(null);
      setCreateOpen(true);
    }
  }, [createTrigger, onSelectBoardSlug]);

  const counts = useMemo(() => {
    let active = 0;
    let hidden = 0;
    let ended = 0;
    let archived = 0;
    for (const b of boards) {
      if (b.archived) {
        archived += 1;
      } else {
        if (b.hidden) hidden += 1;
        if ((Number(b.ends_at) || 0) <= now) ended += 1;
        else active += 1;
      }
    }
    return { all: boards.length, active, hidden, ended, archived };
  }, [boards, now]);

  const filteredBoards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return boards.filter((b) => {
      if (filter === "archived" && !b.archived) return false;
      if (filter === "active" && (b.archived || (Number(b.ends_at) || 0) <= now)) return false;
      if (filter === "hidden" && (!b.hidden || b.archived)) return false;
      if (filter === "ended" && (b.archived || (Number(b.ends_at) || 0) > now)) return false;
      if (q) {
        const hay = `${b.title} ${b.slug} ${b.partner || ""} ${b.subtitle || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [boards, filter, search, now]);

  const applyDurationPreset = (days: number) => {
    const start = fromLocalISO(newStartsAt) ?? Date.now();
    setNewStartsAt(toLocalISO(start));
    setNewEndsAt(toLocalISO(start + days * 86_400_000));
  };

  const handleCreateBoard = async (e: FormEvent) => {
    e.preventDefault();
    const cleanTitle = newTitle.trim();
    if (!cleanTitle) {
      notify("Leaderboard title is required", "error");
      return;
    }
    const startsAt = fromLocalISO(newStartsAt) ?? Date.now();
    const endsAt = fromLocalISO(newEndsAt) ?? startsAt + 14 * 86_400_000;
    if (endsAt <= startsAt) {
      notify("End time must be after start time", "error");
      return;
    }
    const poolCents = usdInputToCents(newPoolUsd);
    const spots = buildInitialSpots(newSpotPreset, poolCents);
    setCreating(true);
    try {
      const autoSlug = slugifyInput(cleanTitle);
      const effectiveSlug = slugTouched ? newSlug : autoSlug.length >= 2 ? autoSlug : "";
      const res = await adminApi<{ ok: boolean; slug: string }>("/api/admin/leaderboards", {
        method: "POST",
        body: {
          title: cleanTitle,
          slug: effectiveSlug || undefined,
          subtitle: newSubtitle.trim() || null,
          prize_pool_cents: poolCents,
          partner: newPartner.trim() || "stake",
          partner_signup_url: newPartnerUrl.trim() || "https://stake.com/?c=KDEENOFF",
          avatar_style: newAvatarStyle,
          badge: newBadge.trim(),
          promo_code: newPromoCode.trim(),
          sort_order: Math.floor(Number(newSortOrder) || 0),
          show_in_drawer: newShowInDrawer,
          show_on_home: newShowOnHome,
          is_demo: newIsDemo,
          starts_at: startsAt,
          ends_at: endsAt,
          spots,
        },
      });
      setNewTitle("");
      setNewSlug("");
      setSlugTouched(false);
      setNewSubtitle("");
      setNewBadge("");
      setNewIsDemo(false);
      setCreateOpen(false);
      await loadBoards();
      onChanged();
      notify(`Created leaderboard "${cleanTitle}"`, "success");
      onSelectBoardSlug(res.slug);
    } catch (err) {
      notify(`Create failed: ${errorCode(err)}`, "error");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleBoardHidden = async (b: AdminBoard) => {
    setBusyAction(`hide:${b.slug}`);
    try {
      await adminApi(`/api/admin/leaderboards/${encodeURIComponent(b.slug)}`, {
        method: "PATCH",
        body: { hidden: !b.hidden },
      });
      await loadBoards();
      if (boardSlug === b.slug) await loadDetail(b.slug, true);
      onChanged();
      notify(b.hidden ? `"${b.title}" is now visible` : `"${b.title}" hidden from public`, "info");
    } catch (err) {
      notify(`Update failed: ${errorCode(err)}`, "error");
    } finally {
      setBusyAction(null);
    }
  };

  const handleDuplicateBoard = async (b: AdminBoard) => {
    setBusyAction(`dup:${b.slug}`);
    try {
      const res = await adminApi<{ ok: boolean; slug: string }>(
        `/api/admin/leaderboards/${encodeURIComponent(b.slug)}/duplicate`,
        { method: "POST", body: {} },
      );
      await loadBoards();
      onChanged();
      notify(`Duplicated "${b.title}" as hidden draft (${res.slug})`, "success");
    } catch (err) {
      notify(`Duplicate failed: ${errorCode(err)}`, "error");
    } finally {
      setBusyAction(null);
    }
  };

  const handleArchiveToggle = async (b: AdminBoard) => {
    const endpoint = b.archived ? "unarchive" : "archive";
    setBusyAction(`arch:${b.slug}`);
    try {
      await adminApi(`/api/admin/leaderboards/${encodeURIComponent(b.slug)}/${endpoint}`, {
        method: "POST",
        body: {},
      });
      await loadBoards();
      if (boardSlug === b.slug) await loadDetail(b.slug, true);
      onChanged();
      notify(b.archived ? `Restored "${b.title}"` : `Archived "${b.title}"`, "info");
    } catch (err) {
      notify(`Action failed: ${errorCode(err)}`, "error");
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteBoard = async (b: AdminBoard) => {
    setBusyAction(`del:${b.slug}`);
    try {
      await adminApi(`/api/admin/leaderboards/${encodeURIComponent(b.slug)}`, {
        method: "DELETE",
      });
      setConfirmDeleteSlug(null);
      if (boardSlug === b.slug) onSelectBoardSlug(null);
      await loadBoards();
      onChanged();
      notify(`Deleted leaderboard "${b.title}"`, "success");
    } catch (err) {
      notify(`Delete failed: ${errorCode(err)}`, "error");
    } finally {
      setBusyAction(null);
    }
  };

  /* ───────────── Studio Actions ───────────── */

  const handleStudioAutoRank = async () => {
    if (!boardSlug) return;
    setBusyAction("auto-rank");
    try {
      const res = await adminApi<{ count?: number }>(
        `/api/admin/leaderboards/${encodeURIComponent(boardSlug)}/players/auto-rank`,
        { method: "POST", body: {} },
      );
      await loadDetail(boardSlug, true);
      await loadBoards();
      onChanged();
      notify(`Ranked ${res.count ?? 0} players by wager volume`, "success");
    } catch (err) {
      notify(`Auto-rank failed: ${errorCode(err)}`, "error");
    } finally {
      setBusyAction(null);
    }
  };

  const handleStudioApplyGrowth = async () => {
    if (!boardSlug) return;
    setBusyAction("growth-tick");
    try {
      const res = await adminApi<{ tickCount?: number }>(
        `/api/admin/leaderboards/${encodeURIComponent(boardSlug)}/players/apply-wager-growth`,
        { method: "POST", body: {} },
      );
      await loadDetail(boardSlug, true);
      await loadBoards();
      onChanged();
      notify(
        res.tickCount
          ? `Applied ${res.tickCount} scheduled wager growth ticks`
          : "No players had due growth ticks right now",
        "info",
      );
    } catch (err) {
      notify(`Growth tick failed: ${errorCode(err)}`, "error");
    } finally {
      setBusyAction(null);
    }
  };

  const handleQuickAddPlayer = async (e: FormEvent) => {
    e.preventDefault();
    if (!boardSlug) return;
    const username = quickUser.trim();
    if (!username) {
      notify("Player username is required", "error");
      return;
    }
    setAddingPlayer(true);
    try {
      await adminApi(`/api/admin/leaderboards/${encodeURIComponent(boardSlug)}/players`, {
        method: "POST",
        body: {
          username,
          wagered_cents: usdInputToCents(quickWagerUsd),
          prize_cents: usdInputToCents(quickPrizeUsd),
          wag_growth_enabled: quickGrowth,
        },
      });
      setQuickUser("");
      setQuickWagerUsd("");
      setQuickPrizeUsd("");
      await loadDetail(boardSlug, true);
      await loadBoards();
      onChanged();
      notify(`Added player "${username}"`, "success");
    } catch (err) {
      notify(`Failed to add player: ${errorCode(err)}`, "error");
    } finally {
      setAddingPlayer(false);
    }
  };

  const setPlayerField = (id: number, patch: Partial<PlayerDraft>) => {
    setPlayerDrafts((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  };

  const bumpPlayerWager = (id: number, addUsd: number) => {
    setPlayerDrafts((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      const nextCents = usdInputToCents(cur.wageredUsd) + Math.round(addUsd * 100);
      return { ...prev, [id]: { ...cur, wageredUsd: centsToUsdInput(nextCents) } };
    });
  };

  const isPlayerDirty = (p: AdminPlayer): boolean => {
    const d = playerDrafts[p.id];
    if (!d) return false;
    if (d.username.trim() !== (p.username || "")) return true;
    if (usdInputToCents(d.wageredUsd) !== (Number(p.wagered_cents) || 0)) return true;
    if (usdInputToCents(d.prizeUsd) !== (Number(p.prize_cents) || 0)) return true;
    if (d.wagGrowthEnabled !== Boolean(p.wag_growth_enabled)) return true;
    const origPct = p.wag_growth_pct != null ? String(p.wag_growth_pct) : "";
    const origHrs = p.wag_growth_hours != null ? String(p.wag_growth_hours) : "";
    if (d.wagGrowthPct.trim() !== origPct) return true;
    if (d.wagGrowthHours.trim() !== origHrs) return true;
    return false;
  };

  const handleSavePlayer = async (p: AdminPlayer) => {
    if (!boardSlug) return;
    const d = playerDrafts[p.id];
    if (!d) return;
    setSavingPlayerId(p.id);
    try {
      const payload: Record<string, unknown> = {
        username: d.username.trim() || p.username,
        wagered_cents: usdInputToCents(d.wageredUsd),
        prize_cents: usdInputToCents(d.prizeUsd),
        wag_growth_enabled: d.wagGrowthEnabled,
      };
      if (d.wagGrowthPct.trim() !== "") {
        payload.wag_growth_pct = Number(d.wagGrowthPct);
      }
      if (d.wagGrowthHours.trim() !== "") {
        payload.wag_growth_hours = Number(d.wagGrowthHours);
      }
      await adminApi(
        `/api/admin/leaderboards/${encodeURIComponent(boardSlug)}/players/${p.id}`,
        { method: "PATCH", body: payload },
      );
      await loadDetail(boardSlug, true);
      await loadBoards();
      onChanged();
      notify(`Saved "${d.username.trim() || p.username}"`, "success");
    } catch (err) {
      notify(`Save failed: ${errorCode(err)}`, "error");
    } finally {
      setSavingPlayerId(null);
    }
  };

  const handleDeletePlayer = async (p: AdminPlayer) => {
    if (!boardSlug) return;
    setSavingPlayerId(p.id);
    try {
      await adminApi(
        `/api/admin/leaderboards/${encodeURIComponent(boardSlug)}/players/${p.id}`,
        { method: "DELETE" },
      );
      setConfirmDeletePlayerId(null);
      if (growthInspectId === p.id) setGrowthInspectId(null);
      await loadDetail(boardSlug, true);
      await loadBoards();
      onChanged();
      notify(`Removed "${p.username}"`, "info");
    } catch (err) {
      notify(`Delete failed: ${errorCode(err)}`, "error");
    } finally {
      setSavingPlayerId(null);
    }
  };

  const handleMovePlayer = async (index: number, delta: -1 | 1) => {
    if (!boardSlug || !detail) return;
    const list = detail.players.slice();
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const [moved] = list.splice(index, 1);
    list.splice(target, 0, moved);
    const order = list.map((item) => item.id);
    setBusyAction("reorder");
    try {
      await adminApi(
        `/api/admin/leaderboards/${encodeURIComponent(boardSlug)}/players/reorder`,
        {
          method: "POST",
          body: { order, disable_auto_rank: true },
        },
      );
      await loadDetail(boardSlug, true);
      onChanged();
      notify("Updated manual rank order", "info");
    } catch (err) {
      notify(`Reorder failed: ${errorCode(err)}`, "error");
    } finally {
      setBusyAction(null);
    }
  };

  const handleCsvFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result || ""));
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleImportCsv = async () => {
    if (!boardSlug || !csvText.trim()) return;
    setImportingCsv(true);
    try {
      const res = await adminApi<{
        imported?: number;
        created?: number;
        updated?: number;
        mode?: string;
      }>(`/api/admin/leaderboards/${encodeURIComponent(boardSlug)}/players/import-csv`, {
        method: "POST",
        body: { csv: csvText, mode: csvMode },
      });
      setCsvText("");
      setCsvOpen(false);
      await loadDetail(boardSlug, true);
      await loadBoards();
      onChanged();
      const summary =
        csvMode === "replace"
          ? `Replaced player list with ${res.imported ?? 0} players`
          : `Imported ${res.imported ?? 0} players (${res.created ?? 0} added, ${res.updated ?? 0} updated)`;
      notify(summary, "success");
    } catch (err) {
      notify(`CSV import failed: ${errorCode(err)}`, "error");
    } finally {
      setImportingCsv(false);
    }
  };

  const handleExportPlayersCsv = () => {
    if (!detail) return;
    const lines = [
      "rank,username,wagered_usd,prize_usd,wag_growth_enabled",
      ...detail.players.map((p, idx) =>
        [
          p.rank ?? idx + 1,
          csvEscape(p.username),
          ((Number(p.wagered_cents) || 0) / 100).toFixed(2),
          ((Number(p.prize_cents) || 0) / 100).toFixed(2),
          p.wag_growth_enabled ? 1 : 0,
        ].join(","),
      ),
    ];
    downloadTextFile(`${detail.board.slug}-players.csv`, lines.join("\n"));
    notify(`Exported ${detail.players.length} players`, "info");
  };

  /* ───────────── Spot Prizes Helpers ───────────── */

  const applySpotPreset = (weights: number[]) => {
    if (!detail) return;
    const poolCents = Number(detail.board.prize_pool_cents) || 1_000_000;
    const totalRows = Math.max(spotCount, weights.length);
    setSpotCount(totalRows);
    const next: SpotDraft[] = [];
    for (let r = 1; r <= totalRows; r++) {
      const w = weights[r - 1] || 0;
      const cents = Math.round((poolCents * w) / 100) * 100;
      next.push({
        rank: r,
        prizeUsd: centsToUsdInput(cents),
        hidden: false,
      });
    }
    setSpotDrafts(next);
    setSpotsDirty(true);
  };

  const handleSaveAllSpots = async () => {
    if (!boardSlug) return;
    setSavingSpots(true);
    try {
      const payload = spotDrafts.map((s) => ({
        rank: s.rank,
        prize_cents: usdInputToCents(s.prizeUsd),
        hidden: s.hidden,
      }));
      await adminApi(
        `/api/admin/leaderboards/${encodeURIComponent(boardSlug)}/spots`,
        { method: "PUT", body: { spots: payload } },
      );
      await loadDetail(boardSlug, true);
      await loadBoards();
      onChanged();
      notify("Saved spot prize table", "success");
    } catch (err) {
      notify(`Failed to save spots: ${errorCode(err)}`, "error");
    } finally {
      setSavingSpots(false);
    }
  };

  /* ───────────── Race Settings Save ───────────── */

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!boardSlug) return;
    const startsAt = fromLocalISO(cfgStartsAt);
    const endsAt = fromLocalISO(cfgEndsAt);
    if (startsAt && endsAt && endsAt <= startsAt) {
      notify("End date must be after start date", "error");
      return;
    }
    setSavingCfg(true);
    try {
      const hoursNum = Math.max(0.1, Number(cfgGrowthHours) || 12);
      const nextSlugCandidate = slugifyInput(cfgNewSlug);
      const res = await adminApi<{ ok?: boolean; slug?: string }>(
        `/api/admin/leaderboards/${encodeURIComponent(boardSlug)}`,
        {
          method: "PATCH",
          body: {
            title: cfgTitle.trim(),
            new_slug:
              nextSlugCandidate && nextSlugCandidate !== boardSlug
                ? nextSlugCandidate
                : undefined,
            subtitle: cfgSubtitle.trim() || null,
            prize_pool_cents: usdInputToCents(cfgPoolUsd),
            partner: cfgPartner.trim() || "stake",
            partner_signup_url: cfgPartnerUrl.trim(),
            badge: cfgBadge.trim(),
            promo_code: cfgPromoCode.trim(),
            sort_order: Math.floor(Number(cfgSortOrder) || 0),
            show_in_drawer: cfgShowInDrawer,
            show_on_home: cfgShowOnHome,
            is_demo: cfgIsDemo,
            starts_at: startsAt ?? undefined,
            ends_at: endsAt ?? undefined,
            avatar_style: cfgAvatarStyle,
            hidden: cfgHidden,
            auto_rank_by_wagered: cfgAutoRank,
            auto_hidden_above_rank: Math.max(0, Math.floor(Number(cfgAutoHiddenRank) || 0)),
            auto_wager_growth_enabled: cfgGrowthEnabled,
            auto_wager_growth_pct: clampWagerGrowthPct(Number(cfgGrowthPct)),
            auto_wager_growth_interval_ms: clampWagerGrowthIntervalMs(
              Math.round(hoursNum * 3_600_000),
            ),
          },
        },
      );
      const savedSlug = res.slug || boardSlug;
      await loadBoards();
      onChanged();
      notify("Leaderboard settings saved", "success");
      if (savedSlug !== boardSlug) {
        onSelectBoardSlug(savedSlug);
      } else {
        await loadDetail(savedSlug, true);
      }
    } catch (err) {
      notify(`Save failed: ${errorCode(err)}`, "error");
    } finally {
      setSavingCfg(false);
    }
  };

  /* ───────────── Render Mode B: Interactive Race Studio ───────────── */

  if (boardSlug) {
    if (loadingDetail && !detail) {
      return (
        <div className="ad-card ad-panel">
          <p className="ad-muted">Loading Race Studio for "{boardSlug}"…</p>
        </div>
      );
    }
    if (!detail) return null;

    const { board, players } = detail;
    const leftMs = (Number(board.ends_at) || 0) - now;
    const timer = countdown(leftMs);
    const boardTone = board.archived
      ? "muted"
      : board.hidden
        ? "warn"
        : !timer
          ? "muted"
          : "live";
    const boardStatusText = board.archived
      ? "Archived"
      : board.hidden
        ? "Hidden Draft"
        : !timer
          ? "Ended"
          : `Live · ${timer}`;

    const spotPrizeByRank = new Map<number, number>();
    for (const s of spotDrafts) {
      spotPrizeByRank.set(s.rank, usdInputToCents(s.prizeUsd));
    }

    const allocatedSpotCents = spotDrafts.reduce(
      (sum, s) => sum + usdInputToCents(s.prizeUsd),
      0,
    );
    const poolCents = Number(board.prize_pool_cents) || 0;
    const poolPct = poolCents > 0 ? Math.min(100, Math.round((allocatedSpotCents / poolCents) * 100)) : 0;

    const visiblePlayers = players.filter((p) => {
      const q = playerSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        p.username.toLowerCase().includes(q) ||
        String(p.rank || "").includes(q)
      );
    });

    const inspectedPlayer =
      growthInspectId != null ? players.find((p) => p.id === growthInspectId) || null : null;
    const inspectedDraft = inspectedPlayer ? playerDrafts[inspectedPlayer.id] : null;
    const schedulePreview =
      inspectedPlayer && inspectedDraft
        ? buildWagerGrowthSchedule({
            playerId: inspectedPlayer.id,
            boardId: board.id,
            startWageredCents: usdInputToCents(inspectedDraft.wageredUsd),
            targetPct:
              inspectedDraft.wagGrowthPct.trim() !== ""
                ? Number(inspectedDraft.wagGrowthPct)
                : Number(board.auto_wager_growth_pct) || 3,
            intervalMs:
              inspectedDraft.wagGrowthHours.trim() !== ""
                ? Number(inspectedDraft.wagGrowthHours) * 3_600_000
                : Number(board.auto_wager_growth_interval_ms) || 43_200_000,
            now,
          })
        : [];

    return (
      <div className="ad-stack">
        {/* Studio Header */}
        <div className="ad-card ad-studio-bar">
          <div className="ad-studio-bar__left">
            <button
              type="button"
              className="ad-btn ad-btn--ghost ad-btn--sm"
              onClick={() => onSelectBoardSlug(null)}
            >
              <IconArrowLeft size={15} />
              <span>All Races</span>
            </button>
            <div className="ad-studio-bar__select-wrap">
              <select
                className="ad-select"
                aria-label="Switch leaderboard"
                value={board.slug}
                onChange={(e) => onSelectBoardSlug(e.target.value)}
              >
                {boards.map((b) => (
                  <option key={b.slug} value={b.slug}>
                    {b.title} ({b.slug})
                  </option>
                ))}
              </select>
            </div>
            <span className={`ad-badge ad-badge--${boardTone}`}>{boardStatusText}</span>
            {Boolean(board.is_demo) && (
              <span className="ad-badge ad-badge--warn">DEMO</span>
            )}
            {board.badge?.trim() && (
              <span className="ad-badge ad-badge--info">{board.badge.trim().toUpperCase()}</span>
            )}
            <span className="ad-badge ad-badge--muted">{partnerLabel(board.partner)}</span>
            {board.show_in_drawer !== 0 && (
              <span className="ad-badge ad-badge--muted">Sidebar</span>
            )}
            {board.show_on_home !== 0 && (
              <span className="ad-badge ad-badge--muted">Home</span>
            )}
          </div>

          <div className="ad-studio-bar__right">
            <button
              type="button"
              className="ad-btn ad-btn--secondary ad-btn--sm"
              disabled={busyAction === "growth-tick"}
              onClick={() => void handleStudioApplyGrowth()}
              title="Immediately apply any due scheduled wager growth ticks"
            >
              <IconBolt size={14} />
              <span>{busyAction === "growth-tick" ? "Applying…" : "Growth Tick"}</span>
            </button>
            <button
              type="button"
              className="ad-btn ad-btn--secondary ad-btn--sm"
              disabled={busyAction === "auto-rank"}
              onClick={() => void handleStudioAutoRank()}
              title="Sort and re-rank all players by wagered amount"
            >
              <IconSort size={14} />
              <span>{busyAction === "auto-rank" ? "Ranking…" : "Auto-Rank"}</span>
            </button>
            {!board.archived && (
              <button
                type="button"
                className="ad-btn ad-btn--ghost ad-btn--sm"
                onClick={() => onOpenPublicPath(boardHref(board.slug))}
              >
                <span>Open Live</span>
                <IconExternal size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Studio Sub-navigation + Quick Stats */}
        <div className="ad-toolbar">
          <div className="ad-seg" role="tablist" aria-label="Race Studio sections">
            <button
              type="button"
              role="tab"
              aria-selected={studioTab === "players"}
              className={`ad-seg__btn${studioTab === "players" ? " is-active" : ""}`}
              onClick={() => setStudioTab("players")}
            >
              Players &amp; Wagers ({players.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={studioTab === "spots"}
              className={`ad-seg__btn${studioTab === "spots" ? " is-active" : ""}`}
              onClick={() => setStudioTab("spots")}
            >
              Spot Prizes ({moneyShort(allocatedSpotCents)})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={studioTab === "settings"}
              className={`ad-seg__btn${studioTab === "settings" ? " is-active" : ""}`}
              onClick={() => setStudioTab("settings")}
            >
              Race Settings
            </button>
          </div>

          <div className="ad-studio-metrics">
            <span>
              Pool: <strong>{moneyShort(board.prize_pool_cents)}</strong>
            </span>
            <span>·</span>
            <span>
              Total Wagered:{" "}
              <strong>
                {money(players.reduce((acc, p) => acc + (Number(p.wagered_cents) || 0), 0))}
              </strong>
            </span>
          </div>
        </div>

        {/* Sub-tab 1: Players & Wagers */}
        {studioTab === "players" && (
          <div className="ad-stack">
            {/* Quick Add Bar */}
            <form className="ad-card ad-quick-form" onSubmit={(e) => void handleQuickAddPlayer(e)}>
              <div className="ad-quick-form__field ad-quick-form__field--grow">
                <label className="ad-mini-label">Player Username</label>
                <input
                  type="text"
                  className="ad-input"
                  placeholder="e.g. HighRoller77"
                  value={quickUser}
                  onChange={(e) => setQuickUser(e.target.value)}
                />
              </div>
              <div className="ad-quick-form__field">
                <label className="ad-mini-label">Wagered (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="ad-input"
                  placeholder="2500.00"
                  value={quickWagerUsd}
                  onChange={(e) => setQuickWagerUsd(e.target.value)}
                />
              </div>
              <div className="ad-quick-form__field">
                <label className="ad-mini-label">Override Prize (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="ad-input"
                  placeholder="0 (uses spot)"
                  value={quickPrizeUsd}
                  onChange={(e) => setQuickPrizeUsd(e.target.value)}
                />
              </div>
              <label className="ad-switch-label ad-quick-form__switch">
                <input
                  type="checkbox"
                  checked={quickGrowth}
                  onChange={(e) => setQuickGrowth(e.target.checked)}
                />
                <span>Auto-Growth</span>
              </label>
              <button
                type="submit"
                className="ad-btn ad-btn--primary ad-btn--sm"
                disabled={addingPlayer}
              >
                <IconPlus size={15} />
                <span>{addingPlayer ? "Adding…" : "Add Player"}</span>
              </button>
            </form>

            {/* Filter & CSV Toolbar */}
            <div className="ad-toolbar">
              <div className="ad-search">
                <IconSearch size={15} />
                <input
                  type="search"
                  className="ad-search__input"
                  placeholder="Filter players by username or rank…"
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                />
              </div>
              <div className="ad-toolbar__actions">
                <button
                  type="button"
                  className={`ad-btn ad-btn--secondary ad-btn--sm${csvOpen ? " is-active" : ""}`}
                  onClick={() => setCsvOpen((v) => !v)}
                >
                  <IconUpload size={14} />
                  <span>Import CSV</span>
                </button>
                <button
                  type="button"
                  className="ad-btn ad-btn--ghost ad-btn--sm"
                  disabled={!players.length}
                  onClick={handleExportPlayersCsv}
                >
                  <IconDownload size={14} />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* CSV Import Drawer */}
            {csvOpen && (
              <div className="ad-card ad-panel">
                <div className="ad-panel__head">
                  <div>
                    <h3 className="ad-panel__title">Bulk CSV Player Import</h3>
                    <p className="ad-panel__sub">
                      Format: <code>username, wagered_usd, prize_usd</code> (one player per line)
                    </p>
                  </div>
                  <div className="ad-toolbar__actions">
                    <label className="ad-btn ad-btn--secondary ad-btn--xs" style={{ cursor: "pointer" }}>
                      <IconUpload size={13} />
                      <span>Load .csv file</span>
                      <input
                        type="file"
                        accept=".csv,.txt"
                        hidden
                        onChange={handleCsvFile}
                      />
                    </label>
                    <button
                      type="button"
                      className="ad-btn ad-btn--ghost ad-btn--xs"
                      onClick={() =>
                        setCsvText(
                          "username,wagered_usd,prize_usd\nZeusSpinner,48500,0\nOlympusKing,31200,0\nSpartanbet,19450,0",
                        )
                      }
                    >
                      Insert Sample
                    </button>
                    <button
                      type="button"
                      className="ad-btn ad-btn--ghost ad-btn--xs"
                      onClick={() => setCsvOpen(false)}
                    >
                      <IconClose size={14} />
                    </button>
                  </div>
                </div>
                <div className="ad-form-grid" style={{ marginBottom: 12 }}>
                  <label className="ad-switch-row">
                    <div>
                      <strong>Update existing usernames &amp; add new</strong>
                      <span className="ad-field__hint">Merge CSV rows by username without removing unlisted players.</span>
                    </div>
                    <input
                      type="radio"
                      name="csv-import-mode"
                      checked={csvMode === "merge"}
                      onChange={() => setCsvMode("merge")}
                    />
                  </label>
                  <label className="ad-switch-row">
                    <div>
                      <strong>Replace entire player list</strong>
                      <span className="ad-field__hint">Clear current players on this board and import fresh from CSV.</span>
                    </div>
                    <input
                      type="radio"
                      name="csv-import-mode"
                      checked={csvMode === "replace"}
                      onChange={() => setCsvMode("replace")}
                    />
                  </label>
                </div>
                <textarea
                  className="ad-textarea"
                  rows={5}
                  placeholder={"username,wagered_usd,prize_usd\nPlayerOne,12500,0"}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                />
                <div className="ad-form-foot">
                  <button
                    type="button"
                    className="ad-btn ad-btn--primary ad-btn--sm"
                    disabled={importingCsv || !csvText.trim()}
                    onClick={() => void handleImportCsv()}
                  >
                    <IconCheck size={14} />
                    <span>{importingCsv ? "Importing…" : "Import Players"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* 72h Wager Growth Projection Inspector */}
            {inspectedPlayer && inspectedDraft && (
              <div className="ad-card ad-panel ad-growth-panel">
                <div className="ad-panel__head">
                  <div>
                    <h3 className="ad-panel__title">
                      72-Hour Deterministic Growth Plan · {inspectedPlayer.username}
                    </h3>
                    <p className="ad-panel__sub">
                      Preview matches server-side cron schedule (`buildWagerGrowthSchedule`).
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ad-btn ad-btn--ghost ad-btn--xs"
                    onClick={() => setGrowthInspectId(null)}
                  >
                    <IconClose size={15} />
                  </button>
                </div>

                <div className="ad-growth-controls">
                  <label className="ad-field">
                    <span className="ad-field__label">Target Growth % per Tick</span>
                    <input
                      type="number"
                      min="0"
                      max="500"
                      step="1"
                      className="ad-input"
                      placeholder={`Board default (${board.auto_wager_growth_pct ?? 3}%)`}
                      value={inspectedDraft.wagGrowthPct}
                      onChange={(e) =>
                        setPlayerField(inspectedPlayer.id, { wagGrowthPct: e.target.value })
                      }
                    />
                  </label>
                  <label className="ad-field">
                    <span className="ad-field__label">Tick Interval (Hours)</span>
                    <input
                      type="number"
                      min="0.1"
                      max="720"
                      step="0.5"
                      className="ad-input"
                      placeholder={`Board default (${Math.round(((Number(board.auto_wager_growth_interval_ms) || 43_200_000) / 3_600_000) * 10) / 10}h)`}
                      value={inspectedDraft.wagGrowthHours}
                      onChange={(e) =>
                        setPlayerField(inspectedPlayer.id, { wagGrowthHours: e.target.value })
                      }
                    />
                  </label>
                  <div className="ad-growth-controls__cta">
                    <button
                      type="button"
                      className="ad-btn ad-btn--primary ad-btn--sm"
                      disabled={savingPlayerId === inspectedPlayer.id}
                      onClick={() => void handleSavePlayer(inspectedPlayer)}
                    >
                      <IconCheck size={14} />
                      <span>Save Growth Config</span>
                    </button>
                  </div>
                </div>

                {schedulePreview.length > 0 ? (
                  <div className="ad-growth-grid">
                    <div className="ad-growth-chart">
                      {(() => {
                        const startCents = usdInputToCents(inspectedDraft.wageredUsd);
                        const pts = [
                          { at_ms: now, wagered_cents: startCents, pct: 0 },
                          ...schedulePreview,
                        ];
                        const minW = Math.min(...pts.map((x) => x.wagered_cents));
                        const maxW = Math.max(minW + 100, ...pts.map((x) => x.wagered_cents));
                        const poly = pts
                          .map((pt, i) => {
                            const x = Math.round(16 + (i / Math.max(1, pts.length - 1)) * 428);
                            const y = Math.round(
                              132 - ((pt.wagered_cents - minW) / (maxW - minW)) * 104,
                            );
                            return `${x},${y}`;
                          })
                          .join(" ");
                        const finalWager = pts[pts.length - 1].wagered_cents;
                        return (
                          <>
                            <div className="ad-growth-chart__summary">
                              <span>
                                Now: <strong>{money(startCents)}</strong>
                              </span>
                              <span>→</span>
                              <span>
                                +72h Projected: <strong>{money(finalWager)}</strong> (
                                {schedulePreview.length} ticks)
                              </span>
                            </div>
                            <svg viewBox="0 0 460 148" className="ad-chart__svg">
                              <line x1={16} x2={444} y1={132} y2={132} className="ad-chart__grid" />
                              <line x1={16} x2={444} y1={80} y2={80} className="ad-chart__grid" />
                              <line x1={16} x2={444} y1={28} y2={28} className="ad-chart__grid" />
                              <polyline
                                fill="none"
                                stroke="var(--accent)"
                                strokeWidth="3"
                                points={poly}
                              />
                              {pts.map((pt, i) => {
                                const x = Math.round(
                                  16 + (i / Math.max(1, pts.length - 1)) * 428,
                                );
                                const y = Math.round(
                                  132 - ((pt.wagered_cents - minW) / (maxW - minW)) * 104,
                                );
                                return (
                                  <circle
                                    key={i}
                                    cx={x}
                                    cy={y}
                                    r={3.5}
                                    fill="var(--cta)"
                                  />
                                );
                              })}
                            </svg>
                          </>
                        );
                      })()}
                    </div>
                    <div className="ad-growth-ticks">
                      <table className="ad-table ad-table--compact">
                        <thead>
                          <tr>
                            <th>Tick</th>
                            <th>Scheduled At</th>
                            <th>Step</th>
                            <th>Projected Wager</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schedulePreview.slice(0, 12).map((t, idx) => (
                            <tr key={t.at_ms}>
                              <td>#{idx + 1}</td>
                              <td>{fmtShortDate(t.at_ms)}</td>
                              <td>
                                <span className="ad-badge ad-badge--info">+{t.pct}%</span>
                              </td>
                              <td>
                                <strong>{money(t.wagered_cents)}</strong>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="ad-muted">
                    Increase growth % or shorten tick interval to see ticks within 72h.
                  </p>
                )}
              </div>
            )}

            {/* Players Table */}
            <div className="ad-card ad-table-card">
              <div className="ad-table-wrap">
                <table className="ad-table">
                  <thead>
                    <tr>
                      <th style={{ width: 92 }}>Rank</th>
                      <th>Player</th>
                      <th>Wagered (USD)</th>
                      <th>Prize Override (USD)</th>
                      <th>Auto-Growth</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePlayers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="ad-table__empty">
                          {players.length === 0
                            ? "No players on this leaderboard yet. Use the quick-add bar above or import CSV."
                            : "No players match your search."}
                        </td>
                      </tr>
                    ) : (
                      visiblePlayers.map((p) => {
                        const fullIdx = players.findIndex((x) => x.id === p.id);
                        const rankNum = p.rank ?? fullIdx + 1;
                        const d = playerDrafts[p.id];
                        if (!d) return null;
                        const dirty = isPlayerDirty(p);
                        const avatar = playerAvatarPreview(p, board.avatar_style);
                        const spotFallback = spotPrizeByRank.get(rankNum) || 0;

                        return (
                          <tr key={p.id} className={dirty ? "is-dirty" : undefined}>
                            <td className="ad-nowrap">
                              <div className="ad-rank-cell">
                                <span className={`ad-rank-pill ad-rank-pill--${rankNum <= 3 ? rankNum : "n"}`}>
                                  #{rankNum}
                                </span>
                                {!playerSearch && (
                                  <span className="ad-rank-arrows">
                                    <button
                                      type="button"
                                      className="ad-icon-btn"
                                      disabled={fullIdx <= 0 || busyAction === "reorder"}
                                      title="Move up"
                                      onClick={() => void handleMovePlayer(fullIdx, -1)}
                                    >
                                      <IconArrowUp size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      className="ad-icon-btn"
                                      disabled={
                                        fullIdx === -1 ||
                                        fullIdx >= players.length - 1 ||
                                        busyAction === "reorder"
                                      }
                                      title="Move down"
                                      onClick={() => void handleMovePlayer(fullIdx, 1)}
                                    >
                                      <IconArrowDown size={13} />
                                    </button>
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="ad-player-edit">
                                {avatar ? (
                                  <img
                                    src={avatar}
                                    alt=""
                                    width={30}
                                    height={30}
                                    className="ad-player-edit__avatar"
                                  />
                                ) : (
                                  <span className="ad-player-edit__avatar ad-player-edit__avatar--ph">
                                    {(d.username[0] || "P").toUpperCase()}
                                  </span>
                                )}
                                <input
                                  type="text"
                                  className="ad-input ad-input--compact"
                                  value={d.username}
                                  onChange={(e) =>
                                    setPlayerField(p.id, { username: e.target.value })
                                  }
                                />
                              </div>
                            </td>
                            <td>
                              <div className="ad-wager-edit">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="ad-input ad-input--compact ad-input--num"
                                  value={d.wageredUsd}
                                  onChange={(e) =>
                                    setPlayerField(p.id, { wageredUsd: e.target.value })
                                  }
                                />
                                <div className="ad-bump-group">
                                  <button
                                    type="button"
                                    className="ad-bump"
                                    onClick={() => bumpPlayerWager(p.id, 100)}
                                  >
                                    +$100
                                  </button>
                                  <button
                                    type="button"
                                    className="ad-bump"
                                    onClick={() => bumpPlayerWager(p.id, 1000)}
                                  >
                                    +$1K
                                  </button>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="ad-prize-edit">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="ad-input ad-input--compact ad-input--num"
                                  value={d.prizeUsd}
                                  onChange={(e) =>
                                    setPlayerField(p.id, { prizeUsd: e.target.value })
                                  }
                                />
                                {usdInputToCents(d.prizeUsd) === 0 && spotFallback > 0 && (
                                  <span className="ad-subtext">
                                    Spot: {moneyShort(spotFallback)}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="ad-nowrap">
                              <div className="ad-growth-cell">
                                <label className="ad-switch-label">
                                  <input
                                    type="checkbox"
                                    checked={d.wagGrowthEnabled}
                                    onChange={(e) =>
                                      setPlayerField(p.id, {
                                        wagGrowthEnabled: e.target.checked,
                                      })
                                    }
                                  />
                                  <span>{d.wagGrowthEnabled ? "On" : "Off"}</span>
                                </label>
                                <button
                                  type="button"
                                  className={`ad-btn ad-btn--ghost ad-btn--xs${growthInspectId === p.id ? " is-active" : ""}`}
                                  onClick={() =>
                                    setGrowthInspectId(growthInspectId === p.id ? null : p.id)
                                  }
                                >
                                  72h Plan
                                </button>
                              </div>
                            </td>
                            <td className="ad-nowrap" style={{ textAlign: "right" }}>
                              <div className="ad-row-actions">
                                <button
                                  type="button"
                                  className={`ad-btn ${dirty ? "ad-btn--primary" : "ad-btn--secondary"} ad-btn--xs`}
                                  disabled={!dirty || savingPlayerId === p.id}
                                  onClick={() => void handleSavePlayer(p)}
                                >
                                  <IconCheck size={13} />
                                  <span>{savingPlayerId === p.id ? "…" : "Save"}</span>
                                </button>
                                {confirmDeletePlayerId === p.id ? (
                                  <>
                                    <button
                                      type="button"
                                      className="ad-btn ad-btn--danger ad-btn--xs"
                                      disabled={savingPlayerId === p.id}
                                      onClick={() => void handleDeletePlayer(p)}
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      type="button"
                                      className="ad-btn ad-btn--ghost ad-btn--xs"
                                      onClick={() => setConfirmDeletePlayerId(null)}
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    className="ad-btn ad-btn--ghost ad-btn--xs"
                                    title="Remove player"
                                    onClick={() => setConfirmDeletePlayerId(p.id)}
                                  >
                                    <IconTrash size={13} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Sub-tab 2: Spot Prizes */}
        {studioTab === "spots" && (
          <div className="ad-stack">
            {/* Podium Visual Cards */}
            <div className="ad-podium-preview">
              {[1, 2, 3].map((r) => {
                const spot = spotDrafts.find((s) => s.rank === r);
                const holder = players.find((p, i) => (p.rank ?? i + 1) === r);
                return (
                  <div key={r} className={`ad-card ad-podium-card ad-podium-card--${r}`}>
                    <span className="ad-podium-card__place">
                      {r === 1 ? "#1 Champion" : r === 2 ? "#2 Runner-Up" : "#3 Third Place"}
                    </span>
                    <div className="ad-podium-card__prize">
                      {moneyShort(usdInputToCents(spot?.prizeUsd || "0"))}
                    </div>
                    <span className="ad-podium-card__holder">
                      {holder ? `${holder.username} · ${money(holder.wagered_cents)}` : "Unclaimed slot"}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Allocation Bar & Auto-Split Presets */}
            <div className="ad-card ad-panel">
              <div className="ad-panel__head">
                <div>
                  <h3 className="ad-panel__title">Prize Pool Distribution</h3>
                  <p className="ad-panel__sub">
                    Allocated <strong>{money(allocatedSpotCents)}</strong> of{" "}
                    <strong>{money(poolCents)}</strong> headline pool ({poolPct}%)
                  </p>
                </div>
                <div className="ad-toolbar__actions">
                  <button
                    type="button"
                    className="ad-btn ad-btn--secondary ad-btn--xs"
                    onClick={() => applySpotPreset(TOP_10_WEIGHTS)}
                  >
                    Auto-Split Top 10
                  </button>
                  <button
                    type="button"
                    className="ad-btn ad-btn--secondary ad-btn--xs"
                    onClick={() => applySpotPreset(TOP_5_WEIGHTS)}
                  >
                    Auto-Split Top 5
                  </button>
                  <button
                    type="button"
                    className="ad-btn ad-btn--secondary ad-btn--xs"
                    onClick={() => applySpotPreset(TOP_3_WEIGHTS)}
                  >
                    Top 3 Podium
                  </button>
                  <button
                    type="button"
                    className="ad-btn ad-btn--ghost ad-btn--xs"
                    onClick={() => applySpotPreset([])}
                  >
                    Clear All
                  </button>
                  <button
                    type="button"
                    className="ad-btn ad-btn--primary ad-btn--sm"
                    disabled={savingSpots}
                    onClick={() => void handleSaveAllSpots()}
                  >
                    <IconCheck size={14} />
                    <span>
                      {savingSpots ? "Saving…" : spotsDirty ? "Save Spot Prizes*" : "Save Spot Prizes"}
                    </span>
                  </button>
                </div>
              </div>

              <div className="ad-race-bar__track" style={{ marginBottom: 16 }}>
                <span className="ad-race-bar__fill" style={{ width: `${poolPct}%` }} />
              </div>

              <div className="ad-spots-grid">
                {spotDrafts.map((spot, idx) => (
                  <div key={spot.rank} className="ad-spot-item">
                    <span className="ad-spot-item__rank">#{spot.rank}</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="ad-input ad-input--compact ad-input--num"
                      placeholder="0"
                      value={spot.prizeUsd}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSpotDrafts((prev) =>
                          prev.map((s, i) => (i === idx ? { ...s, prizeUsd: val } : s)),
                        );
                        setSpotsDirty(true);
                      }}
                    />
                    <button
                      type="button"
                      className={`ad-icon-btn${spot.hidden ? " is-muted" : ""}`}
                      title={spot.hidden ? "Spot prize hidden on public table" : "Spot prize visible"}
                      onClick={() => {
                        setSpotDrafts((prev) =>
                          prev.map((s, i) => (i === idx ? { ...s, hidden: !s.hidden } : s)),
                        );
                        setSpotsDirty(true);
                      }}
                    >
                      {spot.hidden ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                    </button>
                  </div>
                ))}
              </div>

              {spotCount < 30 && (
                <div className="ad-form-foot" style={{ justifyContent: "space-between" }}>
                  <button
                    type="button"
                    className="ad-btn ad-btn--ghost ad-btn--xs"
                    onClick={() => {
                      const nextMax = Math.min(30, spotCount + 5);
                      const extra: SpotDraft[] = [];
                      for (let r = spotCount + 1; r <= nextMax; r++) {
                        extra.push({ rank: r, prizeUsd: "0", hidden: false });
                      }
                      setSpotCount(nextMax);
                      setSpotDrafts((prev) => [...prev, ...extra]);
                    }}
                  >
                    <IconPlus size={13} />
                    <span>Show 5 More Ranks</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sub-tab 3: Race Settings */}
        {studioTab === "settings" && (
          <form className="ad-stack" onSubmit={(e) => void handleSaveSettings(e)}>
            <div className="ad-card ad-panel">
              <div className="ad-panel__head">
                <div>
                  <h3 className="ad-panel__title">Identity, Partner &amp; Schedule</h3>
                  <p className="ad-panel__sub">
                    Public URL: <code>{boardHref(board.slug)}</code>
                  </p>
                </div>
                <button
                  type="submit"
                  className="ad-btn ad-btn--primary ad-btn--sm"
                  disabled={savingCfg}
                >
                  <IconCheck size={14} />
                  <span>{savingCfg ? "Saving…" : "Save Race Settings"}</span>
                </button>
              </div>

              <div className="ad-form-grid">
                <label className="ad-field">
                  <span className="ad-field__label">Race Title</span>
                  <input
                    type="text"
                    className="ad-input"
                    required
                    value={cfgTitle}
                    onChange={(e) => setCfgTitle(e.target.value)}
                  />
                </label>

                <label className="ad-field">
                  <span className="ad-field__label">URL Slug</span>
                  <input
                    type="text"
                    className="ad-input"
                    placeholder="monthly-10k-race"
                    value={cfgNewSlug}
                    onChange={(e) => setCfgNewSlug(slugifyInput(e.target.value))}
                  />
                </label>

                <label className="ad-field">
                  <span className="ad-field__label">Subtitle / Tagline</span>
                  <input
                    type="text"
                    className="ad-input"
                    placeholder="Optional subtitle shown under headline"
                    value={cfgSubtitle}
                    onChange={(e) => setCfgSubtitle(e.target.value)}
                  />
                </label>

                <label className="ad-field">
                  <span className="ad-field__label">Badge (Blank = Auto)</span>
                  <input
                    type="text"
                    className="ad-input"
                    maxLength={24}
                    placeholder="MONTHLY, WEEKLY, DAILY, VIP"
                    value={cfgBadge}
                    onChange={(e) => setCfgBadge(e.target.value)}
                  />
                </label>

                <label className="ad-field">
                  <span className="ad-field__label">Headline Prize Pool (USD)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="ad-input"
                    value={cfgPoolUsd}
                    onChange={(e) => setCfgPoolUsd(e.target.value)}
                  />
                </label>

                <label className="ad-field">
                  <span className="ad-field__label">Promo Code</span>
                  <input
                    type="text"
                    className="ad-input"
                    maxLength={40}
                    placeholder="KDEENOFF"
                    value={cfgPromoCode}
                    onChange={(e) => setCfgPromoCode(e.target.value)}
                  />
                </label>

                <label className="ad-field">
                  <span className="ad-field__label">Partner Brand Key</span>
                  <input
                    type="text"
                    className="ad-input"
                    placeholder="stake / 500casino"
                    value={cfgPartner}
                    onChange={(e) => setCfgPartner(e.target.value)}
                  />
                </label>

                <label className="ad-field">
                  <span className="ad-field__label">Sort Order</span>
                  <input
                    type="number"
                    step="1"
                    className="ad-input"
                    value={cfgSortOrder}
                    onChange={(e) => setCfgSortOrder(e.target.value)}
                  />
                </label>

                <label className="ad-field ad-field--full">
                  <span className="ad-field__label">Partner Signup / Claim URL</span>
                  <input
                    type="url"
                    className="ad-input"
                    placeholder="https://stake.com/?c=KDEENOFF"
                    value={cfgPartnerUrl}
                    onChange={(e) => setCfgPartnerUrl(e.target.value)}
                  />
                </label>

                <label className="ad-field">
                  <span className="ad-field__label">Starts At</span>
                  <input
                    type="datetime-local"
                    className="ad-input"
                    value={cfgStartsAt}
                    onChange={(e) => setCfgStartsAt(e.target.value)}
                  />
                </label>

                <label className="ad-field">
                  <span className="ad-field__label">Ends At</span>
                  <input
                    type="datetime-local"
                    className="ad-input"
                    value={cfgEndsAt}
                    onChange={(e) => setCfgEndsAt(e.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="ad-split-grid">
              <div className="ad-card ad-panel">
                <div className="ad-panel__head">
                  <h3 className="ad-panel__title">Collector Avatars &amp; Ranking Rules</h3>
                </div>
                <div className="ad-stack-sm">
                  <label className="ad-field">
                    <span className="ad-field__label">Player Avatar Style</span>
                    <select
                      className="ad-select"
                      value={cfgAvatarStyle}
                      onChange={(e) => setCfgAvatarStyle(e.target.value)}
                    >
                      <option value="kdeenoff">KDeenOff Monkey Drops (All Editions)</option>
                      <option value="kdeenoff-camo">KDeenOff Street Camo &amp; Patch Pack</option>
                      <option value="kdeenoff-luxe">KDeenOff Luxe Metals &amp; Stone</option>
                      <option value="none">Initials Only (No Avatars)</option>
                    </select>
                  </label>

                  {cfgAvatarStyle !== "none" && (
                    <div className="ad-avatar-sample-strip">
                      {["lucky_ape", "slotking_77", "highroller_x", "crypto_wolf", "moonshot99"].map((seed) => {
                        const q =
                          cfgAvatarStyle === "kdeenoff-luxe"
                            ? "?v=ape3&preset=luxe"
                            : cfgAvatarStyle === "kdeenoff-camo"
                              ? "?v=ape3&preset=camo"
                              : "?v=ape3";
                        return (
                          <img
                            key={seed}
                            src={`/api/leaderboards/avatar/${seed}.svg${q}`}
                            alt=""
                            width={38}
                            height={38}
                            className="ad-avatar-sample"
                          />
                        );
                      })}
                    </div>
                  )}

                  <label className="ad-switch-row">
                    <div>
                      <strong>Auto-Rank Players by Wagered Volume</strong>
                      <span className="ad-field__hint">
                        Automatically re-sorts ranks whenever wagers update.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={cfgAutoRank}
                      onChange={(e) => setCfgAutoRank(e.target.checked)}
                    />
                  </label>

                  <label className="ad-switch-row">
                    <div>
                      <strong>Show in Left Sidebar</strong>
                      <span className="ad-field__hint">
                        Display race card in the persistent left drawer.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={cfgShowInDrawer}
                      onChange={(e) => setCfgShowInDrawer(e.target.checked)}
                    />
                  </label>

                  <label className="ad-switch-row">
                    <div>
                      <strong>Show on Home Page</strong>
                      <span className="ad-field__hint">
                        Include in Home race overview cards and switcher.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={cfgShowOnHome}
                      onChange={(e) => setCfgShowOnHome(e.target.checked)}
                    />
                  </label>

                  <label className="ad-switch-row">
                    <div>
                      <strong>Demo / Test Data</strong>
                      <span className="ad-field__hint">
                        Flags this leaderboard so it can be purged with one click in Overview.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={cfgIsDemo}
                      onChange={(e) => setCfgIsDemo(e.target.checked)}
                    />
                  </label>

                  <label className="ad-switch-row">
                    <div>
                      <strong>Hide Leaderboard from Public Navigation</strong>
                      <span className="ad-field__hint">
                        Keep as draft without archiving or deleting.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={cfgHidden}
                      onChange={(e) => setCfgHidden(e.target.checked)}
                    />
                  </label>

                  <label className="ad-field">
                    <span className="ad-field__label">Hide Ranks Below # (0 = show all)</span>
                    <input
                      type="number"
                      min="0"
                      max="500"
                      className="ad-input"
                      value={cfgAutoHiddenRank}
                      onChange={(e) => setCfgAutoHiddenRank(e.target.value)}
                    />
                  </label>
                </div>
              </div>

              <div className="ad-card ad-panel">
                <div className="ad-panel__head">
                  <h3 className="ad-panel__title">Automated Wager Growth Engine</h3>
                </div>
                <div className="ad-stack-sm">
                  <label className="ad-switch-row">
                    <div>
                      <strong>Enable Board-Wide Scheduled Growth</strong>
                      <span className="ad-field__hint">
                        Applies deterministic growth ticks to players marked Growth=On.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={cfgGrowthEnabled}
                      onChange={(e) => setCfgGrowthEnabled(e.target.checked)}
                    />
                  </label>

                  <label className="ad-field">
                    <span className="ad-field__label">Default Growth % per Tick</span>
                    <input
                      type="number"
                      min="0"
                      max="500"
                      className="ad-input"
                      value={cfgGrowthPct}
                      onChange={(e) => setCfgGrowthPct(e.target.value)}
                    />
                  </label>

                  <label className="ad-field">
                    <span className="ad-field__label">Default Tick Interval (Hours)</span>
                    <input
                      type="number"
                      min="0.1"
                      max="720"
                      step="0.5"
                      className="ad-input"
                      value={cfgGrowthHours}
                      onChange={(e) => setCfgGrowthHours(e.target.value)}
                    />
                  </label>

                  <div className="ad-danger-box">
                    <div>
                      <strong>Lifecycle Controls</strong>
                      <span className="ad-field__hint">
                        Archive finished races or permanently delete draft boards.
                      </span>
                    </div>
                    <div className="ad-row-actions">
                      <button
                        type="button"
                        className="ad-btn ad-btn--secondary ad-btn--xs"
                        onClick={() => void handleArchiveToggle(board)}
                      >
                        <IconArchive size={13} />
                        <span>{board.archived ? "Restore Race" : "Archive Race"}</span>
                      </button>
                      {confirmDeleteSlug === board.slug ? (
                        <>
                          <button
                            type="button"
                            className="ad-btn ad-btn--danger ad-btn--xs"
                            onClick={() => void handleDeleteBoard(board)}
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            className="ad-btn ad-btn--ghost ad-btn--xs"
                            onClick={() => setConfirmDeleteSlug(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="ad-btn ad-btn--danger ad-btn--xs"
                          onClick={() => setConfirmDeleteSlug(board.slug)}
                        >
                          <IconTrash size={13} />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    );
  }

  /* ───────────── Render Mode A: Races List ───────────── */

  return (
    <div className="ad-stack">
      <div className="ad-toolbar">
        <div className="ad-seg" role="tablist" aria-label="Leaderboard status filter">
          {(
            [
              ["all", `All (${counts.all})`],
              ["active", `Active (${counts.active})`],
              ["hidden", `Hidden (${counts.hidden})`],
              ["ended", `Ended (${counts.ended})`],
              ["archived", `Archived (${counts.archived})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={`ad-seg__btn${filter === key ? " is-active" : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ad-toolbar__actions">
          <div className="ad-search">
            <IconSearch size={15} />
            <input
              type="search"
              className="ad-search__input"
              placeholder="Search races…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="ad-btn ad-btn--ghost ad-btn--sm"
            onClick={() => void loadBoards()}
          >
            <IconRefresh size={14} />
          </button>
          <button
            type="button"
            className="ad-btn ad-btn--primary ad-btn--sm"
            onClick={() => setCreateOpen((v) => !v)}
          >
            <IconPlus size={15} />
            <span>{createOpen ? "Close Creator" : "New Leaderboard"}</span>
          </button>
        </div>
      </div>

      {/* Create Leaderboard Drawer */}
      {createOpen && (
        <form className="ad-card ad-panel" onSubmit={(e) => void handleCreateBoard(e)}>
          <div className="ad-panel__head">
            <div>
              <h3 className="ad-panel__title">Launch New Leaderboard Race</h3>
              <p className="ad-panel__sub">
                Creates the board and opens Race Studio to configure players and spot prizes.
              </p>
            </div>
            <button
              type="button"
              className="ad-btn ad-btn--ghost ad-btn--xs"
              onClick={() => setCreateOpen(false)}
            >
              <IconClose size={15} />
            </button>
          </div>

          <div className="ad-form-grid">
            <label className="ad-field">
              <span className="ad-field__label">Race Title *</span>
              <input
                type="text"
                className="ad-input"
                placeholder="e.g. Monthly $10,000 Wager Race"
                required
                value={newTitle}
                onChange={(e) => {
                  setNewTitle(e.target.value);
                  if (!slugTouched) setNewSlug(slugifyInput(e.target.value));
                }}
              />
            </label>

            <label className="ad-field">
              <span className="ad-field__label">URL Slug</span>
              <input
                type="text"
                className="ad-input"
                placeholder="monthly-10k-race"
                value={newSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setNewSlug(slugifyInput(e.target.value));
                }}
              />
            </label>

            <label className="ad-field">
              <span className="ad-field__label">Prize Pool (USD)</span>
              <input
                type="number"
                min="0"
                step="1"
                className="ad-input"
                value={newPoolUsd}
                onChange={(e) => setNewPoolUsd(e.target.value)}
              />
            </label>

            <label className="ad-field">
              <span className="ad-field__label">Partner Key</span>
              <input
                type="text"
                className="ad-input"
                placeholder="stake"
                value={newPartner}
                onChange={(e) => setNewPartner(e.target.value)}
              />
            </label>

            <label className="ad-field">
              <span className="ad-field__label">Subtitle (Optional)</span>
              <input
                type="text"
                className="ad-input"
                placeholder="Wager with code KDEENOFF to climb!"
                value={newSubtitle}
                onChange={(e) => setNewSubtitle(e.target.value)}
              />
            </label>

            <label className="ad-field">
              <span className="ad-field__label">Avatar Style</span>
              <select
                className="ad-select"
                value={newAvatarStyle}
                onChange={(e) => setNewAvatarStyle(e.target.value)}
              >
                <option value="kdeenoff">KDeenOff Monkey Drops (All Editions)</option>
                <option value="kdeenoff-camo">KDeenOff Street Camo &amp; Patch</option>
                <option value="kdeenoff-luxe">KDeenOff Luxe Metals &amp; Stone</option>
                <option value="none">Initials Only</option>
              </select>
            </label>

            <label className="ad-field">
              <span className="ad-field__label">Badge (Blank = Auto)</span>
              <input
                type="text"
                className="ad-input"
                maxLength={24}
                placeholder="MONTHLY, WEEKLY, DAILY, VIP"
                value={newBadge}
                onChange={(e) => setNewBadge(e.target.value)}
              />
            </label>

            <label className="ad-field">
              <span className="ad-field__label">Promo Code</span>
              <input
                type="text"
                className="ad-input"
                maxLength={40}
                placeholder="KDEENOFF"
                value={newPromoCode}
                onChange={(e) => setNewPromoCode(e.target.value)}
              />
            </label>

            <label className="ad-field">
              <span className="ad-field__label">Sort Order</span>
              <input
                type="number"
                step="1"
                className="ad-input"
                value={newSortOrder}
                onChange={(e) => setNewSortOrder(e.target.value)}
              />
            </label>

            <label className="ad-field">
              <span className="ad-field__label">Initial Spot Prizes</span>
              <select
                className="ad-select"
                value={newSpotPreset}
                onChange={(e) => setNewSpotPreset(e.target.value as InitialSpotPreset)}
              >
                <option value="top10">Top 10 (auto-split)</option>
                <option value="top5">Top 5 (auto-split)</option>
                <option value="top3">Top 3 (podium)</option>
                <option value="empty">Empty</option>
              </select>
            </label>

            <label className="ad-field ad-field--full">
              <span className="ad-field__label">Partner Signup URL</span>
              <input
                type="url"
                className="ad-input"
                value={newPartnerUrl}
                onChange={(e) => setNewPartnerUrl(e.target.value)}
              />
            </label>

            <label className="ad-field">
              <span className="ad-field__label">Starts At</span>
              <input
                type="datetime-local"
                className="ad-input"
                value={newStartsAt}
                onChange={(e) => setNewStartsAt(e.target.value)}
              />
            </label>

            <label className="ad-field">
              <span className="ad-field__label">
                <span>Ends At</span>
                <span className="ad-inline-pills">
                  {[7, 14, 30].map((d) => (
                    <button
                      key={d}
                      type="button"
                      className="ad-bump"
                      onClick={() => applyDurationPreset(d)}
                    >
                      +{d}d
                    </button>
                  ))}
                </span>
              </span>
              <input
                type="datetime-local"
                className="ad-input"
                value={newEndsAt}
                onChange={(e) => setNewEndsAt(e.target.value)}
              />
            </label>

            <label className="ad-switch-row">
              <div>
                <strong>Show in left sidebar</strong>
                <span className="ad-field__hint">Visible in site-wide drawer navigation.</span>
              </div>
              <input
                type="checkbox"
                checked={newShowInDrawer}
                onChange={(e) => setNewShowInDrawer(e.target.checked)}
              />
            </label>

            <label className="ad-switch-row">
              <div>
                <strong>Show on home page</strong>
                <span className="ad-field__hint">Visible in Home race cards &amp; switcher.</span>
              </div>
              <input
                type="checkbox"
                checked={newShowOnHome}
                onChange={(e) => setNewShowOnHome(e.target.checked)}
              />
            </label>

            <label className="ad-switch-row ad-field--full">
              <div>
                <strong>Mark as demo data</strong>
                <span className="ad-field__hint">
                  Flags this board as test/demo data so you can purge all demo items later in one click.
                </span>
              </div>
              <input
                type="checkbox"
                checked={newIsDemo}
                onChange={(e) => setNewIsDemo(e.target.checked)}
              />
            </label>
          </div>

          <div className="ad-form-foot">
            <button
              type="button"
              className="ad-btn ad-btn--ghost ad-btn--sm"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="ad-btn ad-btn--primary ad-btn--sm"
              disabled={creating}
            >
              <IconTrophy size={15} />
              <span>{creating ? "Creating…" : "Create & Open Studio"}</span>
            </button>
          </div>
        </form>
      )}

      {/* Leaderboards List */}
      {loadingList && boards.length === 0 ? (
        <div className="ad-card ad-panel">
          <p className="ad-muted">Loading leaderboards…</p>
        </div>
      ) : filteredBoards.length === 0 ? (
        <div className="ad-card ad-empty">
          <p>No leaderboards match the selected filter.</p>
          <button
            type="button"
            className="ad-btn ad-btn--primary ad-btn--sm"
            onClick={() => setCreateOpen(true)}
          >
            <IconPlus size={14} />
            <span>Create Leaderboard</span>
          </button>
        </div>
      ) : (
        <div className="ad-board-grid">
          {filteredBoards.map((b) => {
            const left = (Number(b.ends_at) || 0) - now;
            const timer = countdown(left);
            const statusTone = b.archived
              ? "muted"
              : b.hidden
                ? "warn"
                : !timer
                  ? "muted"
                  : "live";
            const statusText = b.archived
              ? "Archived"
              : b.hidden
                ? "Hidden"
                : !timer
                  ? "Ended"
                  : `Live · ${timer}`;

            return (
              <article key={b.slug} className="ad-card ad-board-card">
                <div className="ad-board-card__head">
                  <div>
                    <div className="ad-board-card__badges">
                      <span className={`ad-badge ad-badge--${statusTone}`}>{statusText}</span>
                      {Boolean(b.is_demo) && (
                        <span className="ad-badge ad-badge--warn">[DEMO]</span>
                      )}
                      {b.badge?.trim() && (
                        <span className="ad-badge ad-badge--info">{b.badge.trim().toUpperCase()}</span>
                      )}
                      <span className="ad-badge ad-badge--muted">{partnerLabel(b.partner)}</span>
                      {b.show_in_drawer !== 0 && (
                        <span className="ad-badge ad-badge--muted">Sidebar</span>
                      )}
                      {b.show_on_home !== 0 && (
                        <span className="ad-badge ad-badge--muted">Home</span>
                      )}
                      {Boolean(b.auto_wager_growth_enabled) && (
                        <span className="ad-badge ad-badge--info">Auto-Growth</span>
                      )}
                    </div>
                    <h3 className="ad-board-card__title">{b.title}</h3>
                    <code className="ad-code">/leaderboards/{b.slug}/</code>
                  </div>
                  <div className="ad-board-card__pool">
                    <span className="ad-mini-label">Prize Pool</span>
                    <strong>{moneyShort(b.prize_pool_cents)}</strong>
                  </div>
                </div>

                <div className="ad-board-card__stats">
                  <div>
                    <span className="ad-mini-label">Total Wagered</span>
                    <strong>{money(b.total_wagered_cents)}</strong>
                  </div>
                  <div>
                    <span className="ad-mini-label">Contenders</span>
                    <strong>{Number(b.player_count) || 0} players</strong>
                  </div>
                  <div>
                    <span className="ad-mini-label">Window</span>
                    <strong>
                      {fmtShortDate(b.starts_at)} → {fmtShortDate(b.ends_at)}
                    </strong>
                  </div>
                </div>

                <div className="ad-board-card__foot">
                  <button
                    type="button"
                    className="ad-btn ad-btn--primary ad-btn--sm"
                    onClick={() => onSelectBoardSlug(b.slug)}
                  >
                    <IconTrophy size={14} />
                    <span>Race Studio</span>
                  </button>

                  <div className="ad-row-actions">
                    <button
                      type="button"
                      className="ad-btn ad-btn--secondary ad-btn--xs"
                      disabled={busyAction === `hide:${b.slug}`}
                      title={b.hidden ? "Make public" : "Hide from public"}
                      onClick={() => void handleToggleBoardHidden(b)}
                    >
                      {b.hidden ? <IconEye size={13} /> : <IconEyeOff size={13} />}
                      <span>{b.hidden ? "Show" : "Hide"}</span>
                    </button>

                    <button
                      type="button"
                      className="ad-btn ad-btn--secondary ad-btn--xs"
                      disabled={busyAction === `dup:${b.slug}`}
                      title="Duplicate leaderboard & spot prizes as draft"
                      onClick={() => void handleDuplicateBoard(b)}
                    >
                      <IconCopy size={13} />
                      <span>Clone</span>
                    </button>

                    <button
                      type="button"
                      className="ad-btn ad-btn--ghost ad-btn--xs"
                      disabled={busyAction === `arch:${b.slug}`}
                      title={b.archived ? "Restore from archive" : "Archive board"}
                      onClick={() => void handleArchiveToggle(b)}
                    >
                      <IconArchive size={13} />
                      <span>{b.archived ? "Restore" : "Archive"}</span>
                    </button>

                    {!b.archived && (
                      <button
                        type="button"
                        className="ad-btn ad-btn--ghost ad-btn--xs"
                        title="Open live leaderboard page"
                        onClick={() => onOpenPublicPath(boardHref(b.slug))}
                      >
                        <IconExternal size={13} />
                      </button>
                    )}

                    {confirmDeleteSlug === b.slug ? (
                      <>
                        <button
                          type="button"
                          className="ad-btn ad-btn--danger ad-btn--xs"
                          disabled={busyAction === `del:${b.slug}`}
                          onClick={() => void handleDeleteBoard(b)}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          className="ad-btn ad-btn--ghost ad-btn--xs"
                          onClick={() => setConfirmDeleteSlug(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="ad-btn ad-btn--ghost ad-btn--xs"
                        title="Delete leaderboard"
                        onClick={() => setConfirmDeleteSlug(b.slug)}
                      >
                        <IconTrash size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
