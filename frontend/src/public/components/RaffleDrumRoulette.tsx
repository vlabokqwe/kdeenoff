import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { reduceMotion, safeAvatar } from "../lib/format";
import type {
  RaffleParticipant,
  RaffleSpinKind,
  RaffleSpinMode,
  RaffleSpinSpeed,
} from "../lib/types";

export type DrumPhase = "preparing" | "spinning" | "settled" | "empty";

const DRUM_SEEN_PREFIX = "kdeenoff-raffle-drum-seen:";

const CARD_HEIGHT = 68;
const CARD_GAP = 10;
const CARD_STEP = CARD_HEIGHT + CARD_GAP; // 78px exact vertical pitch
const START_INDEX = 6;
const TAIL_COUNT = 8;
const DEFAULT_SPIN_DURATION_MS = 4000;

export function buildDrawSignature(
  raffleId: number,
  winner: string | null | undefined,
  updatedAt: number | undefined,
  endedAt: number | null | undefined,
  lastSpinKind?: RaffleSpinKind,
  lastEliminated?: string | null,
  lastSpinAt?: number | null,
): string {
  if (!raffleId) return "";
  const stamp = Number(lastSpinAt) || Number(updatedAt) || Number(endedAt) || 0;
  const cleanElim = String(lastEliminated || "").trim().toLowerCase();
  if (lastSpinKind === "elimination" && cleanElim) {
    return `${raffleId}:elim:${cleanElim}:${stamp}`;
  }
  const cleanWin = String(winner || "").trim().toLowerCase();
  if (!cleanWin) return "";
  return `${raffleId}:win:${cleanWin}:${stamp}`;
}

export function isRaffleDrawSeen(signature: string): boolean {
  if (!signature) return false;
  try {
    return sessionStorage.getItem(DRUM_SEEN_PREFIX + signature) === "1";
  } catch {
    return false;
  }
}

export function markRaffleDrawSeen(signature: string): void {
  if (!signature) return;
  try {
    sessionStorage.setItem(DRUM_SEEN_PREFIX + signature, "1");
  } catch {
    /* private mode */
  }
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}

function createPrng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

function trackOffsetForIndex(pos: number): string {
  const y = -(pos * CARD_STEP + CARD_HEIGHT / 2);
  return `translate3d(0, ${y.toFixed(2)}px, 0)`;
}

function easeOutDrum(t: number): number {
  return 1 - Math.pow(1 - t, 3.6);
}

function computeSpinSteps(durationMs: number): number {
  if (durationMs <= 0) return 32;
  return Math.max(14, Math.min(200, Math.round((durationMs / 1000) * 10)));
}

function buildReelCards(
  participants: RaffleParticipant[],
  targetEntry: RaffleParticipant | null,
  seedKey: string,
  winIndex: number,
): RaffleParticipant[] {
  const totalCards = winIndex + TAIL_COUNT + 1;
  const sorted = [...participants].sort((a, b) => a.ticket_no - b.ticket_no);
  const pool = sorted.length > 0 ? sorted : targetEntry ? [targetEntry] : [];
  if (pool.length === 0) return [];

  const rand = createPrng(hashSeed(seedKey));
  const cards: RaffleParticipant[] = new Array(totalCards);

  for (let i = 0; i < totalCards; i += 1) {
    if (pool.length === 1) {
      cards[i] = pool[0];
      continue;
    }
    const prev = i > 0 ? cards[i - 1] : null;
    let pick = pool[Math.floor(rand() * pool.length)];
    if (prev && pick.id === prev.id) {
      const altIdx =
        (pool.findIndex((p) => p.id === pick.id) + 1 + Math.floor(rand() * (pool.length - 1))) %
        pool.length;
      pick = pool[altIdx];
    }
    cards[i] = pick;
  }

  if (targetEntry) {
    cards[winIndex] = targetEntry;

    if (pool.length >= 2) {
      const others = pool.filter(
        (p) => p.name.toLowerCase() !== targetEntry.name.toLowerCase(),
      );
      if (others.length > 0) {
        const above = others[Math.floor(rand() * others.length)];
        cards[winIndex - 1] = above;

        if (others.length >= 2) {
          const belowCandidates = others.filter((p) => p.id !== above.id);
          cards[winIndex + 1] =
            belowCandidates[Math.floor(rand() * belowCandidates.length)] || others[0];
        } else {
          cards[winIndex + 1] = above;
        }
      }
    }
  }

  return cards;
}

function ArrowLeftSvg() {
  return (
    <svg viewBox="0 0 24 24" width={17} height={17} aria-hidden="true">
      <path
        d="M19 12H5M11 18l-6-6 6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UsersListSvg() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true">
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

function PointerChevronSvg({ side }: { side: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 20" width={13} height={16} aria-hidden="true">
      {side === "left" ? (
        <polygon points="2,2 14,10 2,18" fill="currentColor" />
      ) : (
        <polygon points="14,2 2,10 14,18" fill="currentColor" />
      )}
    </svg>
  );
}

function DrumAvatar({
  name,
  avatarUrl,
  className,
  size = 40,
}: {
  name: string;
  avatarUrl?: string;
  className: string;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const valid = !broken ? safeAvatar(avatarUrl) : "";
  if (valid) {
    return (
      <img
        src={valid}
        alt=""
        width={size}
        height={size}
        className={className}
        decoding="async"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className={`${className} raffle-drum__avatar--ph`} aria-hidden="true">
      {(name[0] || "K").toUpperCase()}
    </span>
  );
}

export interface RaffleDrumRouletteProps {
  raffleId: number;
  winner: string | null;
  spinMode?: RaffleSpinMode;
  spinKind?: RaffleSpinKind;
  eliminatedTarget?: string | null;
  remainingCount?: number;
  spinSpeed?: RaffleSpinSpeed;
  spinDurationMs?: number;
  participants: RaffleParticipant[];
  viewerNameLower: string;
  awaitingDraw: boolean;
  spinTrigger: number;
  drawSignature: string;
  enteringIds?: ReadonlySet<number>;
  countBumpGen?: number;
  canEnter?: boolean;
  joined?: boolean;
  joining?: boolean;
  canManage?: boolean;
  onJoin?: () => void;
  onSelectPlayer?: (player: RaffleParticipant) => void;
  onPhaseChange?: (phase: DrumPhase) => void;
  onShowParticipants: () => void;
}

export function RaffleDrumRoulette({
  raffleId,
  winner,
  spinMode = "winner",
  spinKind = null,
  eliminatedTarget = null,
  remainingCount,
  spinSpeed = "normal",
  spinDurationMs,
  participants,
  viewerNameLower,
  awaitingDraw,
  spinTrigger,
  drawSignature,
  enteringIds,
  countBumpGen = 0,
  canEnter = false,
  joined = false,
  joining = false,
  canManage = false,
  onJoin,
  onSelectPlayer,
  onPhaseChange,
  onShowParticipants,
}: RaffleDrumRouletteProps) {
  const cleanWinner = (winner || "").trim();
  const cleanEliminated = (eliminatedTarget || "").trim();
  const isEliminationSpin = spinKind === "elimination" && Boolean(cleanEliminated);
  const isElimMode = spinMode === "elimination" || isEliminationSpin;

  const resolvedDurationMs = useMemo(() => {
    if (reduceMotion) return 0;
    if (typeof spinDurationMs === "number" && Number.isFinite(spinDurationMs)) {
      return Math.max(0, spinDurationMs);
    }
    if (spinSpeed === "instant") return 0;
    if (spinSpeed === "fast") return 2000;
    return DEFAULT_SPIN_DURATION_MS;
  }, [spinDurationMs, spinSpeed]);

  const winIndex = useMemo(
    () => START_INDEX + computeSpinSteps(resolvedDurationMs),
    [resolvedDurationMs],
  );

  const sortedParticipants = useMemo(
    () => [...participants].sort((a, b) => a.ticket_no - b.ticket_no),
    [participants],
  );

  const activeSurvivors = useMemo(
    () => sortedParticipants.filter((p) => !p.is_eliminated),
    [sortedParticipants],
  );

  const winnerEntry = useMemo<RaffleParticipant | null>(() => {
    if (!cleanWinner) return null;
    const lower = cleanWinner.toLowerCase();
    const byName = sortedParticipants.find((p) => p.name.toLowerCase() === lower);
    if (byName) return byName;
    const byFlag = sortedParticipants.find((p) => p.is_winner);
    if (byFlag) return byFlag;
    return {
      id: -1,
      name: cleanWinner,
      avatar_url: `/api/leaderboards/avatar/${encodeURIComponent(cleanWinner)}`,
      joined_at: 0,
      ticket_no: 0,
      is_winner: true,
    };
  }, [cleanWinner, sortedParticipants]);

  const eliminatedEntry = useMemo<RaffleParticipant | null>(() => {
    if (!cleanEliminated) return null;
    const lower = cleanEliminated.toLowerCase();
    const byName = sortedParticipants.find((p) => p.name.toLowerCase() === lower);
    if (byName) return byName;
    return {
      id: -2,
      name: cleanEliminated,
      avatar_url: `/api/leaderboards/avatar/${encodeURIComponent(cleanEliminated)}`,
      joined_at: 0,
      ticket_no: 0,
      is_winner: false,
      is_eliminated: true,
    };
  }, [cleanEliminated, sortedParticipants]);

  const targetEntry = isEliminationSpin ? eliminatedEntry : winnerEntry;
  const hasTarget = Boolean(targetEntry);

  const spinPool = useMemo<RaffleParticipant[]>(() => {
    if (!isEliminationSpin) {
      if (activeSurvivors.length >= 2) {
        if (
          winnerEntry &&
          !activeSurvivors.some((p) => p.name.toLowerCase() === winnerEntry.name.toLowerCase())
        ) {
          return [...activeSurvivors, winnerEntry];
        }
        return activeSurvivors;
      }
      return sortedParticipants;
    }
    if (
      !awaitingDraw &&
      eliminatedEntry &&
      !activeSurvivors.some((p) => p.name.toLowerCase() === eliminatedEntry.name.toLowerCase())
    ) {
      return [...activeSurvivors, eliminatedEntry];
    }
    return activeSurvivors.length > 0 ? activeSurvivors : sortedParticipants;
  }, [
    isEliminationSpin,
    awaitingDraw,
    activeSurvivors,
    sortedParticipants,
    eliminatedEntry,
    winnerEntry,
  ]);

  const initialPhase = (): DrumPhase => {
    if (awaitingDraw) return "preparing";
    if (!hasTarget) return sortedParticipants.length === 0 ? "empty" : "preparing";
    if (resolvedDurationMs <= 0 || isRaffleDrawSeen(drawSignature)) {
      return "settled";
    }
    return "spinning";
  };

  const [phase, setPhase] = useState<DrumPhase>(initialPhase);
  // True briefly when an elimination spin lands on the knocked-out card before removing it from the drum
  const [elimKnockout, setElimKnockout] = useState(false);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const poolRef = useRef<HTMLDivElement | null>(null);
  const pinnedPoolBottomRef = useRef(false);
  const wasSpinningRef = useRef(false);
  const rafRef = useRef<number>(0);
  const knockoutTimerRef = useRef<number>(0);
  const lastSpinTriggerRef = useRef<number>(spinTrigger);
  const activeSpinKeyRef = useRef<string>("");
  const activeSpinCardsRef = useRef<RaffleParticipant[]>([]);

  const spinKey = `${drawSignature || raffleId}:${spinTrigger}`;

  const spinningReelCards = useMemo(
    () => buildReelCards(spinPool, targetEntry, spinKey, winIndex),
    [spinPool, targetEntry, spinKey, winIndex],
  );

  const updatePhase = useCallback(
    (next: DrumPhase) => {
      setPhase(next);
      onPhaseChange?.(next);
    },
    [onPhaseChange],
  );

  useEffect(
    () => () => {
      activeSpinKeyRef.current = "";
      activeSpinCardsRef.current = [];
      window.cancelAnimationFrame(rafRef.current);
      window.clearTimeout(knockoutTimerRef.current);
    },
    [],
  );

  const startDrumAnimation = useCallback(
    (
      cards: RaffleParticipant[],
      sig: string,
      key: string,
      durationMs: number,
      targetWinIdx: number,
      elimSpin: boolean,
    ) => {
      activeSpinKeyRef.current = "";
      activeSpinCardsRef.current = [];
      window.cancelAnimationFrame(rafRef.current);
      window.clearTimeout(knockoutTimerRef.current);
      setElimKnockout(false);

      if (!cards.length) {
        updatePhase("empty");
        return;
      }

      if (durationMs <= 0) {
        markRaffleDrawSeen(sig);
        updatePhase("settled");
        return;
      }

      activeSpinKeyRef.current = key;
      activeSpinCardsRef.current = cards;
      updatePhase("spinning");
      if (trackRef.current) {
        trackRef.current.style.transition = "none";
        trackRef.current.style.transform = trackOffsetForIndex(START_INDEX);
        wasSpinningRef.current = true;
      }

      const startTime = performance.now();

      const step = (nowMs: number) => {
        const elapsed = Math.max(0, nowMs - startTime);
        const t = Math.min(1, elapsed / durationMs);
        const eased = easeOutDrum(t);
        const pos = START_INDEX + (targetWinIdx - START_INDEX) * eased;

        if (trackRef.current) {
          trackRef.current.style.transform = trackOffsetForIndex(pos);
        }

        if (t < 1) {
          rafRef.current = window.requestAnimationFrame(step);
        } else {
          if (trackRef.current) {
            trackRef.current.style.transform = trackOffsetForIndex(targetWinIdx);
          }
          if (elimSpin) {
            setElimKnockout(true);
            const holdMs = durationMs <= 1100 ? 450 : 850;
            knockoutTimerRef.current = window.setTimeout(() => {
              activeSpinKeyRef.current = "";
              activeSpinCardsRef.current = [];
              setElimKnockout(false);
              markRaffleDrawSeen(sig);
              updatePhase("settled");
            }, holdMs);
          } else {
            activeSpinKeyRef.current = "";
            activeSpinCardsRef.current = [];
            markRaffleDrawSeen(sig);
            updatePhase("settled");
          }
        }
      };

      rafRef.current = window.requestAnimationFrame(step);
    },
    [updatePhase],
  );

  useEffect(() => {
    const forcedByTrigger = spinTrigger !== lastSpinTriggerRef.current;
    if (forcedByTrigger) {
      lastSpinTriggerRef.current = spinTrigger;
    }

    if (awaitingDraw) {
      activeSpinKeyRef.current = "";
      activeSpinCardsRef.current = [];
      window.cancelAnimationFrame(rafRef.current);
      window.clearTimeout(knockoutTimerRef.current);
      setElimKnockout(false);
      updatePhase("preparing");
      return;
    }

    if (!hasTarget) {
      activeSpinKeyRef.current = "";
      activeSpinCardsRef.current = [];
      window.cancelAnimationFrame(rafRef.current);
      window.clearTimeout(knockoutTimerRef.current);
      setElimKnockout(false);
      if (sortedParticipants.length === 0) {
        updatePhase("empty");
      } else {
        updatePhase("preparing");
      }
      return;
    }

    if (!forcedByTrigger && activeSpinKeyRef.current === spinKey) {
      return;
    }

    const alreadySeen = isRaffleDrawSeen(drawSignature);
    if (!forcedByTrigger && alreadySeen) {
      activeSpinKeyRef.current = "";
      activeSpinCardsRef.current = [];
      window.cancelAnimationFrame(rafRef.current);
      window.clearTimeout(knockoutTimerRef.current);
      setElimKnockout(false);
      updatePhase("settled");
      return;
    }

    startDrumAnimation(
      spinningReelCards,
      drawSignature,
      spinKey,
      resolvedDurationMs,
      winIndex,
      isEliminationSpin,
    );
  }, [
    awaitingDraw,
    hasTarget,
    drawSignature,
    spinKey,
    sortedParticipants.length,
    spinningReelCards,
    resolvedDurationMs,
    winIndex,
    isEliminationSpin,
    spinTrigger,
    startDrumAnimation,
    updatePhase,
  ]);

  // Determine which view/cards are rendered right now:
  // - In Elimination mode when NOT actively spinning/knocking-out:
  //   * If a winner is crowned (sole survivor): render ONLY that 1 winner card on the payline!
  //   * Otherwise (`showIdleElimPool`): render a crisp 2-column scrollable grid of all remaining active players!
  const showElimRemainingOnly =
    isElimMode && phase !== "spinning" && !elimKnockout && !awaitingDraw;
  const showIdleElimPool = showElimRemainingOnly && !winnerEntry;

  const displayedCards = useMemo<RaffleParticipant[]>(() => {
    if (showElimRemainingOnly) {
      if (winnerEntry) return [winnerEntry];
      return activeSurvivors;
    }
    if ((phase === "spinning" || elimKnockout) && activeSpinCardsRef.current.length > 0) {
      return activeSpinCardsRef.current;
    }
    return spinningReelCards;
  }, [showElimRemainingOnly, winnerEntry, activeSurvivors, phase, elimKnockout, spinningReelCards]);

  const restingFocusPos = useMemo(() => {
    if (showElimRemainingOnly) return 0;
    return phase === "settled" ? winIndex : START_INDEX;
  }, [showElimRemainingOnly, phase, winIndex]);

  const restingTransform = trackOffsetForIndex(restingFocusPos);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) {
      wasSpinningRef.current = false;
      return;
    }
    if (phase === "spinning") {
      if (!wasSpinningRef.current) {
        track.style.transition = "none";
        track.style.transform = trackOffsetForIndex(START_INDEX);
        wasSpinningRef.current = true;
      }
      return;
    }
    wasSpinningRef.current = false;
    track.style.transition = "none";
    track.style.transform = restingTransform;
  }, [phase, restingTransform]);

  const handlePoolScroll = useCallback(() => {
    const el = poolRef.current;
    if (!el) return;
    pinnedPoolBottomRef.current =
      el.scrollHeight > el.clientHeight + 4 &&
      el.scrollHeight - el.scrollTop - el.clientHeight < 36;
  }, []);

  useLayoutEffect(() => {
    if (!showIdleElimPool || !pinnedPoolBottomRef.current) return;
    const el = poolRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
  }, [showIdleElimPool, activeSurvivors.length]);

  const eliminatedCount = Math.max(0, sortedParticipants.length - activeSurvivors.length);
  const lastEliminatedStillOut = useMemo(() => {
    if (!cleanEliminated) return false;
    const lower = cleanEliminated.toLowerCase();
    return sortedParticipants.some(
      (p) => p.name.toLowerCase() === lower && Boolean(p.is_eliminated),
    );
  }, [cleanEliminated, sortedParticipants]);

  const baseSurvivorsCount =
    typeof remainingCount === "number" ? remainingCount : activeSurvivors.length;
  const headerElimCount =
    isEliminationSpin && (phase === "spinning" || elimKnockout) && eliminatedEntry
      ? baseSurvivorsCount + 1
      : baseSurvivorsCount;

  const drumVisualKind =
    isElimMode &&
    (((phase === "spinning" || elimKnockout) && isEliminationSpin) ||
      (awaitingDraw && !winnerEntry && activeSurvivors.length >= 2))
      ? "elimination"
      : showIdleElimPool
        ? "idle-pool"
        : "winner";

  const countBumpClass =
    countBumpGen > 0 ? (countBumpGen % 2 === 1 ? " is-bump-a" : " is-bump-b") : "";

  return (
    <aside
      className={`raffle-view__participants raffle-drum raffle-drum--${phase}${drumVisualKind === "elimination"
        ? " raffle-drum--elimination"
        : drumVisualKind === "idle-pool"
          ? " raffle-drum--idle-pool"
          : ""
        }`}
      aria-label={isElimMode ? "Raffle elimination drum" : "Raffle winner roulette"}
      data-raffle-roulette
      data-drum-phase={phase}
      data-drum-kind={isElimMode ? "elimination" : "winner"}
    >
      <div className="raffle-view__p-head">
        <div className="raffle-view__p-title-wrap">
          <Link
            className="raffle-view__back-icon"
            to="/raffles/"
            aria-label="Back to all raffles"
            title="All raffles"
            data-raffle-back
          >
            <ArrowLeftSvg />
          </Link>
          <h2 className="raffle-view__p-title">
            {isElimMode ? "Elimination Drum" : "Winner Roulette"}
          </h2>
          <span className={`raffle-view__p-count${countBumpClass}`} data-participants-count>
            {isElimMode
              ? winnerEntry && showElimRemainingOnly
                ? "1 winner"
                : `${headerElimCount} left`
              : sortedParticipants.length}
          </span>
        </div>

        <div className="raffle-drum__head-actions">
          {canEnter && joined ? (
            <span className="raffle-view__joined-pill" data-raffle-joined>
              ✓ You're in
            </span>
          ) : (
            onJoin &&
            canEnter &&
            !joined && (
              <button
                type="button"
                className={`raffle-view__join-btn${joining ? " is-loading-shimmer" : ""}`}
                disabled={joining}
                onClick={onJoin}
              >
                {joining ? "Joining…" : "Join raffle"}
              </button>
            )
          )}
          <button
            type="button"
            className="raffle-drum__ctrl-btn raffle-drum__ctrl-btn--list"
            onClick={onShowParticipants}
            data-raffle-show-participants
            title="View all participants"
          >
            <UsersListSvg />
            <span>Participants</span>
          </button>
        </div>
      </div>

      {/* Main Vertical Drum Chamber (fills entire panel below header) */}
      {phase === "empty" ? (
        <div className="raffle-drum__empty">
          <img
            src="/img/deco/last-raffles/ticket.webp"
            alt=""
            width={76}
            height={45}
            className="raffle-view__p-empty-img"
          />
          <strong>No participants in drum</strong>
          <p>
            {canEnter
              ? "Waiting for entrants to join before spinning the roulette."
              : "This raffle ended with no entrants."}
          </p>
        </div>
      ) : showIdleElimPool ? (
        <div className="raffle-drum__chamber raffle-drum__chamber--pool">
          {eliminatedCount > 0 && activeSurvivors.length > 0 && (
            <div className="raffle-drum__pool-status">
              <span className="raffle-drum__pool-status-count">
                <strong>{activeSurvivors.length}</strong> of {sortedParticipants.length} remaining
              </span>
              {lastEliminatedStillOut && (
                <span className="raffle-drum__pool-last-out">
                  Last out: <strong>{cleanEliminated}</strong>
                </span>
              )}
            </div>
          )}

          {activeSurvivors.length === 0 ? (
            <div className="raffle-drum__pool-empty">
              <strong>No remaining players</strong>
              <p>Reset eliminations or restore entrants to spin the roulette.</p>
            </div>
          ) : (
            <div
              ref={poolRef}
              className="raffle-drum__pool"
              onScroll={handlePoolScroll}
              data-drum-pool=""
            >
              {activeSurvivors.map((item) => {
                const isYou =
                  Boolean(viewerNameLower) && item.name.toLowerCase() === viewerNameLower;
                const isEntering = !reduceMotion && Boolean(enteringIds?.has(item.id));
                const canInspectCard = Boolean(canManage && onSelectPlayer);
                const isBannedCard = canManage && Boolean(item.is_banned);
                const isTimedOutCard =
                  canManage &&
                  !isBannedCard &&
                  Boolean(item.banned_until && item.banned_until > Date.now());

                return (
                  <div
                    key={`pool-${item.id}`}
                    className={`raffle-drum__pool-card${isYou ? " is-you" : ""}${
                      canInspectCard ? " is-clickable" : ""
                    }${isEntering ? " is-entering" : ""}`}
                    role={canInspectCard ? "button" : undefined}
                    tabIndex={canInspectCard ? 0 : undefined}
                    onClick={canInspectCard ? () => onSelectPlayer?.(item) : undefined}
                    onKeyDown={
                      canInspectCard
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onSelectPlayer?.(item);
                            }
                          }
                        : undefined
                    }
                    data-drum-player={canInspectCard ? item.name : undefined}
                  >
                    <div className="raffle-drum__pool-user">
                      <DrumAvatar
                        name={item.name}
                        avatarUrl={item.avatar_url}
                        className="raffle-drum__pool-avatar"
                        size={34}
                      />
                      <div className="raffle-drum__pool-meta">
                        <span className="raffle-drum__pool-name">
                          <span className="raffle-drum__card-handle">{item.name}</span>
                          {isYou && <span className="raffle-view__p-tag">You</span>}
                          {isBannedCard && (
                            <span className="raffle-view__p-tag raffle-view__p-tag--out">
                              Banned
                            </span>
                          )}
                          {isTimedOutCard && (
                            <span className="raffle-view__p-tag raffle-view__p-tag--out">
                              Timeout
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    {item.ticket_no > 0 && (
                      <span className="raffle-drum__pool-ticket">#{item.ticket_no}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="raffle-drum__chamber">
          {/* Cylindrical top & bottom depth fade masks */}
          <div className="raffle-drum__mask raffle-drum__mask--top" aria-hidden="true" />
          <div className="raffle-drum__mask raffle-drum__mask--bottom" aria-hidden="true" />

          {/* Side mechanical guide rails */}
          <span className="raffle-drum__rail raffle-drum__rail--l" aria-hidden="true" />
          <span className="raffle-drum__rail raffle-drum__rail--r" aria-hidden="true" />

          {/* Center Payline Frame & Pointers */}
          <div className="raffle-drum__payline" aria-hidden="true">
            <span className="raffle-drum__pointer raffle-drum__pointer--l">
              <PointerChevronSvg side="left" />
            </span>
            <span className="raffle-drum__payline-box" />
            <span className="raffle-drum__pointer raffle-drum__pointer--r">
              <PointerChevronSvg side="right" />
            </span>
          </div>

          {/* Vertical Reel Track anchored around vertical 50% midpoint */}
          <div className="raffle-drum__anchor">
            <div
              ref={trackRef}
              className="raffle-drum__track"
              style={phase !== "spinning" ? { transform: restingTransform } : undefined}
            >
              {displayedCards.map((item, idx) => {
                const isYou =
                  Boolean(viewerNameLower) && item.name.toLowerCase() === viewerNameLower;

                const isKnockoutCard = elimKnockout && idx === winIndex;
                const isSettledSoleElimWinner =
                  showElimRemainingOnly && Boolean(winnerEntry) && idx === 0;
                const isSettledStandardWinner =
                  !isElimMode && phase === "settled" && Boolean(winnerEntry) && idx === winIndex;
                const isLandedWinner = isSettledSoleElimWinner || isSettledStandardWinner;

                let stateClass = "";
                if (isKnockoutCard) {
                  stateClass = " is-landed-eliminated is-knockout-exit";
                } else if (elimKnockout) {
                  const dist = Math.abs(idx - winIndex);
                  stateClass = dist === 1 ? " is-neighbor-near" : " is-neighbor-far";
                } else if (isLandedWinner) {
                  stateClass = " is-landed-winner";
                } else if (!isElimMode && phase === "settled" && winnerEntry) {
                  const dist = Math.abs(idx - winIndex);
                  stateClass = dist === 1 ? " is-neighbor-near" : " is-neighbor-far";
                }

                const canInspectCard =
                  Boolean(canManage && onSelectPlayer) && phase !== "spinning";

                return (
                  <div
                    key={
                      showElimRemainingOnly
                        ? `pool-${item.id}`
                        : `reel-${idx}-${item.id}-${item.ticket_no}`
                    }
                    className={`raffle-drum__card${isYou ? " is-you" : ""}${
                      canInspectCard ? " is-clickable" : ""
                    }${stateClass}`}
                    role={canInspectCard ? "button" : undefined}
                    tabIndex={canInspectCard ? 0 : undefined}
                    onClick={canInspectCard ? () => onSelectPlayer?.(item) : undefined}
                    onKeyDown={
                      canInspectCard
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onSelectPlayer?.(item);
                            }
                          }
                        : undefined
                    }
                    data-drum-player={canInspectCard ? item.name : undefined}
                    data-drum-slot={
                      isKnockoutCard
                        ? "eliminated"
                        : isLandedWinner
                          ? "winner"
                          : undefined
                    }
                  >
                    <div className="raffle-drum__card-user">
                      <DrumAvatar
                        name={item.name}
                        avatarUrl={item.avatar_url}
                        className="raffle-drum__avatar"
                        size={40}
                      />
                      <div className="raffle-drum__card-meta">
                        <span className="raffle-drum__card-name">
                          <span className="raffle-drum__card-handle">{item.name}</span>
                          {isYou && <span className="raffle-view__p-tag">You</span>}
                          {isLandedWinner && (
                            <span className="raffle-view__p-tag raffle-view__p-tag--win">
                              Winner
                            </span>
                          )}
                          {isKnockoutCard && (
                            <span className="raffle-view__p-tag raffle-view__p-tag--out">
                              Eliminated
                            </span>
                          )}
                        </span>
                        <span className="raffle-drum__card-sub">
                          {isKnockoutCard
                            ? "Removed from roulette"
                            : isLandedWinner
                              ? isElimMode
                                ? "Last player standing"
                                : "Selected on center line"
                              : item.ticket_no > 0
                                ? "In roulette"
                                : "Official draw"}
                        </span>
                      </div>
                    </div>

                    <span className="raffle-drum__ticket">
                      {isKnockoutCard
                        ? "OUT"
                        : item.ticket_no > 0
                          ? `#${item.ticket_no}`
                          : "WIN"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
