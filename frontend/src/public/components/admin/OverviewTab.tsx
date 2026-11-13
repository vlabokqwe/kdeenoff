import { useState } from "react";
import { useNow } from "../../hooks/useNow";
import { adminApi, errorCode } from "../../lib/api";
import { countdown, money, moneyShort } from "../../lib/boards";
import type { AdminTab } from "../../state/ui";
import {
  IconActivity,
  IconBolt,
  IconExternal,
  IconPlus,
  IconSliders,
  IconTicket,
  IconTrash,
  IconTrophy,
  IconUsers,
} from "./AdminIcons";
import { relTime, type AdminOverviewData, type ToastKind } from "./adminTypes";

type SeriesMetric = "all" | "entries" | "users" | "audits";

interface OverviewTabProps {
  data: AdminOverviewData | null;
  loading: boolean;
  error: string | null;
  onNavigateTab: (tab: AdminTab, boardSlug?: string | null) => void;
  onQuickCreateBoard: () => void;
  onQuickCreateRaffle: () => void;
  onOpenPublicPath: (path: string) => void;
  notify?: (text: string, kind?: ToastKind) => void;
  onChanged?: () => void;
}

export function OverviewTab({
  data,
  loading,
  error,
  onNavigateTab,
  onQuickCreateBoard,
  onQuickCreateRaffle,
  onOpenPublicPath,
  notify,
  onChanged,
}: OverviewTabProps) {
  const now = useNow();
  const [metric, setMetric] = useState<SeriesMetric>("all");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [purgingDemo, setPurgingDemo] = useState(false);

  if (error && !data) {
    const isNetworkOrAccessRedirect =
      /failed to fetch|networkerror|load failed/i.test(error);
    return (
      <div className="kadm-empty kadm-empty--error">
        <p>Could not load overview metrics: {error}</p>
        {isNetworkOrAccessRedirect && (
          <p style={{ marginTop: 8, opacity: 0.85 }}>
            Cloudflare Zero Trust Access may be intercepting <code>/api/admin/*</code> on this domain.{" "}
            <a
              href="/admin/"
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: "underline", fontWeight: 700 }}
            >
              Sign in via Cloudflare Access
            </a>{" "}
            or remove the legacy Access application for <code>/admin</code> in Cloudflare Zero Trust.
          </p>
        )}
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="kadm-overview">
        <div className="kadm-kpi-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="kadm-card kadm-kpi kadm-kpi--skel">
              <span className="kadm-skel kadm-skel--sm" />
              <span className="kadm-skel kadm-skel--lg" />
              <span className="kadm-skel kadm-skel--md" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { kpis, boardBreakdown, topPlayers, activitySeries, recentAudit } = data;

  const seriesValues = activitySeries.map((pt) => {
    if (metric === "entries") return pt.entries;
    if (metric === "users") return pt.users;
    if (metric === "audits") return pt.audits;
    return pt.entries + pt.users + pt.audits;
  });
  const maxVal = Math.max(1, ...seriesValues);
  const totalInWindow = seriesValues.reduce((a, b) => a + b, 0);
  const hoveredPoint = hoverIdx != null ? activitySeries[hoverIdx] : null;

  const maxBoardWager = Math.max(
    1,
    ...boardBreakdown.map((b) => Number(b.total_wagered_cents) || 0),
  );

  const demoBoardCount = Number(kpis.demoBoards) || 0;
  const demoRaffleCount = Number(kpis.demoRaffles) || 0;
  const demoTotal = demoBoardCount + demoRaffleCount;

  const handlePurgeDemo = async () => {
    setPurgingDemo(true);
    try {
      const res = await adminApi<{ deletedBoards?: number; deletedRaffles?: number }>(
        "/api/admin/demo",
        { method: "DELETE" },
      );
      setConfirmPurge(false);
      notify?.(
        `Purged ${res.deletedBoards ?? 0} demo leaderboards and ${res.deletedRaffles ?? 0} demo raffles`,
        "success",
      );
      onChanged?.();
    } catch (err) {
      notify?.(`Failed to purge demo data: ${errorCode(err)}`, "error");
    } finally {
      setPurgingDemo(false);
    }
  };

  return (
    <div className="kadm-overview">
      {/* Demo / Test Data Callout */}
      {demoTotal > 0 && (
        <div
          className="kadm-card"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            padding: "12px 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span className="kadm-badge kadm-badge--warn">DEMO</span>
            <span>
              Demo test data active: <strong>{demoBoardCount}</strong>{" "}
              {demoBoardCount === 1 ? "demo leaderboard" : "demo leaderboards"},{" "}
              <strong>{demoRaffleCount}</strong>{" "}
              {demoRaffleCount === 1 ? "demo raffle" : "demo raffles"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {!confirmPurge ? (
              <button
                type="button"
                className="kadm-btn kadm-btn--danger kadm-btn--sm"
                onClick={() => setConfirmPurge(true)}
              >
                <IconTrash size={14} />
                <span>Purge all demo data</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="kadm-btn kadm-btn--danger kadm-btn--sm"
                  disabled={purgingDemo}
                  onClick={() => void handlePurgeDemo()}
                >
                  {purgingDemo ? "Purging…" : "Confirm purge"}
                </button>
                <button
                  type="button"
                  className="kadm-btn kadm-btn--ghost kadm-btn--sm"
                  disabled={purgingDemo}
                  onClick={() => setConfirmPurge(false)}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Quick Action Strip */}
      <div className="kadm-quick-bar">
        <div className="kadm-quick-bar__intro">
          <span className="kadm-live-pill">
            <span className="kadm-live-pill__dot" />
            Live Command Center
          </span>
          <span className="kadm-muted">
            Signed in as <strong>{data.actor.email}</strong>
          </span>
        </div>
        <div className="kadm-quick-bar__actions">
          <button type="button" className="kadm-btn kadm-btn--primary kadm-btn--sm" onClick={onQuickCreateBoard}>
            <IconPlus size={15} />
            <span>New Leaderboard</span>
          </button>
          <button type="button" className="kadm-btn kadm-btn--secondary kadm-btn--sm" onClick={onQuickCreateRaffle}>
            <IconPlus size={15} />
            <span>New Raffle</span>
          </button>
          <button
            type="button"
            className="kadm-btn kadm-btn--ghost kadm-btn--sm"
            onClick={() => onNavigateTab("settings")}
          >
            <IconSliders size={15} />
            <span>Promo &amp; Links</span>
          </button>
        </div>
      </div>

      {/* 6 Interactive KPI Cards */}
      <div className="kadm-kpi-grid">
        <button
          type="button"
          className="kadm-card kadm-kpi kadm-kpi--interactive"
          onClick={() => onNavigateTab("leaderboards", null)}
        >
          <div className="kadm-kpi__top">
            <span className="kadm-kpi__label">Active Races</span>
            <span className="kadm-kpi__icon kadm-kpi__icon--indigo">
              <IconTrophy size={16} />
            </span>
          </div>
          <div className="kadm-kpi__value">{kpis.activeBoards}</div>
          <div className="kadm-kpi__sub">
            {kpis.totalBoards} total · {kpis.endedBoards} ended · {kpis.archivedBoards} archived
          </div>
        </button>

        <button
          type="button"
          className="kadm-card kadm-kpi kadm-kpi--interactive"
          onClick={() => onNavigateTab("leaderboards", null)}
        >
          <div className="kadm-kpi__top">
            <span className="kadm-kpi__label">Active Prize Pool</span>
            <span className="kadm-kpi__icon kadm-kpi__icon--amber">
              <IconTrophy size={16} />
            </span>
          </div>
          <div className="kadm-kpi__value">{moneyShort(kpis.activePrizePoolCents)}</div>
          <div className="kadm-kpi__sub">
            Across {kpis.activeBoards} active {kpis.activeBoards === 1 ? "race" : "races"}
          </div>
        </button>

        <button
          type="button"
          className="kadm-card kadm-kpi kadm-kpi--interactive"
          onClick={() => onNavigateTab("leaderboards", null)}
        >
          <div className="kadm-kpi__top">
            <span className="kadm-kpi__label">Active Wager Volume</span>
            <span className="kadm-kpi__icon kadm-kpi__icon--sky">
              <IconBolt size={16} />
            </span>
          </div>
          <div className="kadm-kpi__value">{moneyShort(kpis.totalWageredActiveCents)}</div>
          <div className="kadm-kpi__sub">All-time tracked: {moneyShort(kpis.totalWageredAllCents)}</div>
        </button>

        <button
          type="button"
          className="kadm-card kadm-kpi kadm-kpi--interactive"
          onClick={() =>
            onNavigateTab("leaderboards", boardBreakdown[0]?.slug ?? null)
          }
        >
          <div className="kadm-kpi__top">
            <span className="kadm-kpi__label">Race Players</span>
            <span className="kadm-kpi__icon kadm-kpi__icon--blue">
              <IconUsers size={16} />
            </span>
          </div>
          <div className="kadm-kpi__value">{kpis.totalPlayers}</div>
          <div className="kadm-kpi__sub">
            {kpis.activePlayers} in live races · {kpis.growthEnabledPlayers} auto-growth
          </div>
        </button>

        <button
          type="button"
          className="kadm-card kadm-kpi kadm-kpi--interactive"
          onClick={() => onNavigateTab("raffles")}
        >
          <div className="kadm-kpi__top">
            <span className="kadm-kpi__label">Raffles &amp; Entries</span>
            <span className="kadm-kpi__icon kadm-kpi__icon--coral">
              <IconTicket size={16} />
            </span>
          </div>
          <div className="kadm-kpi__value">
            {kpis.liveRaffles} <span className="kadm-kpi__unit">live</span>
          </div>
          <div className="kadm-kpi__sub">
            {kpis.totalRaffleEntries} entries
            {kpis.awaitingWinnerRaffles > 0
              ? ` · ${kpis.awaitingWinnerRaffles} awaiting winner`
              : ` · ${kpis.finishedRaffles} finished`}
          </div>
        </button>

        <button
          type="button"
          className="kadm-card kadm-kpi kadm-kpi--interactive"
          onClick={() => onNavigateTab("users")}
        >
          <div className="kadm-kpi__top">
            <span className="kadm-kpi__label">Community Accounts</span>
            <span className="kadm-kpi__icon kadm-kpi__icon--aqua">
              <IconUsers size={16} />
            </span>
          </div>
          <div className="kadm-kpi__value">{kpis.totalUsers}</div>
          <div className="kadm-kpi__sub">
            {kpis.linkedKickUsers} Kick · {kpis.verifiedEmails} Email · {kpis.activeSessions} sessions
          </div>
        </button>
      </div>

      {/* Charts Row: 14-day Activity + Race Wager Breakdown */}
      <div className="kadm-split-grid">
        <section className="kadm-card kadm-panel">
          <div className="kadm-panel__head">
            <div>
              <h2 className="kadm-panel__title">14-Day Activity Pulse</h2>
              <p className="kadm-panel__sub">
                {hoveredPoint
                  ? `${hoveredPoint.label}: ${hoveredPoint.entries} entries · ${hoveredPoint.users} new users · ${hoveredPoint.audits} admin ops`
                  : `${totalInWindow} events recorded in the last 14 days`}
              </p>
            </div>
            <div className="kadm-seg" role="tablist" aria-label="Activity metric">
              {(
                [
                  ["all", "All"],
                  ["entries", "Entries"],
                  ["users", "Users"],
                  ["audits", "Admin"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={metric === key}
                  className={`kadm-seg__btn${metric === key ? " is-active" : ""}`}
                  onClick={() => setMetric(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="kadm-chart" onMouseLeave={() => setHoverIdx(null)}>
            <svg
              viewBox="0 0 560 176"
              className="kadm-chart__svg"
              role="img"
              aria-label="14-day activity chart"
            >
              {[0.25, 0.5, 0.75, 1].map((line) => {
                const y = Math.round(146 - line * 124);
                return (
                  <line
                    key={line}
                    x1={8}
                    x2={552}
                    y1={y}
                    y2={y}
                    className="kadm-chart__grid"
                  />
                );
              })}
              {activitySeries.map((pt, idx) => {
                const val = seriesValues[idx];
                const slotW = 544 / activitySeries.length;
                const barW = Math.max(12, slotW - 12);
                const x = 8 + idx * slotW + (slotW - barW) / 2;
                const barH = val > 0 ? Math.max(8, Math.round((val / maxVal) * 122)) : 3;
                const y = 146 - barH;
                const active = hoverIdx === idx;
                return (
                  <g
                    key={pt.date}
                    className={`kadm-chart__col${active ? " is-hovered" : ""}`}
                    onMouseEnter={() => setHoverIdx(idx)}
                  >
                    <rect
                      x={8 + idx * slotW}
                      y={12}
                      width={slotW}
                      height={156}
                      fill="transparent"
                    />
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={barH}
                      rx={5}
                      className={`kadm-chart__bar${val === 0 ? " is-zero" : ""}`}
                    />
                    {val > 0 && (
                      <text
                        x={x + barW / 2}
                        y={Math.max(14, y - 5)}
                        textAnchor="middle"
                        className="kadm-chart__val"
                      >
                        {val}
                      </text>
                    )}
                    {idx % 2 === 0 && (
                      <text
                        x={x + barW / 2}
                        y={166}
                        textAnchor="middle"
                        className="kadm-chart__axis"
                      >
                        {pt.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </section>

        <section className="kadm-card kadm-panel">
          <div className="kadm-panel__head">
            <div>
              <h2 className="kadm-panel__title">Race Performance</h2>
              <p className="kadm-panel__sub">Wager volume, prize pools &amp; live timers</p>
            </div>
            <button
              type="button"
              className="kadm-btn kadm-btn--ghost kadm-btn--sm"
              onClick={() => onNavigateTab("leaderboards", null)}
            >
              All races →
            </button>
          </div>

          {boardBreakdown.length === 0 ? (
            <div className="kadm-empty">
              <p>No leaderboards yet.</p>
              <button type="button" className="kadm-btn kadm-btn--primary kadm-btn--sm" onClick={onQuickCreateBoard}>
                Create first leaderboard
              </button>
            </div>
          ) : (
            <div className="kadm-race-bars">
              {boardBreakdown.slice(0, 5).map((b) => {
                const wager = Number(b.total_wagered_cents) || 0;
                const pct = Math.max(4, Math.round((wager / maxBoardWager) * 100));
                const left = (Number(b.ends_at) || 0) - now;
                const timer = countdown(left);
                const statusLabel = b.archived
                  ? "Archived"
                  : b.hidden
                    ? "Hidden"
                    : !timer
                      ? "Ended"
                      : `Live · ${timer}`;
                const statusTone = b.archived
                  ? "muted"
                  : b.hidden
                    ? "warn"
                    : !timer
                      ? "muted"
                      : "live";

                return (
                  <div key={b.slug} className="kadm-race-bar">
                    <div className="kadm-race-bar__top">
                      <div className="kadm-race-bar__title-wrap">
                        <strong className="kadm-race-bar__title">{b.title}</strong>
                        <span className={`kadm-badge kadm-badge--${statusTone}`}>{statusLabel}</span>
                        {Boolean(b.is_demo) && (
                          <span className="kadm-badge kadm-badge--warn">DEMO</span>
                        )}
                      </div>
                      <div className="kadm-race-bar__actions">
                        <button
                          type="button"
                          className="kadm-btn kadm-btn--secondary kadm-btn--xs"
                          onClick={() => onNavigateTab("leaderboards", b.slug)}
                        >
                          Manage
                        </button>
                        {!b.archived && !b.hidden && (
                          <button
                            type="button"
                            className="kadm-btn kadm-btn--ghost kadm-btn--xs"
                            title="Open public leaderboard"
                            onClick={() => onOpenPublicPath(`/leaderboards/${b.slug}/`)}
                          >
                            <IconExternal size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="kadm-race-bar__track">
                      <span className="kadm-race-bar__fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="kadm-race-bar__meta">
                      <span>
                        Wagered: <strong>{money(wager)}</strong>
                      </span>
                      <span>
                        Pool: <strong>{moneyShort(b.prize_pool_cents)}</strong>
                      </span>
                      <span>{Number(b.player_count) || 0} players</span>
                      <span className="kadm-code">{(b.partner || "stake").toUpperCase()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Bottom Row: Top Wagerers + Live Audit Feed */}
      <div className="kadm-split-grid">
        <section className="kadm-card kadm-panel">
          <div className="kadm-panel__head">
            <div>
              <h2 className="kadm-panel__title">Top Active Contenders</h2>
              <p className="kadm-panel__sub">Highest wagers across non-archived races</p>
            </div>
          </div>

          {topPlayers.length === 0 ? (
            <div className="kadm-empty">
              <p>No players recorded on active boards yet.</p>
            </div>
          ) : (
            <div className="kadm-contenders">
              {topPlayers.map((p) => (
                <button
                  key={`${p.board_slug}-${p.id}`}
                  type="button"
                  className="kadm-contender"
                  onClick={() => onNavigateTab("leaderboards", p.board_slug)}
                >
                  <span className="kadm-contender__rank">#{p.rank || "—"}</span>
                  {p.avatar_url ? (
                    <img
                      src={p.avatar_url}
                      alt=""
                      width={30}
                      height={30}
                      className="kadm-contender__avatar"
                    />
                  ) : (
                    <span className="kadm-contender__avatar kadm-contender__avatar--placeholder">
                      {(p.username[0] || "P").toUpperCase()}
                    </span>
                  )}
                  <span className="kadm-contender__info">
                    <strong className="kadm-contender__name">{p.username}</strong>
                    <span className="kadm-contender__board">{p.board_title}</span>
                  </span>
                  {p.wag_growth_enabled && (
                    <span className="kadm-badge kadm-badge--info" title="Auto-growth enabled">
                      Growth
                    </span>
                  )}
                  <span className="kadm-contender__wager">{money(p.wagered_cents)}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="kadm-card kadm-panel">
          <div className="kadm-panel__head">
            <div>
              <h2 className="kadm-panel__title">Recent Admin Operations</h2>
              <p className="kadm-panel__sub">
                {kpis.auditLast24h} actions in the last 24h ({kpis.auditTotal} total)
              </p>
            </div>
            <button
              type="button"
              className="kadm-btn kadm-btn--ghost kadm-btn--sm"
              onClick={() => onNavigateTab("audit")}
            >
              Full log →
            </button>
          </div>

          {recentAudit.length === 0 ? (
            <div className="kadm-empty">
              <p>No admin operations logged yet.</p>
            </div>
          ) : (
            <ul className="kadm-feed">
              {recentAudit.slice(0, 8).map((item, idx) => (
                <li key={item.id ?? idx} className="kadm-feed__item">
                  <span className="kadm-feed__dot">
                    <IconActivity size={13} />
                  </span>
                  <div className="kadm-feed__body">
                    <div className="kadm-feed__line">
                      <code className="kadm-code">{item.action || "action"}</code>
                      {item.target && <span className="kadm-feed__target">{item.target}</span>}
                    </div>
                    <div className="kadm-feed__meta">
                      <span>{item.actor_email || "admin"}</span>
                      <span>·</span>
                      <span>{relTime(item.at, now)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
