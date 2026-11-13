import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { adminApi, errorCode } from "../../lib/api";
import { invalidateBoardsCache, invalidateSiteSettingsCache, slugFromPath } from "../../lib/boards";
import { useUi, type AdminTab } from "../../state/ui";
import {
  IconActivity,
  IconClose,
  IconMoon,
  IconOverview,
  IconRefresh,
  IconShield,
  IconSliders,
  IconSun,
  IconTicket,
  IconTrophy,
  IconUsers,
} from "./AdminIcons";
import { AuditLogTab } from "./AuditLogTab";
import { LeaderboardsTab } from "./LeaderboardsTab";
import { OverviewTab } from "./OverviewTab";
import { RafflesTab } from "./RafflesTab";
import { SiteSettingsTab } from "./SiteSettingsTab";
import { UsersTab } from "./UsersTab";
import type { AdminOverviewData, ToastItem, ToastKind } from "./adminTypes";

const TAB_META: Record<AdminTab, { title: string; subtitle: string }> = {
  overview: {
    title: "Command Overview",
    subtitle: "Live telemetry across leaderboards, raffles, users, and operations",
  },
  leaderboards: {
    title: "Leaderboards & Race Studio",
    subtitle: "Manage wager races, contenders, prize pools, spot payouts, and growth schedules",
  },
  raffles: {
    title: "Stream Raffles & Winner Studio",
    subtitle: "Launch giveaways, inspect Kick entrants, and draw cryptographic winners",
  },
  users: {
    title: "Community Accounts",
    subtitle: "Inspect Kick & email identities, active browser sessions, and raffle history",
  },
  settings: {
    title: "Site Configuration",
    subtitle: "Global promo codes, partner links, and stream community channels",
  },
  audit: {
    title: "Security & Audit Log",
    subtitle: "Immutable trail of administrative actions and state mutations",
  },
};

function readCurrentTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function applySiteTheme(next: "dark" | "light"): void {
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem("kdeenoff-theme-v2", next);
  } catch {
    /* ignore */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", next === "dark" ? "#0c1218" : "#f7f7f7");
  }
  window.dispatchEvent(new Event("resize"));
}

export default function AdminDashboardModal() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    adminTab,
    adminBoardSlug,
    closeAdmin,
    setAdminTab,
    setAdminBoardSlug,
    bumpDataRev,
  } = useUi();

  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [liveSync, setLiveSync] = useState(true);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [theme, setTheme] = useState<"dark" | "light">(readCurrentTheme);

  const [createBoardTrigger, setCreateBoardTrigger] = useState(0);
  const [createRaffleTrigger, setCreateRaffleTrigger] = useState(0);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);

  const currentPageSlug = slugFromPath(location.pathname);

  const notify = useCallback((text: string, kind: ToastKind = "info") => {
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev.slice(-4), { id, text, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const fetchOverview = useCallback(async (silent = false) => {
    if (!silent) setOverviewLoading(true);
    try {
      const res = await adminApi<AdminOverviewData>("/api/admin/overview");
      setOverview(res);
      setOverviewError(null);
    } catch (err) {
      setOverviewError(errorCode(err));
    } finally {
      if (!silent) setOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOverview(false);
  }, [fetchOverview]);

  // Auto-sync overview every 15s when enabled
  useEffect(() => {
    if (!liveSync) return;
    const id = window.setInterval(() => {
      if (!document.hidden) {
        void fetchOverview(true);
      }
    }, 15_000);
    return () => window.clearInterval(id);
  }, [liveSync, fetchOverview]);

  // Lock body scroll & handle Escape in capture phase so background drawers/menus stay untouched
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("admin-modal-open");

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeAdmin();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.classList.remove("admin-modal-open");
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [closeAdmin]);

  const handleDataChanged = useCallback(() => {
    invalidateBoardsCache();
    invalidateSiteSettingsCache();
    bumpDataRev();
    void fetchOverview(true);
  }, [bumpDataRev, fetchOverview]);

  const handleNavigateTab = useCallback(
    (tab: AdminTab, boardSlug?: string | null) => {
      setAdminTab(tab);
      if (boardSlug !== undefined) {
        setAdminBoardSlug(boardSlug);
      }
    },
    [setAdminTab, setAdminBoardSlug],
  );

  const handleQuickCreateBoard = useCallback(() => {
    setAdminBoardSlug(null);
    setAdminTab("leaderboards");
    setCreateBoardTrigger((n) => n + 1);
  }, [setAdminBoardSlug, setAdminTab]);

  const handleQuickCreateRaffle = useCallback(() => {
    setAdminTab("raffles");
    setCreateRaffleTrigger((n) => n + 1);
  }, [setAdminTab]);

  const handleOpenPublicPath = useCallback(
    (path: string) => {
      closeAdmin();
      navigate(path);
    },
    [closeAdmin, navigate],
  );

  const handleManualRefresh = () => {
    void fetchOverview(false);
    setRefreshNonce((n) => n + 1);
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applySiteTheme(next);
  };

  const meta = TAB_META[adminTab];
  const kpis = overview?.kpis;

  return createPortal(
    <div
      className="ad-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="KDeenOff Admin Dashboard"
      data-admin-dashboard=""
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeAdmin();
      }}
    >
      <div className="ad-shell">
        {/* Sidebar Navigation */}
        <aside className="ad-sidebar">
          <div className="ad-sidebar__brand">
            <img src="/img/brand/mark-muzzle.png" alt="" width={32} height={22} />
            <div className="ad-sidebar__brand-copy">
              <strong>KDEENOFF</strong>
              <span className="ad-sidebar__tag">Admin Panel</span>
            </div>
          </div>

          <nav className="ad-nav" aria-label="Admin sections">
            <button
              type="button"
              className={`ad-nav__item${adminTab === "overview" ? " is-active" : ""}`}
              onClick={() => handleNavigateTab("overview")}
            >
              <IconOverview size={17} />
              <span>Overview</span>
            </button>

            <button
              type="button"
              className={`ad-nav__item${adminTab === "leaderboards" ? " is-active" : ""}`}
              onClick={() => handleNavigateTab("leaderboards")}
            >
              <IconTrophy size={17} />
              <span>Leaderboards</span>
              {kpis != null && (
                <span className="ad-nav__count">{kpis.activeBoards}</span>
              )}
            </button>

            <button
              type="button"
              className={`ad-nav__item${adminTab === "raffles" ? " is-active" : ""}`}
              onClick={() => handleNavigateTab("raffles")}
            >
              <IconTicket size={17} />
              <span>Raffles</span>
              {kpis != null && (
                <span
                  className={`ad-nav__count${kpis.awaitingWinnerRaffles > 0 ? " is-warn" : ""}`}
                  title={
                    kpis.awaitingWinnerRaffles > 0
                      ? `${kpis.awaitingWinnerRaffles} awaiting winner draw`
                      : undefined
                  }
                >
                  {kpis.liveRaffles}
                </span>
              )}
            </button>

            <button
              type="button"
              className={`ad-nav__item${adminTab === "users" ? " is-active" : ""}`}
              onClick={() => handleNavigateTab("users")}
            >
              <IconUsers size={17} />
              <span>Users</span>
              {kpis != null && (
                <span className="ad-nav__count">{kpis.totalUsers}</span>
              )}
            </button>

            <button
              type="button"
              className={`ad-nav__item${adminTab === "settings" ? " is-active" : ""}`}
              onClick={() => handleNavigateTab("settings")}
            >
              <IconSliders size={17} />
              <span>Site Settings</span>
            </button>

            <button
              type="button"
              className={`ad-nav__item${adminTab === "audit" ? " is-active" : ""}`}
              onClick={() => handleNavigateTab("audit")}
            >
              <IconActivity size={17} />
              <span>Audit Log</span>
              {kpis != null && kpis.auditLast24h > 0 && (
                <span className="ad-nav__count">{kpis.auditLast24h}</span>
              )}
            </button>
          </nav>

          {currentPageSlug && (
            <div className="ad-sidebar__context">
              <span className="ad-mini-label">Current Page Shortcut</span>
              <button
                type="button"
                className="ad-btn ad-btn--secondary ad-btn--sm"
                style={{ width: "100%", justifyContent: "flex-start" }}
                onClick={() => handleNavigateTab("leaderboards", currentPageSlug)}
              >
                <IconTrophy size={14} />
                <span className="ad-truncate">Edit {currentPageSlug}</span>
              </button>
            </div>
          )}

          <div className="ad-sidebar__foot">
            <div className="ad-sidebar__actor">
              <IconShield size={15} />
              <span className="ad-truncate">{overview?.actor.email || "Admin"}</span>
            </div>
            <button
              type="button"
              className="ad-btn ad-btn--ghost ad-btn--sm"
              style={{ width: "100%" }}
              onClick={closeAdmin}
            >
              Back to Site (Esc)
            </button>
          </div>
        </aside>

        {/* Main Workspace */}
        <div className="ad-main">
          <header className="ad-topbar">
            <div className="ad-topbar__titles">
              <h1 className="ad-topbar__title">{meta.title}</h1>
              <p className="ad-topbar__sub">{meta.subtitle}</p>
            </div>

            <div className="ad-topbar__controls">
              <button
                type="button"
                className={`ad-btn ad-btn--ghost ad-btn--sm${liveSync ? " is-active" : ""}`}
                onClick={() => setLiveSync((v) => !v)}
                title="Toggle 15-second live metrics refresh"
              >
                <span className={`ad-live-dot${liveSync ? " is-on" : ""}`} />
                <span>{liveSync ? "Live 15s" : "Paused"}</span>
              </button>

              <button
                type="button"
                className="ad-btn ad-btn--secondary ad-btn--sm"
                onClick={handleManualRefresh}
                title="Refresh dashboard data"
              >
                <IconRefresh size={14} />
                <span>Refresh</span>
              </button>

              <button
                type="button"
                className="ad-btn ad-btn--ghost ad-btn--sm"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              >
                {theme === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
              </button>

              <button
                type="button"
                className="ad-btn ad-btn--secondary ad-btn--sm"
                data-admin-close=""
                onClick={closeAdmin}
                aria-label="Close Admin Dashboard"
              >
                <IconClose size={16} />
                <span>Close</span>
              </button>
            </div>
          </header>

          <div className="ad-content" key={refreshNonce}>
            {adminTab === "overview" && (
              <OverviewTab
                data={overview}
                loading={overviewLoading}
                error={overviewError}
                onNavigateTab={handleNavigateTab}
                onQuickCreateBoard={handleQuickCreateBoard}
                onQuickCreateRaffle={handleQuickCreateRaffle}
                onOpenPublicPath={handleOpenPublicPath}
                notify={notify}
                onChanged={handleDataChanged}
              />
            )}

            {adminTab === "leaderboards" && (
              <LeaderboardsTab
                boardSlug={adminBoardSlug}
                createTrigger={createBoardTrigger}
                onSelectBoardSlug={setAdminBoardSlug}
                notify={notify}
                onChanged={handleDataChanged}
                onOpenPublicPath={handleOpenPublicPath}
              />
            )}

            {adminTab === "raffles" && (
              <RafflesTab
                createTrigger={createRaffleTrigger}
                notify={notify}
                onChanged={handleDataChanged}
                onOpenPublicPath={handleOpenPublicPath}
              />
            )}

            {adminTab === "users" && (
              <UsersTab notify={notify} onChanged={handleDataChanged} />
            )}

            {adminTab === "settings" && (
              <SiteSettingsTab notify={notify} onChanged={handleDataChanged} />
            )}

            {adminTab === "audit" && <AuditLogTab notify={notify} />}
          </div>
        </div>

        {/* Floating Toasts */}
        {toasts.length > 0 && (
          <div className="ad-toast-stack" role="status" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className={`ad-toast ad-toast--${t.kind}`}>
                <span>{t.text}</span>
                <button
                  type="button"
                  className="ad-toast__close"
                  aria-label="Dismiss notification"
                  onClick={() => dismissToast(t.id)}
                >
                  <IconClose size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
