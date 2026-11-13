import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCopy } from "../hooks/useCopy";
import { errorCode, streamerApi } from "../lib/api";
import { buildRaffleEntryUrl } from "../lib/raffleJoin";
import type {
  Raffle,
  RaffleEndMode,
  RaffleSpinMode,
  RaffleSpinSpeed,
} from "../lib/types";
import type { DrumPhase } from "./RaffleDrumRoulette";

const OVERLAY_OPEN_KEY = "kdeenoff-streamer-overlay-open";
const OVERLAY_DOCK_KEY = "kdeenoff-streamer-overlay-dock";

type OverlayDock = "left" | "right";
type DetailTab = "draw" | "settings" | "edit";
type ListTab = "manage" | "form";

export interface SpinActionResult {
  ok: boolean;
  id: number;
  mode: "winner" | "elimination" | "end" | "finish" | "reroll";
  winner: string | null;
  eliminated?: string[];
  last_eliminated?: string | null;
  remaining_count?: number;
  entry_count?: number;
  ended_at: number | null;
  last_spin_at?: number;
}

interface StreamerRaffleOverlayCommonProps {
  canManage: boolean;
}

export interface StreamerOverlayDetailProps extends StreamerRaffleOverlayCommonProps {
  mode: "detail";
  inline?: boolean;
  raffle: Raffle;
  totalEntries: number;
  activeEntries: number;
  eliminatedEntries: number;
  drumPhase: DrumPhase;
  spinning: boolean;
  onSpinStart: () => void;
  onSpinComplete: (res: SpinActionResult) => Promise<void>;
  onSpinError: (msg: string) => void;
  onRaffleMutated: (msg?: string) => Promise<void>;
}

export interface StreamerOverlayListProps extends StreamerRaffleOverlayCommonProps {
  mode: "list";
  showAllOnPage: boolean;
  onToggleShowAllOnPage: (next: boolean) => void;
  externalEditRaffle?: Raffle | null;
  onClearExternalEdit?: () => void;
  onListMutated: () => void;
}

export type StreamerRaffleOverlayProps =
  | StreamerOverlayDetailProps
  | StreamerOverlayListProps;

const SPIN_TIME_PRESETS_MS = [1000, 2000, 4000, 7000, 10000] as const;

function formatSpinSeconds(ms: number): string {
  const sec = Math.round((Math.max(0, ms) / 1000) * 10) / 10;
  return String(sec);
}

function parseSpinSecondsToMs(raw: string, fallbackMs: number): number {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return fallbackMs;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return fallbackMs;
  const ms = Math.round(n * 1000);
  if (ms <= 0) return 0;
  return Math.max(300, Math.min(120_000, ms));
}

function toLocalDateTimeInput(ms: number | undefined | null): string {
  const base = Number(ms);
  const d = new Date(Number.isFinite(base) && base > 0 ? base : Date.now() + 3_600_000);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDateTimeInput(val: string): number | null {
  const s = val.trim();
  if (!s) return null;
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function StreamerRaffleOverlay(props: StreamerRaffleOverlayProps) {
  const navigate = useNavigate();

  const [open, setOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(OVERLAY_OPEN_KEY);
      if (saved === "0" || saved === "1") return saved === "1";
    } catch {
      /* ignore */
    }
    return true;
  });

  const [dock, setDock] = useState<OverlayDock>(() => {
    try {
      const saved = localStorage.getItem(OVERLAY_DOCK_KEY);
      if (saved === "left" || saved === "right") return saved;
    } catch {
      /* ignore */
    }
    return "right";
  });

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(OVERLAY_OPEN_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const toggleDock = () => {
    const next: OverlayDock = dock === "left" ? "right" : "left";
    setDock(next);
    try {
      localStorage.setItem(OVERLAY_DOCK_KEY, next);
    } catch {
      /* ignore */
    }
  };

  if (!props.canManage) return null;

  if (props.mode === "detail" && props.inline) {
    return (
      <section
        className="raffle-streamer raffle-streamer--slot"
        data-streamer-overlay="slot"
        aria-label="Streamer raffle controls"
      >
        <header className="raffle-streamer__slot-head">
          <div className="raffle-streamer__slot-title-wrap">
            <h2 className="raffle-streamer__slot-title">Streamer Panel</h2>
          </div>
        </header>

        <div className="raffle-streamer__body">
          <DetailOverlayBody {...props} navigate={navigate} />
        </div>
      </section>
    );
  }

  return (
    <aside
      className={`raffle-streamer raffle-streamer--floating raffle-streamer--${dock}${!open ? " is-collapsed" : ""}`}
      data-streamer-overlay=""
      data-streamer-dock={dock}
      aria-label="Streamer raffle controls"
    >
      <div className="raffle-streamer__bar">
        <button
          type="button"
          className="raffle-streamer__toggle"
          aria-controls="raffle-streamer-body"
          aria-expanded={open}
          aria-label={open ? "Collapse streamer controls" : "Expand streamer controls"}
          onClick={toggleOpen}
        >
          <span className="raffle-streamer__title">Streamer</span>
          {props.mode === "detail" && open && (
            <span className="raffle-streamer__pool-pill">
              {props.activeEntries} in
              {props.eliminatedEntries > 0 ? ` · ${props.eliminatedEntries} out` : ""}
            </span>
          )}
          <span className="raffle-streamer__chev" aria-hidden="true" />
        </button>
        {open && (
          <button
            type="button"
            className="raffle-streamer__dock-btn"
            onClick={toggleDock}
            title={dock === "left" ? "Move overlay to bottom-right" : "Move overlay to bottom-left"}
            aria-label={dock === "left" ? "Dock right" : "Dock left"}
          >
            {dock === "left" ? "↘" : "↙"}
          </button>
        )}
      </div>

      <div className="raffle-streamer__body" id="raffle-streamer-body" hidden={!open}>
        {props.mode === "detail" ? (
          <DetailOverlayBody {...props} navigate={navigate} />
        ) : (
          <ListOverlayBody {...props} navigate={navigate} onEnsureOpen={() => setOpen(true)} />
        )}
      </div>
    </aside>
  );
}

/* ───────────── Detail Mode (/raffles/:id/) ───────────── */

function DetailOverlayBody({
  raffle,
  totalEntries,
  activeEntries,
  eliminatedEntries,
  drumPhase,
  spinning,
  onSpinStart,
  onSpinComplete,
  onSpinError,
  onRaffleMutated,
  navigate,
}: StreamerOverlayDetailProps & { navigate: ReturnType<typeof useNavigate> }) {
  const raffleId = Number(raffle.id) || 0;
  const [tab, setTab] = useState<DetailTab>("draw");
  const [busy, setBusy] = useState(false);
  const [autoChain, setAutoChain] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);

  // Edit / Create form state inside Edit/+ tab
  const [formMode, setFormMode] = useState<"edit" | "create">("edit");
  const [title, setTitle] = useState(raffle.title || "");
  const [prize, setPrize] = useState(raffle.prize || "");
  const [note, setNote] = useState(raffle.note || "");
  const [endMode, setEndMode] = useState<RaffleEndMode>(raffle.end_mode === "manual" ? "manual" : "timer");
  const [spinModeField, setSpinModeField] = useState<RaffleSpinMode>(
    raffle.spin_mode === "elimination" ? "elimination" : "winner",
  );
  const [endsAtIso, setEndsAtIso] = useState(() =>
    toLocalDateTimeInput(
      raffle.end_mode === "manual" ? Date.now() + 86_400_000 : raffle.ends_at,
    ),
  );
  const [hiddenField, setHiddenField] = useState(Boolean(raffle.hidden));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const joinUrl = raffleId ? buildRaffleEntryUrl(raffleId) : "";
  const { copied, copy } = useCopy(joinUrl);

  // Sync edit fields when switching raffle or switching back to edit mode
  useEffect(() => {
    if (formMode === "edit") {
      setTitle(raffle.title || "");
      setPrize(raffle.prize || "");
      setNote(raffle.note || "");
      setEndMode(raffle.end_mode === "manual" ? "manual" : "timer");
      setSpinModeField(raffle.spin_mode === "elimination" ? "elimination" : "winner");
      setEndsAtIso(
        toLocalDateTimeInput(
          raffle.end_mode === "manual" ? Date.now() + 86_400_000 : raffle.ends_at,
        ),
      );
      setHiddenField(Boolean(raffle.hidden));
      setConfirmDelete(false);
    } else {
      setTitle("");
      setPrize("$100");
      setNote("One entry per Kick account.");
      setEndMode("manual");
      setSpinModeField("winner");
      setEndsAtIso(toLocalDateTimeInput(Date.now() + 86_400_000));
      setHiddenField(false);
      setConfirmDelete(false);
    }
  }, [
    formMode,
    raffle.id,
    raffle.title,
    raffle.prize,
    raffle.note,
    raffle.end_mode,
    raffle.spin_mode,
    raffle.ends_at,
    raffle.hidden,
  ]);

  const currentSpinMode: RaffleSpinMode =
    raffle.spin_mode === "elimination" ? "elimination" : "winner";
  const currentSpeed: RaffleSpinSpeed =
    raffle.spin_speed === "fast" || raffle.spin_speed === "instant"
      ? raffle.spin_speed
      : "normal";
  const currentDurationMs =
    typeof raffle.spin_duration_ms === "number" && Number.isFinite(raffle.spin_duration_ms)
      ? Math.max(0, raffle.spin_duration_ms)
      : currentSpeed === "instant"
        ? 0
        : currentSpeed === "fast"
          ? 2000
          : 4000;

  const [customSecInput, setCustomSecInput] = useState<string>(() =>
    formatSpinSeconds(currentDurationMs),
  );
  const isEditingTimeRef = useRef(false);

  useEffect(() => {
    if (!isEditingTimeRef.current) {
      setCustomSecInput(formatSpinSeconds(currentDurationMs));
    }
  }, [raffle.id, currentDurationMs]);

  const previewDurationMs = parseSpinSecondsToMs(customSecInput, currentDurationMs);
  const isPresetSelected = (SPIN_TIME_PRESETS_MS as readonly number[]).includes(
    previewDurationMs,
  );

  const entriesLocked = Boolean(raffle.entries_locked);
  const isHidden = Boolean(raffle.hidden);
  const isEnded = raffle.ended_at != null;
  const hasWinner = Boolean(raffle.winner);
  const isDrumBusy = spinning || drumPhase === "spinning";

  // Stop auto-chain once winner is crowned or <=1 active entrant left
  useEffect(() => {
    if (autoChain && (hasWinner || activeEntries <= 1 || currentSpinMode !== "elimination")) {
      setAutoChain(false);
    }
  }, [autoChain, hasWinner, activeEntries, currentSpinMode]);

  const runSpin = useCallback(
    async (
      mode: "winner" | "elimination" | "reroll",
      extra?: { count?: number; auto_reset_if_done?: boolean },
    ) => {
      if (!raffleId || busy || isDrumBusy) return;
      const effectiveDurationMs = parseSpinSecondsToMs(customSecInput, currentDurationMs);
      const effectiveSpeed: RaffleSpinSpeed =
        effectiveDurationMs === 0 ? "instant" : effectiveDurationMs <= 2200 ? "fast" : "normal";
      setBusy(true);
      setFeedback(null);
      onSpinStart();
      try {
        const res = await streamerApi<SpinActionResult>(
          `/api/raffles/manage/${raffleId}/spin`,
          {
            method: "POST",
            body: {
              mode,
              count: extra?.count ?? 1,
              exclude_current: true,
              spin_speed: effectiveSpeed,
              spin_duration_ms: effectiveDurationMs,
              auto_reset_if_done: extra?.auto_reset_if_done,
            },
          },
        );
        await onSpinComplete(res);
      } catch (err) {
        const msg = errorCode(err) || "Spin failed";
        setAutoChain(false);
        setFeedback({ text: msg, error: true });
        onSpinError(msg);
      } finally {
        setBusy(false);
      }
    },
    [
      raffleId,
      busy,
      isDrumBusy,
      customSecInput,
      currentDurationMs,
      onSpinStart,
      onSpinComplete,
      onSpinError,
    ],
  );

  // Auto-elimination chain: trigger next elimination spin after settled pause
  const autoTimerRef = useRef<number>(0);
  useEffect(() => {
    window.clearTimeout(autoTimerRef.current);
    if (!autoChain || currentSpinMode !== "elimination") return;
    if (hasWinner || activeEntries <= 1) {
      setAutoChain(false);
      return;
    }
    if (busy || isDrumBusy) return;
    const pauseMs = previewDurationMs <= 1000 ? 350 : 550;
    autoTimerRef.current = window.setTimeout(() => {
      void runSpin("elimination", { count: 1 });
    }, pauseMs);
    return () => window.clearTimeout(autoTimerRef.current);
  }, [
    autoChain,
    currentSpinMode,
    hasWinner,
    activeEntries,
    busy,
    isDrumBusy,
    previewDurationMs,
    runSpin,
  ]);

  const patchSetting = async (patch: Record<string, unknown>, msg?: string) => {
    if (!raffleId || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await streamerApi(`/api/raffles/manage/${raffleId}`, {
        method: "PATCH",
        body: patch,
      });
      await onRaffleMutated(msg);
      if (msg) setFeedback({ text: msg });
    } catch (err) {
      setFeedback({ text: errorCode(err) || "Update failed", error: true });
    } finally {
      setBusy(false);
    }
  };

  const handleEndRaffle = async () => {
    if (!raffleId || busy || isDrumBusy || isEnded) return;
    setAutoChain(false);
    setBusy(true);
    setFeedback(null);
    try {
      await streamerApi(`/api/raffles/manage/${raffleId}/end`, {
        method: "POST",
        body: {},
      });
      await onRaffleMutated("Raffle ended");
      setFeedback({ text: "Raffle ended" });
    } catch (err) {
      setFeedback({ text: errorCode(err) || "Could not end raffle", error: true });
    } finally {
      setBusy(false);
    }
  };

  const runRecovery = async (
    endpoint: "revive-last" | "reset-eliminations" | "reset-winners" | "reopen",
    body: Record<string, unknown>,
    doneMsg: string,
  ) => {
    if (!raffleId || busy || isDrumBusy) return;
    setAutoChain(false);
    setBusy(true);
    setFeedback(null);
    try {
      await streamerApi(`/api/raffles/manage/${raffleId}/${endpoint}`, {
        method: "POST",
        body,
      });
      await onRaffleMutated(doneMsg);
      setFeedback({ text: doneMsg });
    } catch (err) {
      setFeedback({ text: errorCode(err) || "Action failed", error: true });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveForm = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setFeedback({ text: "Title is required", error: true });
      return;
    }
    const payload: Record<string, unknown> = {
      title: cleanTitle,
      prize: prize.trim(),
      note: note.trim() || null,
      end_mode: endMode,
      spin_mode: spinModeField,
      hidden: hiddenField,
    };
    if (endMode === "timer") {
      const parsedEnds = fromLocalDateTimeInput(endsAtIso);
      if (!parsedEnds) {
        setFeedback({ text: "Valid end time is required", error: true });
        return;
      }
      payload.ends_at = parsedEnds;
    }

    setBusy(true);
    setFeedback(null);
    try {
      if (formMode === "create") {
        const res = await streamerApi<{ ok: boolean; id: number }>("/api/raffles/manage", {
          method: "POST",
          body: payload,
        });
        if (res.id) {
          navigate(`/raffles/${res.id}/`);
        }
      } else {
        await streamerApi(`/api/raffles/manage/${raffleId}`, {
          method: "PATCH",
          body: payload,
        });
        await onRaffleMutated("Raffle saved");
        setFeedback({ text: "Saved changes" });
      }
    } catch (err) {
      setFeedback({ text: errorCode(err) || "Save failed", error: true });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteRaffle = async () => {
    if (!raffleId || busy) return;
    setBusy(true);
    try {
      await streamerApi(`/api/raffles/manage/${raffleId}`, { method: "DELETE" });
      navigate("/raffles/");
    } catch (err) {
      setFeedback({ text: errorCode(err) || "Delete failed", error: true });
      setBusy(false);
    }
  };

  return (
    <div className="raffle-streamer__stack">
      <div className="raffle-streamer__tabs" role="tablist" aria-label="Streamer raffle sections">
        {(
          [
            ["draw", "Draw"],
            ["settings", "Settings"],
            ["edit", "Edit / +"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            data-streamer-tab={key}
            className={`raffle-streamer__tab${tab === key ? " is-active" : ""}`}
            onClick={() => {
              setTab(key);
              setFeedback(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "draw" && (
        <div className="raffle-streamer__section">
          {/* Spin Mode Selector: Winner vs Elimination */}
          <div className="raffle-streamer__row">
            <span className="raffle-streamer__label">Spin mode</span>
            <div className="raffle-streamer__seg" role="radiogroup" aria-label="Spin mode">
              <button
                type="button"
                role="radio"
                aria-checked={currentSpinMode === "winner"}
                data-streamer-spin-mode="winner"
                disabled={busy || isDrumBusy}
                className={`raffle-streamer__seg-btn${currentSpinMode === "winner" ? " is-active" : ""}`}
                onClick={() => {
                  if (currentSpinMode !== "winner") {
                    setAutoChain(false);
                    void patchSetting({ spin_mode: "winner" });
                  }
                }}
              >
                Winner
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={currentSpinMode === "elimination"}
                data-streamer-spin-mode="elimination"
                disabled={busy || isDrumBusy}
                className={`raffle-streamer__seg-btn${currentSpinMode === "elimination" ? " is-active" : ""}`}
                onClick={() => {
                  if (currentSpinMode !== "elimination") {
                    void patchSetting({ spin_mode: "elimination" });
                  }
                }}
              >
                Elimination
              </button>
            </div>
          </div>

          {/* Primary Spin / Elimination / Draw / End CTA Block */}
          {currentSpinMode === "elimination" ? (
            <div className="raffle-streamer__cta-group">
              <div
                className={`raffle-streamer__spin-combo${autoChain ? " is-auto-on" : ""}`}
                data-streamer-elim-combo=""
              >
                <button
                  type="button"
                  className="raffle-streamer__spin-main"
                  data-streamer-spin-elim=""
                  disabled={
                    (busy && !autoChain) ||
                    (isDrumBusy && !autoChain) ||
                    activeEntries === 0 ||
                    (hasWinner && !autoChain)
                  }
                  onClick={() => {
                    if (autoChain) {
                      setAutoChain(false);
                    } else {
                      void runSpin("elimination", { count: 1 });
                    }
                  }}
                >
                  {autoChain
                    ? "Auto Spinning… (Stop)"
                    : isDrumBusy
                      ? "Spinning…"
                      : hasWinner
                        ? "Last Player Won"
                        : activeEntries <= 1
                          ? "Crown Last Player"
                          : "Spin"}
                </button>
                <button
                  type="button"
                  className={`raffle-streamer__spin-auto${autoChain ? " is-active" : ""}`}
                  data-streamer-auto-elim=""
                  aria-pressed={autoChain}
                  disabled={!autoChain && (hasWinner || activeEntries < 2)}
                  title="Automatically keep spinning until the last player wins"
                  onClick={() => {
                    const next = !autoChain;
                    setAutoChain(next);
                    if (next && !isDrumBusy && !busy && !hasWinner && activeEntries >= 2) {
                      void runSpin("elimination", { count: 1 });
                    }
                  }}
                >
                  <span className="raffle-streamer__spin-auto-ind" aria-hidden="true" />
                  <span>Auto spins</span>
                </button>
              </div>

              <div className="raffle-streamer__btn-pair">
                <button
                  type="button"
                  className="raffle-streamer__btn raffle-streamer__btn--ghost"
                  data-streamer-reset-pool=""
                  disabled={busy || isDrumBusy || (eliminatedEntries === 0 && !hasWinner)}
                  onClick={() =>
                    void runRecovery(
                      "reset-eliminations",
                      { reopen: false },
                      "All players restored",
                    )
                  }
                >
                  Reset
                </button>
                {!hasWinner && activeEntries >= 2 && (
                  <button
                    type="button"
                    className="raffle-streamer__btn raffle-streamer__btn--ghost"
                    data-streamer-draw=""
                    disabled={busy || isDrumBusy}
                    onClick={() => {
                      setAutoChain(false);
                      void runSpin("winner");
                    }}
                  >
                    Draw Winner
                  </button>
                )}
                <button
                  type="button"
                  className={`raffle-streamer__btn ${
                    isEnded ? "raffle-streamer__btn--ghost" : "raffle-streamer__btn--danger-soft"
                  }`}
                  data-streamer-end-raffle=""
                  disabled={busy || isDrumBusy || isEnded}
                  onClick={() => void handleEndRaffle()}
                >
                  {isEnded ? "Raffle Ended" : "End Raffle"}
                </button>
              </div>
            </div>
          ) : (
            <div className="raffle-streamer__cta-group">
              <div className="raffle-streamer__btn-pair">
                <button
                  type="button"
                  className="raffle-streamer__btn raffle-streamer__btn--primary"
                  data-streamer-draw=""
                  data-streamer-reroll={hasWinner ? "" : undefined}
                  disabled={busy || isDrumBusy || totalEntries === 0}
                  onClick={() => void runSpin(hasWinner ? "reroll" : "winner")}
                >
                  {isDrumBusy
                    ? "Spinning Drum…"
                    : hasWinner
                      ? "Reroll Winner"
                      : "Draw Winner"}
                </button>
                <button
                  type="button"
                  className={`raffle-streamer__btn ${
                    isEnded ? "raffle-streamer__btn--ghost" : "raffle-streamer__btn--danger-soft"
                  }`}
                  data-streamer-end-raffle=""
                  disabled={busy || isDrumBusy || isEnded}
                  onClick={() => void handleEndRaffle()}
                >
                  {isEnded ? "Raffle Ended" : "End Raffle"}
                </button>
              </div>
            </div>
          )}

          {/* Spin Time (Suggested Presets + Custom Seconds Input) */}
          <div className="raffle-streamer__row raffle-streamer__row--time">
            <span className="raffle-streamer__label">Spin time</span>
            <div className="raffle-streamer__time-controls">
              <div className="raffle-streamer__seg" role="group" aria-label="Preset spin times">
                {SPIN_TIME_PRESETS_MS.map((ms) => {
                  const secLabel = `${ms / 1000}s`;
                  const isActive = previewDurationMs === ms;
                  return (
                    <button
                      key={ms}
                      type="button"
                      data-streamer-spin-preset={ms}
                      className={`raffle-streamer__seg-btn${isActive ? " is-active" : ""}`}
                      onClick={() => {
                        isEditingTimeRef.current = false;
                        setCustomSecInput(formatSpinSeconds(ms));
                        if (currentDurationMs !== ms && !busy) {
                          void patchSetting({ spin_duration_ms: ms });
                        }
                      }}
                    >
                      {secLabel}
                    </button>
                  );
                })}
              </div>
              <label
                className={`raffle-streamer__time-custom${!isPresetSelected ? " is-custom" : ""}`}
                title="Custom spin time in seconds"
              >
                <input
                  type="number"
                  min={0}
                  max={120}
                  step={0.5}
                  inputMode="decimal"
                  aria-label="Custom spin time in seconds"
                  data-streamer-spin-seconds=""
                  className="raffle-streamer__time-input"
                  value={customSecInput}
                  onFocus={() => {
                    isEditingTimeRef.current = true;
                  }}
                  onChange={(e) => setCustomSecInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={() => {
                    isEditingTimeRef.current = false;
                    const nextMs = parseSpinSecondsToMs(customSecInput, currentDurationMs);
                    setCustomSecInput(formatSpinSeconds(nextMs));
                    if (nextMs !== currentDurationMs && !busy) {
                      void patchSetting({ spin_duration_ms: nextMs });
                    }
                  }}
                />
                <span className="raffle-streamer__time-unit">s</span>
              </label>
            </div>
          </div>

          {/* Lock Entries */}
          <label className="local-admin__account raffle-streamer__switch-row">
            <span>Lock entries</span>
            <span className="local-admin__switch">
              <input
                type="checkbox"
                className="local-admin__input"
                role="switch"
                data-streamer-lock-entries=""
                checked={entriesLocked}
                disabled={busy || raffle.ended_at != null}
                onChange={(e) =>
                  void patchSetting(
                    { entries_locked: e.target.checked },
                    e.target.checked ? "Entries locked" : "Entries unlocked",
                  )
                }
              />
            </span>
          </label>
        </div>
      )}

      {tab === "settings" && (
        <div className="raffle-streamer__section">
          <div className="raffle-streamer__row">
            <span className="raffle-streamer__label">Completion</span>
            <div className="raffle-streamer__seg" role="radiogroup" aria-label="Completion mode">
              <button
                type="button"
                role="radio"
                aria-checked={raffle.end_mode === "manual"}
                disabled={busy}
                className={`raffle-streamer__seg-btn${raffle.end_mode === "manual" ? " is-active" : ""}`}
                onClick={() => {
                  if (raffle.end_mode !== "manual") {
                    void patchSetting({ end_mode: "manual" }, "Switched to manual draw");
                  }
                }}
              >
                Manual
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={raffle.end_mode !== "manual"}
                disabled={busy}
                className={`raffle-streamer__seg-btn${raffle.end_mode !== "manual" ? " is-active" : ""}`}
                onClick={() => {
                  if (raffle.end_mode === "manual") {
                    void patchSetting(
                      { end_mode: "timer", ends_at: Date.now() + 3_600_000 },
                      "1h countdown started",
                    );
                  }
                }}
              >
                Timer
              </button>
            </div>
          </div>

          {raffle.end_mode !== "manual" && (
            <div className="raffle-streamer__row">
              <span className="raffle-streamer__label">Adjust timer</span>
              <div className="local-admin__steps">
                <button
                  type="button"
                  className="local-admin__action"
                  disabled={busy}
                  onClick={() =>
                    void patchSetting(
                      { end_mode: "timer", bump_ms: -5 * 60_000 },
                      "−5m applied",
                    )
                  }
                >
                  −5m
                </button>
                <button
                  type="button"
                  className="local-admin__action"
                  disabled={busy}
                  onClick={() =>
                    void patchSetting(
                      { end_mode: "timer", bump_ms: 5 * 60_000 },
                      "+5m added",
                    )
                  }
                >
                  +5m
                </button>
                <button
                  type="button"
                  className="local-admin__action"
                  disabled={busy}
                  onClick={() =>
                    void patchSetting(
                      { end_mode: "timer", bump_ms: 15 * 60_000 },
                      "+15m added",
                    )
                  }
                >
                  +15m
                </button>
                <button
                  type="button"
                  className="local-admin__action"
                  disabled={busy}
                  onClick={() =>
                    void patchSetting(
                      { end_mode: "timer", bump_ms: 60 * 60_000 },
                      "+1h added",
                    )
                  }
                >
                  +1h
                </button>
              </div>
            </div>
          )}

          <label className="local-admin__account raffle-streamer__switch-row">
            <span>Hidden from public</span>
            <span className="local-admin__switch">
              <input
                type="checkbox"
                className="local-admin__input"
                role="switch"
                data-streamer-hidden=""
                checked={isHidden}
                disabled={busy}
                onChange={(e) =>
                  void patchSetting(
                    { hidden: e.target.checked },
                    e.target.checked ? "Raffle hidden" : "Raffle public",
                  )
                }
              />
            </span>
          </label>

          <div className="raffle-streamer__btn-pair">
            {(raffle.ended_at != null || entriesLocked) && (
              <button
                type="button"
                className="raffle-streamer__btn raffle-streamer__btn--ghost"
                data-streamer-reopen=""
                disabled={busy || isDrumBusy}
                onClick={() =>
                  void runRecovery(
                    "reopen",
                    { clear_winner: false, unlock_entries: true },
                    "Raffle reopened",
                  )
                }
              >
                Reopen Raffle
              </button>
            )}
            {hasWinner && (
              <button
                type="button"
                className="raffle-streamer__btn raffle-streamer__btn--ghost"
                disabled={busy || isDrumBusy}
                onClick={() =>
                  void runRecovery("reset-winners", {}, "Winners reset")
                }
              >
                Reset Winners
              </button>
            )}
          </div>

          <button
            type="button"
            className="raffle-streamer__btn raffle-streamer__btn--ghost"
            onClick={() => void copy()}
          >
            {copied ? "✓ Participation Link Copied" : "Copy Participation Link"}
          </button>
        </div>
      )}

      {tab === "edit" && (
        <form className="raffle-streamer__form" onSubmit={(e) => void handleSaveForm(e)}>
          <div className="raffle-streamer__seg raffle-streamer__seg--full">
            <button
              type="button"
              className={`raffle-streamer__seg-btn${formMode === "edit" ? " is-active" : ""}`}
              onClick={() => setFormMode("edit")}
            >
              Edit Current
            </button>
            <button
              type="button"
              data-streamer-new-mode=""
              className={`raffle-streamer__seg-btn${formMode === "create" ? " is-active" : ""}`}
              onClick={() => setFormMode("create")}
            >
              + New Raffle
            </button>
          </div>

          <label className="raffle-streamer__field">
            <span>Title</span>
            <input
              type="text"
              className="raffle-streamer__input"
              data-streamer-input-title=""
              value={title}
              maxLength={120}
              placeholder="Stream $250 Giveaway"
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>

          <div className="raffle-streamer__field-grid">
            <label className="raffle-streamer__field">
              <span>Prize</span>
              <input
                type="text"
                className="raffle-streamer__input"
                data-streamer-input-prize=""
                value={prize}
                maxLength={120}
                placeholder="$250"
                onChange={(e) => setPrize(e.target.value)}
              />
            </label>

            <label className="raffle-streamer__field">
              <span>Spin type</span>
              <select
                className="raffle-streamer__input"
                value={spinModeField}
                onChange={(e) =>
                  setSpinModeField(e.target.value === "elimination" ? "elimination" : "winner")
                }
              >
                <option value="winner">Winner Draw</option>
                <option value="elimination">Elimination</option>
              </select>
            </label>
          </div>

          <div className="raffle-streamer__field-grid">
            <label className="raffle-streamer__field">
              <span>End mode</span>
              <select
                className="raffle-streamer__input"
                value={endMode}
                onChange={(e) =>
                  setEndMode(e.target.value === "manual" ? "manual" : "timer")
                }
              >
                <option value="manual">Manual (Button)</option>
                <option value="timer">Countdown Timer</option>
              </select>
            </label>

            {endMode === "timer" && (
              <label className="raffle-streamer__field">
                <span>Ends at</span>
                <input
                  type="datetime-local"
                  className="raffle-streamer__input"
                  value={endsAtIso}
                  onChange={(e) => setEndsAtIso(e.target.value)}
                />
              </label>
            )}
          </div>

          <label className="raffle-streamer__field">
            <span>Brief rules (optional)</span>
            <input
              type="text"
              className="raffle-streamer__input"
              value={note}
              maxLength={500}
              placeholder="1 entry per Kick viewer"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          <label className="local-admin__account raffle-streamer__switch-row">
            <span>Start hidden</span>
            <span className="local-admin__switch">
              <input
                type="checkbox"
                className="local-admin__input"
                role="switch"
                checked={hiddenField}
                onChange={(e) => setHiddenField(e.target.checked)}
              />
            </span>
          </label>

          <button
            type="submit"
            className="raffle-streamer__btn raffle-streamer__btn--primary"
            data-streamer-submit=""
            disabled={busy}
          >
            {busy
              ? "Saving…"
              : formMode === "create"
                ? "Create & Open Raffle"
                : "Save Raffle Changes"}
          </button>

          {formMode === "edit" && (
            <div className="raffle-streamer__danger-row">
              {confirmDelete ? (
                <div className="raffle-streamer__btn-pair">
                  <button
                    type="button"
                    className="raffle-streamer__btn raffle-streamer__btn--danger"
                    data-streamer-confirm-delete=""
                    disabled={busy}
                    onClick={() => void handleDeleteRaffle()}
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    className="raffle-streamer__btn raffle-streamer__btn--ghost"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="raffle-streamer__btn raffle-streamer__btn--danger-soft"
                  data-streamer-delete=""
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete Raffle
                </button>
              )}
            </div>
          )}
        </form>
      )}

      {feedback && (
        <p
          className={`raffle-streamer__feedback${feedback.error ? " is-error" : ""}`}
          role="status"
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}

/* ───────────── List Mode (/raffles/) ───────────── */

function ListOverlayBody({
  showAllOnPage,
  onToggleShowAllOnPage,
  externalEditRaffle,
  onClearExternalEdit,
  onListMutated,
  navigate,
  onEnsureOpen,
}: StreamerOverlayListProps & {
  navigate: ReturnType<typeof useNavigate>;
  onEnsureOpen: () => void;
}) {
  const [tab, setTab] = useState<ListTab>("manage");
  const [allRaffles, setAllRaffles] = useState<Raffle[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Raffle | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);

  // Form fields
  const [title, setTitle] = useState("");
  const [prize, setPrize] = useState("$250");
  const [note, setNote] = useState("One entry per Kick account.");
  const [endMode, setEndMode] = useState<RaffleEndMode>("manual");
  const [spinMode, setSpinMode] = useState<RaffleSpinMode>("winner");
  const [endsAtIso, setEndsAtIso] = useState(() =>
    toLocalDateTimeInput(Date.now() + 86_400_000),
  );
  const [hidden, setHidden] = useState(false);

  const loadManaged = useCallback(async () => {
    setLoading(true);
    try {
      const res = await streamerApi<{ raffles?: Raffle[] }>("/api/raffles/manage");
      setAllRaffles(Array.isArray(res.raffles) ? res.raffles : []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadManaged();
  }, [loadManaged]);

  const populateForm = useCallback((target: Raffle | null) => {
    setEditing(target);
    setConfirmDelete(false);
    setFeedback(null);
    if (target) {
      setTitle(target.title || "");
      setPrize(target.prize || "");
      setNote(target.note || "");
      setEndMode(target.end_mode === "manual" ? "manual" : "timer");
      setSpinMode(target.spin_mode === "elimination" ? "elimination" : "winner");
      setEndsAtIso(
        toLocalDateTimeInput(
          target.end_mode === "manual" ? Date.now() + 86_400_000 : target.ends_at,
        ),
      );
      setHidden(Boolean(target.hidden));
    } else {
      setTitle("");
      setPrize("$250");
      setNote("One entry per Kick account.");
      setEndMode("manual");
      setSpinMode("winner");
      setEndsAtIso(toLocalDateTimeInput(Date.now() + 86_400_000));
      setHidden(false);
    }
  }, []);

  useEffect(() => {
    if (externalEditRaffle) {
      onEnsureOpen();
      populateForm(externalEditRaffle);
      setTab("form");
      onClearExternalEdit?.();
    }
  }, [externalEditRaffle, onClearExternalEdit, onEnsureOpen, populateForm]);

  const counts = useMemo(() => {
    const now = Date.now();
    let live = 0;
    let ended = 0;
    let hiddenCount = 0;
    for (const r of allRaffles) {
      if (r.hidden) hiddenCount += 1;
      const isLive =
        r.ended_at == null &&
        (r.end_mode === "manual" ||
          (Number(r.ends_at) || 0) > now ||
          r.spin_mode === "elimination");
      if (isLive) live += 1;
      else ended += 1;
    }
    return { live, ended, hiddenCount };
  }, [allRaffles]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setFeedback({ text: "Title is required", error: true });
      return;
    }
    const payload: Record<string, unknown> = {
      title: cleanTitle,
      prize: prize.trim(),
      note: note.trim() || null,
      end_mode: endMode,
      spin_mode: spinMode,
      hidden,
    };
    if (endMode === "timer") {
      const parsed = fromLocalDateTimeInput(endsAtIso);
      if (!parsed) {
        setFeedback({ text: "Valid end date is required", error: true });
        return;
      }
      payload.ends_at = parsed;
    }

    setBusy(true);
    setFeedback(null);
    try {
      if (editing?.id) {
        await streamerApi(`/api/raffles/manage/${editing.id}`, {
          method: "PATCH",
          body: payload,
        });
        await loadManaged();
        onListMutated();
        setFeedback({ text: "Raffle updated" });
        setTab("manage");
      } else {
        const res = await streamerApi<{ ok: boolean; id: number }>("/api/raffles/manage", {
          method: "POST",
          body: payload,
        });
        await loadManaged();
        onListMutated();
        if (res.id) {
          navigate(`/raffles/${res.id}/`);
        }
      }
    } catch (err) {
      setFeedback({ text: errorCode(err) || "Save failed", error: true });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!editing?.id || busy) return;
    setBusy(true);
    try {
      await streamerApi(`/api/raffles/manage/${editing.id}`, { method: "DELETE" });
      populateForm(null);
      setTab("manage");
      await loadManaged();
      onListMutated();
    } catch (err) {
      setFeedback({ text: errorCode(err) || "Delete failed", error: true });
    } finally {
      setBusy(false);
    }
  };

  const handleQuickDraw = async (row: Raffle) => {
    const id = Number(row.id) || 0;
    if (!id || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const mode = row.winner ? "reroll" : "winner";
      const res = await streamerApi<SpinActionResult>(`/api/raffles/manage/${id}/spin`, {
        method: "POST",
        body: { mode },
      });
      await loadManaged();
      onListMutated();
      setFeedback({
        text: res.winner ? `Winner: ${res.winner}` : "Winner drawn",
      });
    } catch (err) {
      setFeedback({ text: errorCode(err) || "Draw failed", error: true });
    } finally {
      setBusy(false);
    }
  };

  const handleQuickEnd = async (row: Raffle) => {
    const id = Number(row.id) || 0;
    if (!id || busy || row.ended_at != null) return;
    setBusy(true);
    setFeedback(null);
    try {
      await streamerApi(`/api/raffles/manage/${id}/end`, {
        method: "POST",
        body: {},
      });
      await loadManaged();
      onListMutated();
      setFeedback({ text: "Raffle ended" });
    } catch (err) {
      setFeedback({ text: errorCode(err) || "Could not end raffle", error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="raffle-streamer__stack">
      <div className="raffle-streamer__tabs" role="tablist" aria-label="Streamer raffles manager">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "manage"}
          data-streamer-tab="manage"
          className={`raffle-streamer__tab${tab === "manage" ? " is-active" : ""}`}
          onClick={() => {
            setTab("manage");
            setFeedback(null);
          }}
        >
          Manage ({allRaffles.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "form"}
          data-streamer-tab="new"
          className={`raffle-streamer__tab${tab === "form" ? " is-active" : ""}`}
          onClick={() => {
            if (tab !== "form" || editing) populateForm(null);
            setTab("form");
          }}
        >
          {editing ? `Edit #${editing.id}` : "+ New Raffle"}
        </button>
      </div>

      {tab === "manage" ? (
        <div className="raffle-streamer__section">
          <div className="raffle-streamer__kpis">
            <span>
              <strong>{counts.live}</strong> live
            </span>
            <span>
              <strong>{counts.ended}</strong> ended
            </span>
            <span>
              <strong>{counts.hiddenCount}</strong> hidden
            </span>
          </div>

          <label className="local-admin__account raffle-streamer__switch-row">
            <span>Show ended & hidden</span>
            <span className="local-admin__switch">
              <input
                type="checkbox"
                className="local-admin__input"
                role="switch"
                data-streamer-show-all=""
                checked={showAllOnPage}
                onChange={(e) => onToggleShowAllOnPage(e.target.checked)}
              />
            </span>
          </label>

          <button
            type="button"
            className="raffle-streamer__btn raffle-streamer__btn--primary"
            data-streamer-open-create=""
            onClick={() => {
              populateForm(null);
              setTab("form");
            }}
          >
            + Create New Raffle
          </button>

          <div className="raffle-streamer__list">
            {loading && allRaffles.length === 0 ? (
              <p className="raffle-streamer__empty">Loading raffles…</p>
            ) : allRaffles.length === 0 ? (
              <p className="raffle-streamer__empty">No raffles created yet.</p>
            ) : (
              allRaffles.slice(0, 10).map((r) => {
                const id = Number(r.id) || 0;
                const entries = Number(r.entry_count ?? r.entries) || 0;
                const isEnded = r.ended_at != null;
                return (
                  <div key={id} className="raffle-streamer__item">
                    <div className="raffle-streamer__item-main">
                      <Link className="raffle-streamer__item-title" to={`/raffles/${id}/`}>
                        {r.title || `Raffle #${id}`}
                      </Link>
                      <span className="raffle-streamer__item-sub">
                        {r.prize ? `${r.prize} · ` : ""}
                        {entries} in
                        {r.spin_mode === "elimination" ? " · Elim" : ""}
                        {r.hidden ? " · Hidden" : ""}
                        {r.winner ? ` · Won: ${r.winner}` : ""}
                        {isEnded ? " · Ended" : ""}
                      </span>
                    </div>
                    <div className="raffle-streamer__item-actions">
                      <button
                        type="button"
                        className="local-admin__action"
                        onClick={() => {
                          populateForm(r);
                          setTab("form");
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="local-admin__action"
                        disabled={busy || entries === 0}
                        onClick={() => void handleQuickDraw(r)}
                      >
                        {r.winner ? "Reroll" : "Draw"}
                      </button>
                      {!isEnded && (
                        <button
                          type="button"
                          className="local-admin__action"
                          disabled={busy}
                          onClick={() => void handleQuickEnd(r)}
                        >
                          End
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <form className="raffle-streamer__form" onSubmit={(e) => void handleSave(e)}>
          <label className="raffle-streamer__field">
            <span>Title</span>
            <input
              type="text"
              className="raffle-streamer__input"
              data-streamer-input-title=""
              value={title}
              maxLength={120}
              placeholder="Stream $250 Giveaway"
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>

          <div className="raffle-streamer__field-grid">
            <label className="raffle-streamer__field">
              <span>Prize</span>
              <input
                type="text"
                className="raffle-streamer__input"
                data-streamer-input-prize=""
                value={prize}
                maxLength={120}
                placeholder="$250"
                onChange={(e) => setPrize(e.target.value)}
              />
            </label>

            <label className="raffle-streamer__field">
              <span>Spin type</span>
              <select
                className="raffle-streamer__input"
                data-streamer-select-spin=""
                value={spinMode}
                onChange={(e) =>
                  setSpinMode(e.target.value === "elimination" ? "elimination" : "winner")
                }
              >
                <option value="winner">Winner Draw</option>
                <option value="elimination">Elimination</option>
              </select>
            </label>
          </div>

          <div className="raffle-streamer__field-grid">
            <label className="raffle-streamer__field">
              <span>End mode</span>
              <select
                className="raffle-streamer__input"
                value={endMode}
                onChange={(e) =>
                  setEndMode(e.target.value === "manual" ? "manual" : "timer")
                }
              >
                <option value="manual">Manual (Button)</option>
                <option value="timer">Countdown Timer</option>
              </select>
            </label>

            {endMode === "timer" && (
              <label className="raffle-streamer__field">
                <span>Ends at</span>
                <input
                  type="datetime-local"
                  className="raffle-streamer__input"
                  value={endsAtIso}
                  onChange={(e) => setEndsAtIso(e.target.value)}
                />
              </label>
            )}
          </div>

          <label className="raffle-streamer__field">
            <span>Brief rules (optional)</span>
            <input
              type="text"
              className="raffle-streamer__input"
              value={note}
              maxLength={500}
              placeholder="1 entry per Kick viewer"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          <label className="local-admin__account raffle-streamer__switch-row">
            <span>Hidden from public</span>
            <span className="local-admin__switch">
              <input
                type="checkbox"
                className="local-admin__input"
                role="switch"
                checked={hidden}
                onChange={(e) => setHidden(e.target.checked)}
              />
            </span>
          </label>

          <button
            type="submit"
            className="raffle-streamer__btn raffle-streamer__btn--primary"
            data-streamer-submit=""
            disabled={busy}
          >
            {busy
              ? "Saving…"
              : editing
                ? "Save Raffle Changes"
                : "Create & Open Raffle"}
          </button>

          {editing && (
            <div className="raffle-streamer__danger-row">
              {confirmDelete ? (
                <div className="raffle-streamer__btn-pair">
                  <button
                    type="button"
                    className="raffle-streamer__btn raffle-streamer__btn--danger"
                    disabled={busy}
                    onClick={() => void handleDelete()}
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    className="raffle-streamer__btn raffle-streamer__btn--ghost"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="raffle-streamer__btn raffle-streamer__btn--danger-soft"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete Raffle
                </button>
              )}
            </div>
          )}
        </form>
      )}

      {feedback && (
        <p
          className={`raffle-streamer__feedback${feedback.error ? " is-error" : ""}`}
          role="status"
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}

