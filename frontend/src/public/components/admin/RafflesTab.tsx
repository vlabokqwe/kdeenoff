import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNow } from "../../hooks/useNow";
import { adminApi, errorCode } from "../../lib/api";
import { countdown } from "../../lib/boards";
import { reduceMotion, safeAvatar } from "../../lib/format";
import {
  IconBolt,
  IconCheck,
  IconClose,
  IconDice,
  IconDownload,
  IconEdit,
  IconExternal,
  IconEye,
  IconEyeOff,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTicket,
  IconTrash,
  IconTrophy,
  IconUsers,
} from "./AdminIcons";
import {
  csvEscape,
  downloadTextFile,
  fmtDateTime,
  fmtShortDate,
  fromLocalISO,
  relTime,
  toLocalISO,
  type AdminRaffle,
  type AdminRaffleEntry,
  type ToastKind,
} from "./adminTypes";

type RaffleFilter = "all" | "live" | "upcoming" | "finished" | "hidden";

interface RafflesTabProps {
  createTrigger: number;
  notify: (text: string, kind?: ToastKind) => void;
  onChanged: () => void;
  onOpenPublicPath: (path: string) => void;
}

interface DrawResponse {
  ok: boolean;
  id: number;
  winner: string;
  kick_user_id: string;
  avatar_url: string;
  entry_count: number;
  candidates: string[];
}

export function RafflesTab({
  createTrigger,
  notify,
  onChanged,
  onOpenPublicPath,
}: RafflesTabProps) {
  const now = useNow();
  const [raffles, setRaffles] = useState<AdminRaffle[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RaffleFilter>("all");
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Create / Edit Raffle form
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [fTitle, setFTitle] = useState("");
  const [fPrize, setFPrize] = useState("");
  const [fNote, setFNote] = useState("");
  const [fWinner, setFWinner] = useState("");
  const [fEndMode, setFEndMode] = useState<"timer" | "manual">("timer");
  const [fStartsAt, setFStartsAt] = useState(() => toLocalISO(Date.now()));
  const [fEndsAt, setFEndsAt] = useState(() => toLocalISO(Date.now() + 7 * 86_400_000));
  const [fHidden, setFHidden] = useState(false);
  const [fIsDemo, setFIsDemo] = useState(false);
  const [savingForm, setSavingForm] = useState(false);

  // Entrants & Winner Draw Inspector
  const [inspectId, setInspectId] = useState<number | null>(null);
  const [inspectRaffle, setInspectRaffle] = useState<AdminRaffle | null>(null);
  const [entries, setEntries] = useState<AdminRaffleEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [entrySearch, setEntrySearch] = useState("");
  const [confirmRemoveEntryId, setConfirmRemoveEntryId] = useState<number | null>(null);

  // Winner reel animation state
  const [drawing, setDrawing] = useState(false);
  const [reelName, setReelName] = useState<string | null>(null);
  const [drawnResult, setDrawnResult] = useState<{
    winner: string;
    avatarUrl: string;
    kickUserId: string;
  } | null>(null);
  const reelTimerRef = useRef<number>(0);

  const lastTriggerRef = useRef(createTrigger);

  useEffect(
    () => () => {
      window.clearTimeout(reelTimerRef.current);
    },
    [],
  );

  const loadRaffles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi<{ raffles?: AdminRaffle[] }>("/api/admin/raffles");
      setRaffles(res.raffles || []);
    } catch (err) {
      notify(`Failed to load raffles: ${errorCode(err)}`, "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadEntries = useCallback(
    async (id: number, silent = false) => {
      if (!silent) setLoadingEntries(true);
      try {
        const res = await adminApi<{
          raffle: AdminRaffle;
          entries: AdminRaffleEntry[];
        }>(`/api/admin/raffles/${id}/entries`);
        setInspectRaffle(res.raffle);
        setEntries(res.entries || []);
      } catch (err) {
        notify(`Failed to load entrants: ${errorCode(err)}`, "error");
        setInspectId(null);
      } finally {
        if (!silent) setLoadingEntries(false);
      }
    },
    [notify],
  );

  useEffect(() => {
    void loadRaffles();
  }, [loadRaffles]);

  useEffect(() => {
    if (inspectId != null) {
      setDrawnResult(null);
      setReelName(null);
      setEntrySearch("");
      setConfirmRemoveEntryId(null);
      void loadEntries(inspectId);
    } else {
      setInspectRaffle(null);
      setEntries([]);
    }
  }, [inspectId, loadEntries]);

  const openCreator = useCallback(() => {
    const start = Date.now();
    setEditorMode("create");
    setEditingId(null);
    setFTitle("");
    setFPrize("$500 Cash");
    setFNote("");
    setFWinner("");
    setFEndMode("timer");
    setFStartsAt(toLocalISO(start));
    setFEndsAt(toLocalISO(start + 7 * 86_400_000));
    setFHidden(false);
    setFIsDemo(false);
  }, []);

  useEffect(() => {
    if (createTrigger > lastTriggerRef.current) {
      lastTriggerRef.current = createTrigger;
      openCreator();
    }
  }, [createTrigger, openCreator]);

  const openEditor = (r: AdminRaffle) => {
    const isManual = r.end_mode === "manual";
    setEditorMode("edit");
    setEditingId(r.id);
    setFTitle(r.title || "");
    setFPrize(r.prize || "");
    setFNote(r.note || "");
    setFWinner(r.winner || "");
    setFEndMode(isManual ? "manual" : "timer");
    setFStartsAt(toLocalISO(r.starts_at));
    setFEndsAt(
      isManual && r.ended_at == null
        ? toLocalISO(Date.now() + 7 * 86_400_000)
        : toLocalISO(r.ends_at),
    );
    setFHidden(Boolean(r.hidden));
    setFIsDemo(Boolean(r.is_demo));
  };

  const applyEndOffsetHours = (hours: number) => {
    const base = fromLocalISO(fStartsAt) ?? Date.now();
    setFStartsAt(toLocalISO(base));
    setFEndsAt(toLocalISO(base + hours * 3_600_000));
  };

  const isRaffleFinished = useCallback(
    (r: AdminRaffle) => {
      if (r.ended_at != null) return true;
      if (r.end_mode === "manual") return false;
      return (Number(r.ends_at) || 0) <= now;
    },
    [now],
  );

  const counts = useMemo(() => {
    let live = 0;
    let upcoming = 0;
    let finished = 0;
    let hidden = 0;
    for (const r of raffles) {
      if (r.hidden) hidden += 1;
      const s = Number(r.starts_at) || 0;
      const done = isRaffleFinished(r);
      if (done) finished += 1;
      else if (s > now) upcoming += 1;
      else if (!r.hidden) live += 1;
    }
    return { all: raffles.length, live, upcoming, finished, hidden };
  }, [raffles, now, isRaffleFinished]);

  const filteredRaffles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return raffles.filter((r) => {
      const s = Number(r.starts_at) || 0;
      const done = isRaffleFinished(r);
      if (filter === "hidden" && !r.hidden) return false;
      if (filter === "live" && (Boolean(r.hidden) || s > now || done)) return false;
      if (filter === "upcoming" && (Boolean(r.hidden) || s <= now || done)) return false;
      if (filter === "finished" && !done) return false;
      if (q) {
        const hay = `${r.title} ${r.prize || ""} ${r.winner || ""} ${r.note || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [raffles, filter, search, now, isRaffleFinished]);

  const handleSaveRaffle = async (e: FormEvent) => {
    e.preventDefault();
    const title = fTitle.trim();
    if (!title) {
      notify("Raffle title is required", "error");
      return;
    }
    const startsAt = fromLocalISO(fStartsAt) ?? Date.now();
    const endsAt = fEndMode === "timer" ? fromLocalISO(fEndsAt) : null;
    if (fEndMode === "timer" && (!endsAt || endsAt <= startsAt)) {
      notify("End date must be after start date", "error");
      return;
    }

    setSavingForm(true);
    try {
      const payload: Record<string, unknown> = {
        title,
        prize: fPrize.trim(),
        note: fNote.trim() || null,
        winner: fWinner.trim() || null,
        end_mode: fEndMode,
        starts_at: startsAt,
        hidden: fHidden,
        is_demo: fIsDemo,
      };
      if (fEndMode === "timer" && endsAt) {
        payload.ends_at = endsAt;
      }
      if (editorMode === "edit" && editingId != null) {
        await adminApi(`/api/admin/raffles/${editingId}`, {
          method: "PATCH",
          body: payload,
        });
        if (inspectId === editingId) await loadEntries(editingId, true);
        notify(`Updated raffle "${title}"`, "success");
      } else {
        const res = await adminApi<{ id: number }>("/api/admin/raffles", {
          method: "POST",
          body: payload,
        });
        notify(`Created raffle "${title}"`, "success");
        setInspectId(res.id);
      }
      setEditorMode(null);
      setEditingId(null);
      await loadRaffles();
      onChanged();
    } catch (err) {
      notify(`Save failed: ${errorCode(err)}`, "error");
    } finally {
      setSavingForm(false);
    }
  };

  const handleToggleHidden = async (r: AdminRaffle) => {
    setBusyKey(`hide:${r.id}`);
    try {
      await adminApi(`/api/admin/raffles/${r.id}`, {
        method: "PATCH",
        body: { hidden: !r.hidden },
      });
      await loadRaffles();
      if (inspectId === r.id) await loadEntries(r.id, true);
      onChanged();
      notify(r.hidden ? `"${r.title}" is now visible` : `"${r.title}" hidden`, "info");
    } catch (err) {
      notify(`Update failed: ${errorCode(err)}`, "error");
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteRaffle = async (r: AdminRaffle) => {
    setBusyKey(`del:${r.id}`);
    try {
      await adminApi(`/api/admin/raffles/${r.id}`, { method: "DELETE" });
      setConfirmDeleteId(null);
      if (inspectId === r.id) setInspectId(null);
      await loadRaffles();
      onChanged();
      notify(`Deleted raffle "${r.title}"`, "success");
    } catch (err) {
      notify(`Delete failed: ${errorCode(err)}`, "error");
    } finally {
      setBusyKey(null);
    }
  };

  const handleEndRaffle = async (r: AdminRaffle) => {
    setBusyKey(`end:${r.id}`);
    try {
      await adminApi(`/api/admin/raffles/${r.id}/end`, {
        method: "POST",
        body: {},
      });
      await loadRaffles();
      if (inspectId === r.id) await loadEntries(r.id, true);
      onChanged();
      notify(`Ended "${r.title}"`, "success");
    } catch (err) {
      notify(`End failed: ${errorCode(err)}`, "error");
    } finally {
      setBusyKey(null);
    }
  };

  const handleQuickDrawRaffle = async (r: AdminRaffle) => {
    setBusyKey(`draw:${r.id}`);
    try {
      const res = await adminApi<DrawResponse>(`/api/admin/raffles/${r.id}/draw-winner`, {
        method: "POST",
        body: { exclude_current: Boolean(r.winner) },
      });
      await loadRaffles();
      if (inspectId === r.id) await loadEntries(r.id, true);
      onChanged();
      notify(`Winner drawn: ${res.winner}`, "success");
    } catch (err) {
      notify(`Draw failed: ${errorCode(err)}`, "error");
    } finally {
      setBusyKey(null);
    }
  };

  /* ───────────── Entrants & Winner Draw Actions ───────────── */

  const handleDrawWinner = async (excludeCurrent: boolean) => {
    if (inspectId == null || drawing) return;
    setDrawing(true);
    setDrawnResult(null);
    try {
      const res = await adminApi<DrawResponse>(
        `/api/admin/raffles/${inspectId}/draw-winner`,
        {
          method: "POST",
          body: { exclude_current: excludeCurrent },
        },
      );

      const pool = res.candidates && res.candidates.length > 0 ? res.candidates : [res.winner];

      const finalize = async () => {
        setReelName(null);
        setDrawnResult({
          winner: res.winner,
          avatarUrl: res.avatar_url || "",
          kickUserId: res.kick_user_id || "",
        });
        setDrawing(false);
        await loadEntries(inspectId, true);
        await loadRaffles();
        onChanged();
        notify(`Winner drawn: ${res.winner}`, "success");
      };

      if (reduceMotion || pool.length <= 1) {
        await finalize();
        return;
      }

      // Smooth decelerating slot-reel roll across candidate names
      const totalSteps = 18;
      let step = 0;
      const tick = () => {
        if (step < totalSteps) {
          const idx = (step * 7 + Math.floor(Math.random() * pool.length)) % pool.length;
          setReelName(pool[idx]);
          step += 1;
          const delay = 45 + Math.round(Math.pow(step / totalSteps, 2) * 140);
          reelTimerRef.current = window.setTimeout(tick, delay);
        } else {
          setReelName(res.winner);
          reelTimerRef.current = window.setTimeout(() => {
            void finalize();
          }, 260);
        }
      };
      tick();
    } catch (err) {
      setDrawing(false);
      setReelName(null);
      notify(`Draw failed: ${errorCode(err)}`, "error");
    }
  };

  const handleSetManualWinner = async (winnerName: string | null) => {
    if (inspectId == null) return;
    setBusyKey("winner");
    try {
      await adminApi(`/api/admin/raffles/${inspectId}`, {
        method: "PATCH",
        body: { winner: winnerName },
      });
      setDrawnResult(null);
      await loadEntries(inspectId, true);
      await loadRaffles();
      onChanged();
      notify(winnerName ? `Winner set to "${winnerName}"` : "Cleared winner", "info");
    } catch (err) {
      notify(`Failed to update winner: ${errorCode(err)}`, "error");
    } finally {
      setBusyKey(null);
    }
  };

  const handleRemoveEntry = async (entry: AdminRaffleEntry) => {
    if (inspectId == null) return;
    setBusyKey(`rm-entry:${entry.id}`);
    try {
      await adminApi(`/api/admin/raffles/${inspectId}/entries/${entry.id}`, {
        method: "DELETE",
      });
      setConfirmRemoveEntryId(null);
      await loadEntries(inspectId, true);
      await loadRaffles();
      onChanged();
      notify(`Removed entrant "${entry.kick_name || entry.kick_user_id}"`, "info");
    } catch (err) {
      notify(`Remove failed: ${errorCode(err)}`, "error");
    } finally {
      setBusyKey(null);
    }
  };

  const exportEntrantsCsv = () => {
    if (!inspectRaffle) return;
    const lines = [
      "entry_id,kick_name,kick_user_id,email,email_verified,joined_iso",
      ...entries.map((e) =>
        [
          e.id,
          csvEscape(e.kick_name || ""),
          csvEscape(e.kick_user_id),
          csvEscape(e.email || ""),
          e.email_verified_at ? 1 : 0,
          e.created_at ? new Date(Number(e.created_at)).toISOString() : "",
        ].join(","),
      ),
    ];
    downloadTextFile(`raffle-${inspectRaffle.id}-entrants.csv`, lines.join("\n"));
    notify(`Exported ${entries.length} entrants`, "info");
  };

  const visibleEntries = useMemo(() => {
    const q = entrySearch.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const hay = `${e.kick_name || ""} ${e.kick_user_id} ${e.email || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [entries, entrySearch]);

  return (
    <div className="kadm-stack">
      {/* Toolbar */}
      <div className="kadm-toolbar">
        <div className="kadm-seg" role="tablist" aria-label="Raffles filter">
          {(
            [
              ["all", `All (${counts.all})`],
              ["live", `Live (${counts.live})`],
              ["upcoming", `Upcoming (${counts.upcoming})`],
              ["finished", `Finished (${counts.finished})`],
              ["hidden", `Hidden (${counts.hidden})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={`kadm-seg__btn${filter === key ? " is-active" : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="kadm-toolbar__actions">
          <div className="kadm-search">
            <IconSearch size={15} />
            <input
              type="search"
              className="kadm-search__input"
              placeholder="Search raffles, prizes, winners…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="kadm-btn kadm-btn--ghost kadm-btn--sm"
            onClick={() => onOpenPublicPath("/raffles/")}
          >
            <span>Public Page</span>
            <IconExternal size={13} />
          </button>
          <button
            type="button"
            className="kadm-btn kadm-btn--ghost kadm-btn--sm"
            onClick={() => void loadRaffles()}
          >
            <IconRefresh size={14} />
          </button>
          <button
            type="button"
            className="kadm-btn kadm-btn--primary kadm-btn--sm"
            onClick={() => (editorMode === "create" ? setEditorMode(null) : openCreator())}
          >
            <IconPlus size={15} />
            <span>{editorMode === "create" ? "Close Form" : "New Raffle"}</span>
          </button>
        </div>
      </div>

      {/* Create / Edit Form */}
      {editorMode && (
        <form className="kadm-card kadm-panel" onSubmit={(e) => void handleSaveRaffle(e)}>
          <div className="kadm-panel__head">
            <div>
              <h3 className="kadm-panel__title">
                {editorMode === "edit" ? `Edit Raffle #${editingId}` : "Create Community Raffle"}
              </h3>
              <p className="kadm-panel__sub">
                Kick-authenticated viewers can enter live raffles with 1 click on `/raffles/`.
              </p>
            </div>
            <button
              type="button"
              className="kadm-btn kadm-btn--ghost kadm-btn--xs"
              onClick={() => setEditorMode(null)}
            >
              <IconClose size={15} />
            </button>
          </div>

          <div className="kadm-form-grid">
            <label className="kadm-field">
              <span className="kadm-field__label">Raffle Title *</span>
              <input
                type="text"
                className="kadm-input"
                placeholder="Weekly Stream $500 Giveaway"
                required
                value={fTitle}
                onChange={(e) => setFTitle(e.target.value)}
              />
            </label>

            <label className="kadm-field">
              <span className="kadm-field__label">Prize Headline</span>
              <input
                type="text"
                className="kadm-input"
                placeholder="$500 Cash / VIP Tip"
                value={fPrize}
                onChange={(e) => setFPrize(e.target.value)}
              />
            </label>

            <div className="kadm-field">
              <span className="kadm-field__label">Completion Mode</span>
              <div className="kadm-seg" role="radiogroup" aria-label="Raffle completion mode">
                <button
                  type="button"
                  className={`kadm-seg__btn${fEndMode === "timer" ? " is-active" : ""}`}
                  onClick={() => setFEndMode("timer")}
                >
                  Countdown Timer
                </button>
                <button
                  type="button"
                  className={`kadm-seg__btn${fEndMode === "manual" ? " is-active" : ""}`}
                  onClick={() => setFEndMode("manual")}
                >
                  Manual (Streamer Button)
                </button>
              </div>
            </div>

            <label className="kadm-field">
              <span className="kadm-field__label">Starts At</span>
              <input
                type="datetime-local"
                className="kadm-input"
                value={fStartsAt}
                onChange={(e) => setFStartsAt(e.target.value)}
              />
            </label>

            {fEndMode === "timer" ? (
              <label className="kadm-field">
                <span className="kadm-field__label">
                  <span>Ends At</span>
                  <span className="kadm-inline-pills">
                    {[
                      [24, "+24h"],
                      [72, "+3d"],
                      [168, "+7d"],
                    ].map(([hrs, lbl]) => (
                      <button
                        key={hrs}
                        type="button"
                        className="kadm-bump"
                        onClick={() => applyEndOffsetHours(Number(hrs))}
                      >
                        {lbl}
                      </button>
                    ))}
                  </span>
                </span>
                <input
                  type="datetime-local"
                  className="kadm-input"
                  value={fEndsAt}
                  onChange={(e) => setFEndsAt(e.target.value)}
                />
              </label>
            ) : (
              <div className="kadm-field">
                <span className="kadm-field__label">Manual Stream Completion</span>
                <p className="kadm-muted" style={{ margin: "6px 0 0", lineHeight: 1.45 }}>
                  Stays live with no countdown until you press <strong>End Raffle</strong> on{" "}
                  <code>/raffles/:id/</code> or in this table.
                </p>
              </div>
            )}

            <label className="kadm-field">
              <span className="kadm-field__label">Brief Rules / Note (Optional, separate with |)</span>
              <input
                type="text"
                className="kadm-input"
                placeholder="Follow on Kick | 1 entry per viewer"
                value={fNote}
                onChange={(e) => setFNote(e.target.value)}
              />
            </label>

            <label className="kadm-field">
              <span className="kadm-field__label">Winner Handle (Optional Override)</span>
              <input
                type="text"
                className="kadm-input"
                placeholder="Leave blank until drawn"
                value={fWinner}
                onChange={(e) => setFWinner(e.target.value)}
              />
            </label>
          </div>

          <div className="kadm-form-foot" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div className="kadm-row-actions" style={{ flexWrap: "wrap", gap: 16 }}>
              <label className="kadm-switch-label">
                <input
                  type="checkbox"
                  checked={fHidden}
                  onChange={(e) => setFHidden(e.target.checked)}
                />
                <span>Hide raffle from public `/raffles/` page</span>
              </label>
              <label className="kadm-switch-label">
                <input
                  type="checkbox"
                  checked={fIsDemo}
                  onChange={(e) => setFIsDemo(e.target.checked)}
                />
                <span>Mark as demo / test raffle</span>
              </label>
            </div>
            <div className="kadm-row-actions">
              <button
                type="button"
                className="kadm-btn kadm-btn--ghost kadm-btn--sm"
                onClick={() => setEditorMode(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="kadm-btn kadm-btn--primary kadm-btn--sm"
                disabled={savingForm}
              >
                <IconCheck size={14} />
                <span>
                  {savingForm
                    ? "Saving…"
                    : editorMode === "edit"
                      ? "Save Changes"
                      : "Create Raffle"}
                </span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Entrants & Winner Draw Studio */}
      {inspectId != null && (
        <section className="kadm-card kadm-panel kadm-draw-studio">
          <div className="kadm-panel__head">
            <div>
              <div className="kadm-board-card__badges">
                <span className="kadm-badge kadm-badge--info">Entrants &amp; Winner Studio</span>
                {Boolean(inspectRaffle?.is_demo) && (
                  <span className="kadm-badge kadm-badge--warn">DEMO</span>
                )}
                {inspectRaffle?.prize && (
                  <span className="kadm-badge kadm-badge--live">{inspectRaffle.prize}</span>
                )}
              </div>
              <h3 className="kadm-panel__title" style={{ marginTop: 6 }}>
                {inspectRaffle ? inspectRaffle.title : `Raffle #${inspectId}`}
              </h3>
            </div>
            <div className="kadm-row-actions">
              <button
                type="button"
                className="kadm-btn kadm-btn--secondary kadm-btn--xs"
                disabled={!entries.length}
                onClick={exportEntrantsCsv}
              >
                <IconDownload size={13} />
                <span>Export CSV</span>
              </button>
              <button
                type="button"
                className="kadm-btn kadm-btn--ghost kadm-btn--xs"
                onClick={() => setInspectId(null)}
              >
                <IconClose size={15} />
              </button>
            </div>
          </div>

          {/* Cryptographic Winner Machine */}
          <div className="kadm-reel-box">
            <div className="kadm-reel-box__display">
              <span className="kadm-mini-label">Cryptographic Random Draw (`crypto.getRandomValues`)</span>
              {drawing && reelName ? (
                <div className="kadm-reel-rolling" aria-live="polite">
                  <span className="kadm-reel-rolling__tag">Rolling {entries.length} entrants…</span>
                  <strong className="kadm-reel-rolling__name">{reelName}</strong>
                </div>
              ) : drawnResult ? (
                <div className="kadm-reel-winner">
                  {safeAvatar(drawnResult.avatarUrl) && (
                    <img
                      src={safeAvatar(drawnResult.avatarUrl)}
                      alt=""
                      width={38}
                      height={38}
                      className="kadm-reel-winner__avatar"
                    />
                  )}
                  <div>
                    <span className="kadm-badge kadm-badge--live">Selected Winner</span>
                    <strong className="kadm-reel-winner__name">{drawnResult.winner}</strong>
                  </div>
                </div>
              ) : inspectRaffle?.winner ? (
                <div className="kadm-reel-winner">
                  <span className="kadm-kpi__icon kadm-kpi__icon--amber">
                    <IconTrophy size={18} />
                  </span>
                  <div>
                    <span className="kadm-subtext">Recorded Winner</span>
                    <strong className="kadm-reel-winner__name">{inspectRaffle.winner}</strong>
                  </div>
                </div>
              ) : (
                <p className="kadm-muted" style={{ margin: "6px 0 0" }}>
                  {entries.length > 0
                    ? `${entries.length} eligible ${entries.length === 1 ? "entrant" : "entrants"} ready for draw.`
                    : "No entrants have joined this raffle yet."}
                </p>
              )}
            </div>

            <div className="kadm-reel-box__actions">
              <button
                type="button"
                className="kadm-btn kadm-btn--primary kadm-btn--sm"
                disabled={drawing || entries.length === 0}
                onClick={() => void handleDrawWinner(Boolean(inspectRaffle?.winner))}
              >
                <IconDice size={16} />
                <span>
                  {drawing
                    ? "Drawing…"
                    : inspectRaffle?.winner
                      ? "Re-Draw Winner"
                      : "Draw Random Winner"}
                </span>
              </button>
              {inspectRaffle?.winner && !drawing && (
                <button
                  type="button"
                  className="kadm-btn kadm-btn--ghost kadm-btn--sm"
                  disabled={busyKey === "winner"}
                  onClick={() => void handleSetManualWinner(null)}
                >
                  Clear Winner
                </button>
              )}
            </div>
          </div>

          {/* Entrants Filter & Table */}
          <div className="kadm-toolbar" style={{ marginTop: 12 }}>
            <div className="kadm-search">
              <IconSearch size={15} />
              <input
                type="search"
                className="kadm-search__input"
                placeholder="Search entrants by Kick name, ID, or email…"
                value={entrySearch}
                onChange={(e) => setEntrySearch(e.target.value)}
              />
            </div>
            <span className="kadm-muted">
              Showing {visibleEntries.length} of {entries.length} entrants
            </span>
          </div>

          <div className="kadm-table-wrap" style={{ maxHeight: 320 }}>
            <table className="kadm-table kadm-table--compact">
              <thead>
                <tr>
                  <th>Kick Entrant</th>
                  <th>Account Email</th>
                  <th>Entered</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingEntries ? (
                  <tr>
                    <td colSpan={4} className="kadm-table__empty">
                      Loading entrants…
                    </td>
                  </tr>
                ) : visibleEntries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="kadm-table__empty">
                      {entries.length === 0 ? "No entries yet." : "No matching entrants."}
                    </td>
                  </tr>
                ) : (
                  visibleEntries.map((entry) => {
                    const handle = entry.kick_name || entry.kick_user_id;
                    const isWinner =
                      Boolean(inspectRaffle?.winner) &&
                      inspectRaffle!.winner!.toLowerCase() === handle.toLowerCase();
                    const avatar = safeAvatar(entry.avatar_url || undefined);
                    return (
                      <tr key={entry.id} className={isWinner ? "is-selected" : undefined}>
                        <td>
                          <div className="kadm-user-cell">
                            {avatar ? (
                              <img
                                src={avatar}
                                alt=""
                                width={26}
                                height={26}
                                className="kadm-user-cell__avatar"
                              />
                            ) : (
                              <span className="kadm-user-cell__avatar kadm-user-cell__avatar--ph">
                                {(handle[0] || "K").toUpperCase()}
                              </span>
                            )}
                            <div>
                              <strong>{handle}</strong>{" "}
                              {isWinner && <span className="kadm-badge kadm-badge--live">Winner</span>}
                              <div className="kadm-subtext">Kick ID: {entry.kick_user_id}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          {entry.email ? (
                            <div>
                              <span>{entry.email}</span>{" "}
                              {entry.email_verified_at && (
                                <span className="kadm-badge kadm-badge--info">Verified</span>
                              )}
                            </div>
                          ) : (
                            <span className="kadm-muted">—</span>
                          )}
                        </td>
                        <td className="kadm-nowrap">
                          <div>{relTime(entry.created_at, now)}</div>
                          <span className="kadm-subtext">{fmtDateTime(entry.created_at)}</span>
                        </td>
                        <td className="kadm-nowrap" style={{ textAlign: "right" }}>
                          <div className="kadm-row-actions">
                            {!isWinner && (
                              <button
                                type="button"
                                className="kadm-btn kadm-btn--secondary kadm-btn--xs"
                                disabled={busyKey === "winner"}
                                title="Set as winner"
                                onClick={() => void handleSetManualWinner(handle)}
                              >
                                <IconTrophy size={12} />
                                <span>Pick</span>
                              </button>
                            )}
                            {confirmRemoveEntryId === entry.id ? (
                              <>
                                <button
                                  type="button"
                                  className="kadm-btn kadm-btn--danger kadm-btn--xs"
                                  disabled={busyKey === `rm-entry:${entry.id}`}
                                  onClick={() => void handleRemoveEntry(entry)}
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  className="kadm-btn kadm-btn--ghost kadm-btn--xs"
                                  onClick={() => setConfirmRemoveEntryId(null)}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="kadm-btn kadm-btn--ghost kadm-btn--xs"
                                title="Remove entrant"
                                onClick={() => setConfirmRemoveEntryId(entry.id)}
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
        </section>
      )}

      {/* Raffles Table */}
      <div className="kadm-card kadm-table-card">
        <div className="kadm-table-wrap">
          <table className="kadm-table">
            <thead>
              <tr>
                <th>Raffle &amp; Prize</th>
                <th>Status &amp; Schedule</th>
                <th>Entrants</th>
                <th>Winner</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && raffles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="kadm-table__empty">
                    Loading raffles…
                  </td>
                </tr>
              ) : filteredRaffles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="kadm-table__empty">
                    No raffles match the current filter.
                  </td>
                </tr>
              ) : (
                filteredRaffles.map((r) => {
                  const s = Number(r.starts_at) || 0;
                  const e = Number(r.ends_at) || 0;
                  const isManual = r.end_mode === "manual";
                  const done = isRaffleFinished(r);
                  const entryCount = Number(r.entry_count) || 0;
                  const left = !isManual ? countdown(e - now) : "";
                  const startsIn = countdown(s - now);

                  let statusText = "Finished";
                  let statusTone: "live" | "info" | "warn" | "muted" = "muted";
                  if (r.hidden) {
                    statusText = "Hidden";
                    statusTone = "warn";
                  } else if (done) {
                    if (!r.winner && entryCount > 0) {
                      statusText = "Awaiting Winner";
                      statusTone = "warn";
                    } else {
                      statusText = "Finished";
                      statusTone = "muted";
                    }
                  } else if (s > now) {
                    statusText = `Starts in ${startsIn || "soon"}`;
                    statusTone = "info";
                  } else if (isManual) {
                    statusText = "Live · Manual Button";
                    statusTone = "live";
                  } else {
                    statusText = `Live · ${left || "ending"}`;
                    statusTone = "live";
                  }

                  const scheduleText =
                    isManual && !done
                      ? `${fmtShortDate(r.starts_at)} → Manual draw`
                      : `${fmtShortDate(r.starts_at)} → ${fmtShortDate(r.ended_at || r.ends_at)}`;

                  return (
                    <tr
                      key={r.id}
                      className={inspectId === r.id ? "is-selected" : undefined}
                    >
                      <td>
                        <div className="kadm-raffle-title">
                          <strong>{r.title}</strong>
                          {Boolean(r.is_demo) && (
                            <span className="kadm-badge kadm-badge--warn">DEMO</span>
                          )}
                          {r.prize && <span className="kadm-badge kadm-badge--info">{r.prize}</span>}
                        </div>
                        {r.note && <div className="kadm-subtext">{r.note}</div>}
                      </td>
                      <td className="kadm-nowrap">
                        <span className={`kadm-badge kadm-badge--${statusTone}`}>{statusText}</span>
                        <div className="kadm-subtext">{scheduleText}</div>
                      </td>
                      <td className="kadm-nowrap">
                        <button
                          type="button"
                          className="kadm-btn kadm-btn--secondary kadm-btn--xs"
                          onClick={() => setInspectId(inspectId === r.id ? null : r.id)}
                        >
                          <IconUsers size={13} />
                          <span>
                            {entryCount} {entryCount === 1 ? "entry" : "entries"}
                          </span>
                        </button>
                      </td>
                      <td className="kadm-nowrap">
                        {r.winner ? (
                          <span className="kadm-badge kadm-badge--live">
                            <IconTrophy size={12} />
                            <span>{r.winner}</span>
                          </span>
                        ) : (
                          <span className="kadm-muted">—</span>
                        )}
                      </td>
                      <td className="kadm-nowrap" style={{ textAlign: "right" }}>
                        <div className="kadm-row-actions">
                          {entryCount > 0 && (
                            <button
                              type="button"
                              className="kadm-btn kadm-btn--primary kadm-btn--xs"
                              disabled={busyKey === `draw:${r.id}` || busyKey === `end:${r.id}`}
                              title={
                                r.winner
                                  ? "Reroll winner without ending raffle"
                                  : "Draw random winner"
                              }
                              onClick={() => void handleQuickDrawRaffle(r)}
                            >
                              <IconDice size={13} />
                              <span>
                                {busyKey === `draw:${r.id}`
                                  ? "Drawing…"
                                  : r.winner
                                    ? "Reroll"
                                    : "Draw"}
                              </span>
                            </button>
                          )}

                          {!done && s <= now && (
                            <button
                              type="button"
                              className="kadm-btn kadm-btn--secondary kadm-btn--xs"
                              disabled={busyKey === `end:${r.id}` || busyKey === `draw:${r.id}`}
                              title="End raffle without spinning the roulette"
                              onClick={() => void handleEndRaffle(r)}
                            >
                              <IconBolt size={13} />
                              <span>{busyKey === `end:${r.id}` ? "Ending…" : "End"}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            className="kadm-btn kadm-btn--secondary kadm-btn--xs"
                            onClick={() => setInspectId(inspectId === r.id ? null : r.id)}
                          >
                            <IconTicket size={13} />
                            <span>{inspectId === r.id ? "Close Studio" : "Entrants"}</span>
                          </button>

                          <button
                            type="button"
                            className="kadm-btn kadm-btn--ghost kadm-btn--xs"
                            onClick={() => onOpenPublicPath(`/raffles/${r.id}/`)}
                            title="Open public raffle page"
                          >
                            <span>Page</span>
                            <IconExternal size={12} />
                          </button>

                          <button
                            type="button"
                            className="kadm-btn kadm-btn--secondary kadm-btn--xs"
                            onClick={() => openEditor(r)}
                            title="Edit raffle"
                          >
                            <IconEdit size={13} />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            className="kadm-btn kadm-btn--ghost kadm-btn--xs"
                            disabled={busyKey === `hide:${r.id}`}
                            title={r.hidden ? "Make public" : "Hide raffle"}
                            onClick={() => void handleToggleHidden(r)}
                          >
                            {r.hidden ? <IconEye size={13} /> : <IconEyeOff size={13} />}
                          </button>

                          {confirmDeleteId === r.id ? (
                            <>
                              <button
                                type="button"
                                className="kadm-btn kadm-btn--danger kadm-btn--xs"
                                disabled={busyKey === `del:${r.id}`}
                                onClick={() => void handleDeleteRaffle(r)}
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                className="kadm-btn kadm-btn--ghost kadm-btn--xs"
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="kadm-btn kadm-btn--ghost kadm-btn--xs"
                              title="Delete raffle"
                              onClick={() => setConfirmDeleteId(r.id)}
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
  );
}
