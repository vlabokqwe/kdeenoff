import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCopy } from "../hooks/useCopy";
import { useNow } from "../hooks/useNow";
import { errorCode, streamerApi } from "../lib/api";
import { safeAvatar } from "../lib/format";

export interface SelectedRafflePlayer {
  displayName: string;
  avatarUrl?: string;
  ticketNo?: number;
  isWinner?: boolean;
  isEliminated?: boolean;
  kickUserId?: string;
  kickName?: string;
  partnerUsername?: string | null;
  isBanned?: boolean;
  bannedUntil?: number | null;
}

interface ModeratePlayerResponse {
  ok?: boolean;
  kick_user_id?: string;
  kick_name?: string;
  partner_username?: string | null;
  is_banned?: boolean;
  banned_until?: number | null;
  removed_entries?: number;
}

const TIMEOUT_PRESETS = [5, 15, 30, 60] as const;

function CopyMiniSvg() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true">
      <rect
        x={9}
        y={9}
        width={13}
        height={13}
        rx={2.5}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
      />
      <path
        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckMiniSvg() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true">
      <path
        d="M5 12.5 9.6 17 19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockMiniSvg() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true">
      <circle cx={12} cy={12} r={9} fill="none" stroke="currentColor" strokeWidth={2.1} />
      <path
        d="M12 7.2v5l3.2 1.9"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BanMiniSvg() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true">
      <circle cx={12} cy={12} r={9} fill="none" stroke="currentColor" strokeWidth={2.1} />
      <path
        d="M5.7 5.7 18.3 18.3"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
      />
    </svg>
  );
}

function formatRemainingTimeout(bannedUntil: number, now: number): string {
  const diffSec = Math.max(0, Math.ceil((bannedUntil - now) / 1000));
  if (diffSec <= 0) return "";
  if (diffSec < 60) return `${diffSec}s left`;
  const mins = Math.ceil(diffSec / 60);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m left` : `${hrs}h left`;
}

export function RafflePlayerOverlay({
  player,
  raffleId,
  partnerName,
  onClose,
  onPlayerUpdated,
  onModerated,
}: {
  player: SelectedRafflePlayer;
  raffleId: number;
  partnerName?: string;
  onClose: () => void;
  onPlayerUpdated: (next: SelectedRafflePlayer) => void;
  onModerated: () => void;
}) {
  const now = useNow();

  const resolvedKickName = String(player.kickName || player.displayName || "").trim();
  const resolvedPartner = String(player.partnerUsername || "").trim();
  const kickCopy = useCopy(resolvedKickName);
  const partnerCopy = useCopy(resolvedPartner);

  const [minutesInput, setMinutesInput] = useState("5");
  const [busyAction, setBusyAction] = useState<"timeout" | "ban" | "unban" | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    setFeedback(null);
    setBusyAction(null);
  }, [player.kickUserId, player.displayName]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const parsedMinutes = (() => {
    const n = Math.trunc(Number(minutesInput));
    if (!Number.isFinite(n) || n < 1) return 5;
    return Math.min(43_200, n);
  })();

  const isBanned = Boolean(player.isBanned);
  const bannedUntil =
    !isBanned && player.bannedUntil && player.bannedUntil > now ? player.bannedUntil : null;
  const remainingText = bannedUntil ? formatRemainingTimeout(bannedUntil, now) : "";
  const canModerateAccount = Boolean(player.kickUserId || resolvedKickName);

  const runModeration = async (action: "timeout" | "ban" | "unban") => {
    if (!canModerateAccount || busyAction) return;
    setBusyAction(action);
    setFeedback(null);

    const endpoint =
      raffleId > 0
        ? `/api/raffles/manage/${raffleId}/moderate-player`
        : `/api/raffles/manage/moderate-player`;

    try {
      const res = await streamerApi<ModeratePlayerResponse>(endpoint, {
        method: "POST",
        body: {
          kick_user_id: player.kickUserId || undefined,
          kick_name: resolvedKickName || undefined,
          action,
          ...(action === "timeout" ? { duration_minutes: parsedMinutes } : {}),
        },
      });

      const nextBanned = Boolean(res.is_banned);
      const nextUntil =
        typeof res.banned_until === "number" && res.banned_until > Date.now()
          ? res.banned_until
          : null;

      onPlayerUpdated({
        ...player,
        kickUserId: res.kick_user_id || player.kickUserId,
        kickName: res.kick_name || player.kickName || player.displayName,
        partnerUsername:
          res.partner_username !== undefined ? res.partner_username : player.partnerUsername,
        isBanned: nextBanned,
        bannedUntil: nextUntil,
      });

      if (action === "ban") {
        setFeedback({
          tone: "ok",
          text: "Player banned from raffles and removed from open draws.",
        });
      } else if (action === "timeout") {
        setFeedback({
          tone: "ok",
          text: `Restricted from raffles for ${parsedMinutes}m.`,
        });
      } else {
        setFeedback({
          tone: "ok",
          text: "Raffle restriction lifted.",
        });
      }

      onModerated();
    } catch (err) {
      setFeedback({
        tone: "error",
        text: errorCode(err) || "Moderation action failed.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const avatarSrc = safeAvatar(player.avatarUrl);
  const partnerBrand = String(partnerName || "").trim();
  const partnerFieldLabel = partnerBrand ? `${partnerBrand} username` : "Partner username";

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="raffle-player-pop"
      data-raffle-player-overlay
      role="dialog"
      aria-modal="true"
      aria-label={`Player details: ${player.displayName}`}
    >
      <div
        className="raffle-player-pop__scrim"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="raffle-player-pop__card">
        <header className="raffle-player-pop__head">
          <div className="raffle-player-pop__identity">
            <img
              className="raffle-player-pop__avatar"
              src={avatarSrc}
              alt=""
              width={42}
              height={42}
            />
            <div className="raffle-player-pop__who">
              <div className="raffle-player-pop__title-row">
                <strong className="raffle-player-pop__name">{player.displayName}</strong>
                {Boolean(player.ticketNo && player.ticketNo > 0) && (
                  <span className="raffle-player-pop__ticket">#{player.ticketNo}</span>
                )}
              </div>
              <div className="raffle-player-pop__badges">
                {player.isWinner && (
                  <span className="raffle-player-pop__badge raffle-player-pop__badge--win">
                    Winner
                  </span>
                )}
                {player.isEliminated && (
                  <span className="raffle-player-pop__badge raffle-player-pop__badge--out">
                    Eliminated
                  </span>
                )}
                {isBanned && (
                  <span
                    className="raffle-player-pop__badge raffle-player-pop__badge--ban"
                    data-player-ban-badge
                  >
                    Banned
                  </span>
                )}
                {!isBanned && remainingText && (
                  <span
                    className="raffle-player-pop__badge raffle-player-pop__badge--timeout"
                    data-player-timeout-badge
                  >
                    Timed out · {remainingText}
                  </span>
                )}
                {!player.isWinner && !player.isEliminated && !isBanned && !remainingText && (
                  <span className="raffle-player-pop__badge">Active player</span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="raffle-player-pop__close"
            data-player-overlay-close
            aria-label="Close player overlay"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="raffle-player-pop__fields">
          <div className="raffle-player-pop__field-row" data-player-kick-row>
            <div className="raffle-player-pop__field-meta">
              <span className="raffle-player-pop__field-label">Kick username</span>
              <strong className="raffle-player-pop__field-value" data-player-kick-value>
                {resolvedKickName || "Unknown"}
              </strong>
            </div>
            <button
              type="button"
              className={`raffle-player-pop__copy${kickCopy.copied ? " is-copied" : ""}`}
              data-copy-kick
              disabled={!resolvedKickName}
              onClick={() => void kickCopy.copy()}
            >
              {kickCopy.copied ? <CheckMiniSvg /> : <CopyMiniSvg />}
              <span>{kickCopy.copied ? "Copied" : "Copy"}</span>
            </button>
          </div>

          <div className="raffle-player-pop__field-row" data-player-partner-row>
            <div className="raffle-player-pop__field-meta">
              <span className="raffle-player-pop__field-label">{partnerFieldLabel}</span>
              <strong
                className={`raffle-player-pop__field-value${
                  !resolvedPartner ? " is-empty" : ""
                }`}
                data-player-partner-value
              >
                {resolvedPartner || "Not set"}
              </strong>
            </div>
            <button
              type="button"
              className={`raffle-player-pop__copy${partnerCopy.copied ? " is-copied" : ""}`}
              data-copy-partner
              disabled={!resolvedPartner}
              onClick={() => void partnerCopy.copy()}
            >
              {partnerCopy.copied ? <CheckMiniSvg /> : <CopyMiniSvg />}
              <span>{partnerCopy.copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>

        <div className="raffle-player-pop__mod">
          <div className="raffle-player-pop__mod-head">
            <span className="raffle-player-pop__mod-title">Raffle restriction</span>
            <div className="raffle-player-pop__presets" role="group" aria-label="Timeout presets">
              {TIMEOUT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`raffle-player-pop__preset${
                    parsedMinutes === preset ? " is-active" : ""
                  }`}
                  onClick={() => setMinutesInput(String(preset))}
                >
                  {preset}m
                </button>
              ))}
              <label className="raffle-player-pop__min-input" aria-label="Custom minutes">
                <input
                  type="number"
                  min={1}
                  max={43200}
                  step={1}
                  data-player-timeout-minutes
                  value={minutesInput}
                  onChange={(e) => setMinutesInput(e.target.value)}
                />
                <span>m</span>
              </label>
            </div>
          </div>

          <div className="raffle-player-pop__actions">
            <button
              type="button"
              className="raffle-player-pop__btn raffle-player-pop__btn--timeout"
              data-player-timeout-btn
              disabled={!canModerateAccount || busyAction != null}
              onClick={() => void runModeration("timeout")}
            >
              <ClockMiniSvg />
              <span>
                {busyAction === "timeout"
                  ? "Applying…"
                  : `Restrict ${parsedMinutes}m`}
              </span>
            </button>

            {bannedUntil && !isBanned && (
              <button
                type="button"
                className="raffle-player-pop__btn raffle-player-pop__btn--ghost"
                data-player-lift-timeout-btn
                disabled={!canModerateAccount || busyAction != null}
                onClick={() => void runModeration("unban")}
              >
                <span>{busyAction === "unban" ? "Lifting…" : "Lift timeout"}</span>
              </button>
            )}

            {isBanned ? (
              <button
                type="button"
                className="raffle-player-pop__btn raffle-player-pop__btn--unban"
                data-player-unban-btn
                disabled={!canModerateAccount || busyAction != null}
                onClick={() => void runModeration("unban")}
              >
                <span>{busyAction === "unban" ? "Unbanning…" : "Unban player"}</span>
              </button>
            ) : (
              <button
                type="button"
                className="raffle-player-pop__btn raffle-player-pop__btn--ban"
                data-player-ban-btn
                disabled={!canModerateAccount || busyAction != null}
                onClick={() => void runModeration("ban")}
              >
                <BanMiniSvg />
                <span>{busyAction === "ban" ? "Banning…" : "Ban"}</span>
              </button>
            )}
          </div>

          {feedback && (
            <p
              className={`raffle-player-pop__feedback${
                feedback.tone === "error" ? " is-error" : " is-ok"
              }`}
              data-player-mod-feedback
              role="status"
            >
              {feedback.text}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

