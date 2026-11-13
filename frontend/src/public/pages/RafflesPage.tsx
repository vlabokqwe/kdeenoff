import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { StepsList } from "../components/StepsSection";
import { StreamerRaffleOverlay } from "../components/StreamerRaffleOverlay";
import { useImgReady } from "../hooks/useMediaReady";
import { useNow } from "../hooks/useNow";
import { usePageMeta } from "../hooks/usePageMeta";
import { useNextFrameReveal } from "../hooks/useReveal";
import { getJson, streamerApi } from "../lib/api";
import { countdown } from "../lib/boards";
import { reduceMotion } from "../lib/format";
import { buildRaffleEntryPath } from "../lib/raffleJoin";
import type { Raffle, RaffleList, RafflesMine } from "../lib/types";
import { useSession } from "../state/session";
import { useUi } from "../state/ui";

const STEPS_STORAGE_KEY = "kdeenoff-raffles-steps";
const COLLAPSE_DURATION_MS = 460;
const OPEN_DURATION_MS = 520;

const CARD_ART = [
  "/img/deco/cards/raffle-a.webp",
  "/img/deco/cards/raffle-b.webp",
  "/img/deco/cards/raffle-c.webp",
  "/img/deco/cards/raffle-d.webp",
] as const;

type StepsPhase =
  | "entering"
  | "open"
  | "collapsing-from"
  | "collapsing"
  | "collapsed"
  | "measuring-open"
  | "opening-from"
  | "opening";

function RaffleItemMedia({
  index,
  to,
  entries,
  isLive,
  isHidden,
}: {
  index: number;
  to: string;
  entries: number;
  isLive: boolean;
  isHidden: boolean;
}) {
  const src = CARD_ART[index % CARD_ART.length];
  const img = useImgReady(src);
  const prevEntriesRef = useRef(entries);
  const [bumpGen, setBumpGen] = useState(0);

  useEffect(() => {
    if (entries > prevEntriesRef.current) {
      setBumpGen((g) => g + 1);
    }
    prevEntriesRef.current = entries;
  }, [entries]);

  const bumpClass =
    bumpGen > 0 ? (bumpGen % 2 === 1 ? " is-bump-a" : " is-bump-b") : "";

  return (
    <Link className="raffle-item__media" to={to} tabIndex={-1} aria-hidden="true">
      {!img.ready && <i className="raffle-item__media-skel skel" />}
      <img
        ref={img.ref}
        className={`raffle-item__img${!img.ready ? " is-media-pending" : ""}`}
        src={src}
        alt=""
        width={420}
        height={420}
        loading="lazy"
        onLoad={img.onLoad}
        onError={img.onError}
      />
      <span className={`raffle-item__live-pill${!isLive ? " raffle-item__live-pill--ended" : ""}`}>
        {isLive && <span className="raffle-item__live-dot" />}
        {isHidden ? "Hidden" : isLive ? "Live" : "Ended"}
      </span>
      <span className={`raffle-item__entries-pill${bumpClass}`}>
        <UsersMiniIcon />
        <span>
          {entries} {entries === 1 ? "entrant" : "entrants"}
        </span>
      </span>
    </Link>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
      <circle cx={12} cy={12} r={9.25} fill="none" stroke="currentColor" strokeWidth={2} />
      <circle cx={12} cy={8} r={1.25} fill="currentColor" />
      <path
        d="M12 11.5v5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
      />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
      <path
        d="M14.5 7l-5 5 5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true">
      <circle cx={12} cy={12} r={9} fill="none" stroke="currentColor" strokeWidth={2.1} />
      <path
        d="M12 7.5v4.8l3.2 1.9"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BoltMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true">
      <polygon
        points="13 2 4 14 12 14 11 22 20 10 12 10 13 2"
        fill="currentColor"
      />
    </svg>
  );
}

function UsersMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} aria-hidden="true">
      <path
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
      />
      <circle cx={9} cy={7} r={3.5} fill="none" stroke="currentColor" strokeWidth={2.1} />
      <path
        d="M22 21v-2a3.8 3.8 0 0 0-2.8-3.67M15.5 3.4a3.5 3.5 0 0 1 0 6.8"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
});

function formatWhen(row: Raffle): string {
  if (row.end_mode === "manual") return "";
  const start = Number(row.starts_at);
  const end = Number(row.ends_at);
  const startLabel = Number.isFinite(start) && start > 0 ? dateFmt.format(start) : "";
  const endLabel = Number.isFinite(end) && end > 0 ? dateFmt.format(end) : "";
  if (startLabel && endLabel && startLabel !== endLabel) return `${startLabel} — ${endLabel}`;
  return endLabel || startLabel || "";
}

function parseNoteChips(note: string | null | undefined): string[] {
  if (!note) return [];
  return note
    .split(/\r?\n|\||•|;/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function RafflesPage() {
  usePageMeta({ title: "Raffles", pageClass: "site--raffles" });

  const now = useNow();
  const { account, signedIn, accountRev } = useSession();
  const { dataRev } = useUi();

  const canManage = Boolean(signedIn && (account?.isStreamer || account?.isAdmin));

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [managedRaffles, setManagedRaffles] = useState<Raffle[]>([]);
  const [showAllManaged, setShowAllManaged] = useState(false);
  const [editTarget, setEditTarget] = useState<Raffle | null>(null);
  const [joinedLabels, setJoinedLabels] = useState<Record<number, string>>({});
  const [loadGen, setLoadGen] = useState(0);
  const [stepsOpen, setStepsOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STEPS_STORAGE_KEY);
      if (stored === "0" || stored === "1") return stored === "1";
    } catch {
      /* private mode */
    }
    return true;
  });

  const [stepsPhase, setStepsPhase] = useState<StepsPhase>(() => {
    if (reduceMotion) return stepsOpen ? "open" : "collapsed";
    return stepsOpen ? "entering" : "collapsed";
  });
  const [panelDims, setPanelDims] = useState<{ w: number; h: number } | null>(null);

  const infoBtnRef = useRef<HTMLButtonElement | null>(null);
  const collapseBtnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (stepsPhase !== "measuring-open") return;
    const panelEl = panelRef.current;
    if (!panelEl) {
      setStepsPhase("open");
      return;
    }
    setPanelDims({
      w: Math.round(panelEl.offsetWidth),
      h: Math.round(panelEl.offsetHeight),
    });
    setStepsPhase("opening-from");
  }, [stepsPhase]);

  useEffect(() => {
    if (
      stepsPhase !== "entering" &&
      stepsPhase !== "opening-from" &&
      stepsPhase !== "collapsing-from"
    ) {
      return;
    }
    const nextPhase: StepsPhase =
      stepsPhase === "entering"
        ? "open"
        : stepsPhase === "opening-from"
          ? "opening"
          : "collapsing";

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setStepsPhase(nextPhase);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [stepsPhase]);

  useEffect(() => {
    if (stepsPhase !== "opening" && stepsPhase !== "collapsing") return;
    const duration = stepsPhase === "opening" ? OPEN_DURATION_MS : COLLAPSE_DURATION_MS;
    const timer = window.setTimeout(() => {
      setPanelDims(null);
      if (stepsPhase === "opening") {
        setStepsPhase("open");
        collapseBtnRef.current?.focus({ preventScroll: true });
      } else {
        setStepsPhase("collapsed");
      }
    }, duration);
    return () => window.clearTimeout(timer);
  }, [stepsPhase]);

  const toggleSteps = (next: boolean) => {
    if (next === stepsOpen) return;
    setStepsOpen(next);
    try {
      localStorage.setItem(STEPS_STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* private mode */
    }

    if (reduceMotion) {
      setPanelDims(null);
      setStepsPhase(next ? "open" : "collapsed");
      requestAnimationFrame(() => {
        if (next) collapseBtnRef.current?.focus({ preventScroll: true });
        else infoBtnRef.current?.focus({ preventScroll: true });
      });
      return;
    }

    if (next) {
      if (stepsPhase === "collapsing" || stepsPhase === "collapsing-from") {
        setStepsPhase("opening");
      } else {
        setStepsPhase("measuring-open");
      }
    } else {
      if (stepsPhase === "opening" || stepsPhase === "opening-from") {
        setStepsPhase("collapsing");
      } else {
        const panelEl = panelRef.current;
        if (panelEl) {
          setPanelDims({
            w: Math.round(panelEl.offsetWidth),
            h: Math.round(panelEl.offsetHeight),
          });
          setStepsPhase("collapsing-from");
        } else {
          setStepsPhase("collapsed");
        }
      }
      requestAnimationFrame(() => {
        infoBtnRef.current?.focus({ preventScroll: true });
      });
    }
  };

  const revealed = useNextFrameReveal(loadGen);

  const loadList = useCallback(
    async (signal?: AbortSignal, silent = false) => {
      try {
        const [data, mine, managed] = await Promise.all([
          getJson<RaffleList>("/api/raffles", { signal }),
          getJson<RafflesMine>("/api/raffles/mine", { signal }).catch(() => null),
          canManage
            ? streamerApi<{ raffles?: Raffle[] }>("/api/raffles/manage", { signal }).catch(
              () => null,
            )
            : Promise.resolve(null),
        ]);
        if (signal?.aborted) return;
        setRaffles(Array.isArray(data.raffles) ? data.raffles : []);
        setManagedRaffles(managed && Array.isArray(managed.raffles) ? managed.raffles : []);
        if (mine && mine.linked) {
          const initialJoined: Record<number, string> = {};
          if (Array.isArray(mine.joined)) {
            for (const id of mine.joined) {
              const numId = Number(id);
              if (Number.isFinite(numId) && numId > 0) {
                initialJoined[numId] = "Joined";
              }
            }
          }
          setJoinedLabels(initialJoined);
        } else {
          setJoinedLabels({});
        }
        setStatus("ready");
        if (!silent) {
          setLoadGen((g) => g + 1);
        }
      } catch {
        if (signal?.aborted) return;
        if (!silent) setStatus("error");
      }
    },
    [canManage],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void loadList(ctrl.signal, false);
    return () => ctrl.abort();
  }, [loadList, accountRev, dataRev]);

  useEffect(() => {
    if (status !== "ready") return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      void loadList(undefined, true);
    }, 8_000);
    return () => window.clearInterval(id);
  }, [status, loadList]);

  const isRowLive = (row: Raffle): boolean => {
    if (row.ended_at != null) return false;
    if (row.end_mode === "manual") return true;
    if (row.spin_mode === "elimination") return true;
    return (Number(row.ends_at) || 0) > now;
  };

  const renderJoinControl = (row: Raffle, isLive: boolean) => {
    const id = Number(row.id) || 0;
    if (!id) return null;
    if (!isLive) {
      return (
        <Link className="raffle-item__join raffle-item__join--done" to={`/raffles/${id}/`}>
          {row.winner ? `Winner: ${row.winner}` : "Ended"}
        </Link>
      );
    }
    if (joinedLabels[id]) {
      return (
        <Link
          className="raffle-item__join raffle-item__join--done"
          to={buildRaffleEntryPath(id)}
          data-raffle-join-state={id}
        >
          ✓ {joinedLabels[id]}
        </Link>
      );
    }
    if (row.entries_locked) {
      return (
        <Link className="raffle-item__join raffle-item__join--done" to={`/raffles/${id}/`}>
          Locked
        </Link>
      );
    }
    return (
      <Link
        className="raffle-item__join"
        to={buildRaffleEntryPath(id)}
        data-raffle-join={id}
      >
        Join raffle
      </Link>
    );
  };

  const renderCard = (row: Raffle, index: number) => {
    const id = Number(row.id) || 0;
    const detailHref = id ? `/raffles/${id}/` : "/raffles/";
    const isManual = row.end_mode === "manual";
    const isElim = row.spin_mode === "elimination";
    const isLive = isRowLive(row);
    const isHidden = Boolean(row.hidden);
    const when = formatWhen(row);
    const endsAt = Number(row.ends_at) || 0;
    const timerText = !isManual && isLive && endsAt > now ? countdown(endsAt - now) || "" : "";
    const entries = Number(row.entries ?? row.entry_count) || 0;
    const noteChips = parseNoteChips(row.note);

    return (
      <article
        key={row.id ?? `${row.title}-${index}`}
        className={`raffle-item${isManual ? " raffle-item--manual" : ""}${revealed ? " is-in" : ""}`}
        data-reveal
        style={revealed ? ({ "--i": index } as CSSProperties) : undefined}
      >
        <RaffleItemMedia
          index={index}
          to={detailHref}
          entries={entries}
          isLive={isLive}
          isHidden={isHidden}
        />

        <div className="raffle-item__body">
          <div className="raffle-item__top">
            {!isLive ? (
              <span className="raffle-item__mode raffle-item__mode--timer">
                <span>{row.winner ? `Won by ${row.winner}` : "Raffle ended"}</span>
              </span>
            ) : isManual ? (
              <span className="raffle-item__mode raffle-item__mode--manual">
                <BoltMiniIcon />
                <span>
                  {isElim ? "Elimination · Streamer spin" : "Streamer button · Live draw"}
                </span>
              </span>
            ) : (
              <span className="raffle-item__mode raffle-item__mode--timer">
                <ClockMiniIcon />
                <time data-raffle-ends={endsAt}>
                  {timerText
                    ? `Ends in ${timerText}`
                    : isElim
                      ? "Elimination rounds"
                      : "Ending soon"}
                </time>
              </span>
            )}
            <div className="raffle-item__top-end">
              {when && <span className="raffle-item__when">{when}</span>}
              {canManage && id > 0 && (
                <button
                  type="button"
                  className="local-admin__action"
                  onClick={() => setEditTarget(row)}
                >
                  Edit
                </button>
              )}
            </div>
          </div>

          <div className="raffle-item__main">
            {row.prize && (
              <div className="raffle-item__prize-row">
                <span className="raffle-item__prize-kicker">Prize</span>
                <strong className="raffle-item__prize">{row.prize}</strong>
              </div>
            )}
            <h2 className="raffle-item__title">
              <Link to={detailHref}>{row.title}</Link>
            </h2>
            {noteChips.length > 0 && (
              <div className="raffle-item__chips">
                {noteChips.map((chip, cIdx) => (
                  <span key={cIdx} className="raffle-item__chip">
                    {chip}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="raffle-item__footer">
            <Link className="raffle-item__view" to={detailHref} data-raffle-view={id}>
              <span>{canManage ? "Open & Control" : "View raffle"}</span>
              <ArrowRightIcon />
            </Link>
            {renderJoinControl(row, isLive)}
          </div>
        </div>
      </article>
    );
  };

  const visibleRaffles =
    canManage && showAllManaged
      ? managedRaffles
      : raffles.filter((row) => isRowLive(row));

  const isAnimating =
    stepsPhase === "collapsing-from" ||
    stepsPhase === "collapsing" ||
    stepsPhase === "opening-from" ||
    stepsPhase === "opening";
  const isCollapsedTarget = stepsPhase === "collapsing" || stepsPhase === "opening-from";
  const isStepsListActive =
    stepsPhase === "entering" ||
    stepsPhase === "open" ||
    stepsPhase === "opening" ||
    stepsPhase === "collapsing-from" ||
    stepsPhase === "collapsing";

  const shellClasses = [
    "raffles-shell",
    stepsPhase === "collapsed" ? "is-steps-collapsed" : "is-steps-open",
    isAnimating ? "is-steps-animating" : "",
    isCollapsedTarget ? "is-steps-to-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const boxClasses = [
    "raffle-steps-box",
    stepsPhase === "collapsed" ? "is-collapsed" : "",
    stepsPhase === "entering" ? "is-entering" : "",
    isAnimating ? "is-animating" : "",
    stepsPhase === "collapsing-from" ? "is-collapsing-from" : "",
    stepsPhase === "collapsing" ? "is-collapsing" : "",
    stepsPhase === "opening-from" ? "is-opening-from" : "",
    stepsPhase === "opening" ? "is-opening" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const shellStyle: CSSProperties | undefined = panelDims
    ? ({
      "--panel-outer-w": `${panelDims.w}px`,
      "--panel-outer-h": `${panelDims.h}px`,
    } as CSSProperties)
    : undefined;

  return (
    <div className={shellClasses} style={shellStyle}>
      <aside className={boxClasses} aria-label="How to join the raffle">
        <button
          ref={infoBtnRef}
          type="button"
          className="raffle-steps-box__info"
          aria-expanded={stepsOpen}
          aria-controls="raffle-steps-panel"
          aria-label="Show how to join steps"
          title="How to join the raffle"
          hidden={stepsPhase === "open" || stepsPhase === "entering"}
          inert={stepsOpen}
          onClick={() => toggleSteps(true)}
        >
          <InfoIcon />
        </button>

        <div
          ref={panelRef}
          className="raffle-steps-box__panel"
          id="raffle-steps-panel"
          hidden={stepsPhase === "collapsed"}
          inert={!stepsOpen}
        >
          <div className="raffle-steps-box__inner">
            <header className="raffle-steps-box__head">
              <div className="raffle-steps-box__heading">
                <span className="raffle-steps-box__badge" aria-hidden="true">
                  <InfoIcon />
                </span>
                <h2 className="raffle-steps-box__title" id="steps-title">
                  How to join the raffle
                </h2>
              </div>
              <button
                ref={collapseBtnRef}
                type="button"
                className="raffle-steps-box__collapse"
                aria-expanded={stepsOpen}
                aria-controls="raffle-steps-panel"
                aria-label="Collapse how to join into info icon"
                title="Collapse"
                onClick={() => toggleSteps(false)}
              >
                <CollapseIcon />
              </button>
            </header>

            <div className="raffle-steps-box__body">
              <StepsList
                active={isStepsListActive}
                collapsing={stepsPhase === "collapsing"}
                revealOnActive
                className="raffle-steps-box__list"
              />
            </div>
          </div>
        </div>
      </aside>

      <div className="raffles__main">
        <div className="raffles__bounds">
          <section className="page-hero" aria-labelledby="raffles-title">
            <div className="hero__bg" aria-hidden="true" />
            <div className="page-hero__inner">
              <h1 className="hero__title" id="raffles-title">
                Stream <span className="accent">raffles</span>
              </h1>
            </div>
          </section>

          <section className="raffles" aria-labelledby="raffles-title">
            <div className="raffle-group__list" data-raffles-list>
              {status === "loading" ? (
                [0, 1].map((idx) => (
                  <article
                    key={idx}
                    className="raffle-item raffle-item--skeleton is-in"
                    aria-hidden="true"
                  >
                    <div className="raffle-item__media">
                      <i className="raffle-item__media-skel skel" />
                    </div>
                    <div className="raffle-item__body">
                      <div className="raffle-item__top">
                        <i className="raffle-item__skel-pill skel" />
                      </div>
                      <div className="raffle-item__main">
                        <i className="raffle-item__skel-prize skel" />
                        <i className="raffle-item__skel-title skel" />
                      </div>
                      <div className="raffle-item__footer">
                        <i className="raffle-item__skel-btn skel" />
                        <i className="raffle-item__skel-btn-sm skel" />
                      </div>
                    </div>
                  </article>
                ))
              ) : status === "error" ? (
                <p className="raffle-group__empty">Couldn't load raffles.</p>
              ) : visibleRaffles.length === 0 ? (
                <p className="raffle-group__empty">
                  {canManage
                    ? "No active raffles right now — use the Streamer panel to create one."
                    : "No active raffles right now — keep an eye on the stream."}
                </p>
              ) : (
                visibleRaffles.map((row, idx) => renderCard(row, idx))
              )}
            </div>
          </section>
        </div>
      </div>

      <StreamerRaffleOverlay
        mode="list"
        canManage={canManage}
        showAllOnPage={showAllManaged}
        onToggleShowAllOnPage={setShowAllManaged}
        externalEditRaffle={editTarget}
        onClearExternalEdit={() => setEditTarget(null)}
        onListMutated={() => void loadList()}
      />
    </div>
  );
}
