import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { site } from "../../shared/site";
import { KickStreamPlayer } from "../components/KickStreamPlayer";
import {
  RaffleDrumRoulette,
  buildDrawSignature,
  isRaffleDrawSeen,
  type DrumPhase,
} from "../components/RaffleDrumRoulette";
import {
  RafflePlayerOverlay,
  type SelectedRafflePlayer,
} from "../components/RafflePlayerOverlay";
import {
  StreamerRaffleOverlay,
  type SpinActionResult,
} from "../components/StreamerRaffleOverlay";
import { useCopy } from "../hooks/useCopy";
import { usePosterReady } from "../hooks/useMediaReady";
import { useNow } from "../hooks/useNow";
import { usePageMeta } from "../hooks/usePageMeta";
import { ApiError, errorCode, getJson, postJson, streamerApi } from "../lib/api";
import { countdown, defaultSiteSettings, fetchSiteSettings } from "../lib/boards";
import { reduceMotion, safeAvatar } from "../lib/format";
import {
  buildRaffleEntryPath,
  buildRaffleEntryUrl,
  clearPendingRaffleJoin,
  getPendingRaffleJoin,
  hasPartnerUsername,
  isSiteRegistered,
  setPendingRaffleJoin,
} from "../lib/raffleJoin";
import type {
  Raffle,
  RaffleDetailResponse,
  RaffleJoin,
  RaffleParticipant,
  RaffleWinner,
  SiteSettings,
} from "../lib/types";
import { useSession } from "../state/session";
import { useUi } from "../state/ui";

const JOIN_ERRORS: Record<string, string> = {
  register: "Confirm your email on your account page first.",
  partner: "Add your partner site username on your account page first.",
  kick: "Authorize your Kick account first.",
  banned: "You are banned from participating in raffles.",
  timeout: "You are temporarily restricted from joining raffles.",
  locked: "Entries are currently locked by the streamer.",
  closed: "This raffle has already closed.",
};

function formatRelJoin(ms: number, now: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const diff = Math.max(0, now - ms);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
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

function LinkChainSvg() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} aria-hidden="true">
      <path
        d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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

function ClockSvg() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
      <circle cx={12} cy={12} r={9} fill="none" stroke="currentColor" strokeWidth={2.1} />
      <path
        d="M12 7.2v5l3.4 2"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BoltSvg() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
      <polygon points="13 2 4 14 12 14 11 22 20 10 12 10 13 2" fill="currentColor" />
    </svg>
  );
}

function TrophySvg() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
      <path
        d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchSvg() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} aria-hidden="true">
      <circle cx={11} cy={11} r={7.5} fill="none" stroke="currentColor" strokeWidth={2} />
      <path
        d="m20 20-3.8-3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}

const PRIZE_SCENE_POSTER = "/img/deco/raffle-prize-scene.webp";
const PRIZE_SCENE_VIDEO = "/img/deco/raffle-prize-scene.mp4";

function RafflePrizeCard({ headlinePrize }: { headlinePrize: string }) {
  const posterReady = usePosterReady(PRIZE_SCENE_POSTER);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (reduceMotion) {
      video.pause();
      return;
    }
    video.muted = true;
    video.loop = true;
    const start = () => {
      void video.play().catch(() => { });
    };
    if (video.readyState >= 2) start();
    else video.addEventListener("loadeddata", start, { once: true });
    return () => video.removeEventListener("loadeddata", start);
  }, []);

  return (
    <article className="raffle-view__prize-card" aria-label="Raffle prize">
      <div className="raffle-view__prize-stage">
        {!posterReady && (
          <i className="skel-overlay skel-overlay--indigo" aria-hidden="true" />
        )}
        <video
          ref={videoRef}
          className="raffle-view__prize-live"
          muted
          loop
          playsInline
          autoPlay={!reduceMotion}
          preload="auto"
          aria-hidden="true"
          poster={PRIZE_SCENE_POSTER}
          src={PRIZE_SCENE_VIDEO}
        />
        <span className="raffle-view__prize-vignette" aria-hidden="true" />

        <div className="raffle-view__prize-center">
          <span className="raffle-view__prize-eyebrow">
            <TrophySvg />
            <span>Prize</span>
          </span>
          <div className="raffle-view__prize-value" data-raffle-prize>
            {headlinePrize}
          </div>
        </div>
      </div>
    </article>
  );
}

export function RaffleDetailPage() {
  const { id: rawId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const raffleId = useMemo(() => {
    const s = String(rawId || "").trim();
    if (!/^\d+$/.test(s)) return 0;
    const n = Number(s);
    return Number.isSafeInteger(n) && n > 0 ? n : 0;
  }, [rawId]);

  const now = useNow();
  const { status: sessionStatus, account, signedIn, accountRev } = useSession();
  const { dataRev, openRaffleModal } = useUi();

  const canManage = Boolean(signedIn && (account?.isStreamer || account?.isAdmin));

  const [status, setStatus] = useState<"loading" | "ready" | "notfound" | "error">("loading");
  const [raffle, setRaffle] = useState<Raffle | null>(null);
  const [winners, setWinners] = useState<RaffleWinner[]>([]);
  const [participants, setParticipants] = useState<RaffleParticipant[]>([]);
  const [joined, setJoined] = useState(false);

  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [entryBusyId, setEntryBusyId] = useState<number | null>(null);
  const [resettingWinners, setResettingWinners] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<SelectedRafflePlayer | null>(null);

  // Streamer spin / winner & elimination roulette state
  const [finishing, setFinishing] = useState(false);
  const [leftPanelMode, setLeftPanelMode] = useState<"auto" | "participants">("auto");
  const [drumPhase, setDrumPhase] = useState<DrumPhase>("settled");
  const [spinTrigger, setSpinTrigger] = useState(0);
  const [actionMsg, setActionMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const lastSignatureRef = useRef<string>("");
  const wasOpenRef = useRef<boolean>(false);

  // Live bottom-up entrant stream queue & FLIP refs
  const [revealState, setRevealState] = useState<{
    hiddenIds: number[];
    stepIds: number[];
    gen: number;
  }>({ hiddenIds: [], stepIds: [], gen: 0 });
  const [drumEnteringIds, setDrumEnteringIds] = useState<Set<number>>(() => new Set());
  const [countBumpGen, setCountBumpGen] = useState(0);

  const seenParticipantsRef = useRef<{
    raffleId: number;
    initialized: boolean;
    ids: Set<number>;
  }>({ raffleId: 0, initialized: false, ids: new Set() });
  const initialLoadedIdsRef = useRef<Set<number>>(new Set());
  const queuedIdsRef = useRef<number[]>([]);
  const enteringTimersRef = useRef<Map<number, number>>(new Map());
  const finishingRef = useRef(false);
  const drumPhaseRef = useRef<DrumPhase>("settled");

  const listRef = useRef<HTMLDivElement | null>(null);
  const lastMountedListElRef = useRef<HTMLDivElement | null>(null);
  const pinnedBottomRef = useRef(true);
  const prevFromBottomRef = useRef<Map<number, number>>(new Map());
  const handledStepGenRef = useRef<number>(0);
  const flipAnimatingRef = useRef(false);
  const lastAutoScrollTopRef = useRef<number>(0);
  const flipCleanupTimerRef = useRef<number>(0);

  finishingRef.current = finishing;
  drumPhaseRef.current = drumPhase;

  // Live Kick channel settings
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(() => defaultSiteSettings());

  const markDrumEntering = useCallback((ids: number[]) => {
    if (ids.length === 0 || reduceMotion) return;
    setDrumEnteringIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    for (const id of ids) {
      const existing = enteringTimersRef.current.get(id);
      if (existing) window.clearTimeout(existing);
      const timer = window.setTimeout(() => {
        enteringTimersRef.current.delete(id);
        setDrumEnteringIds((cur) => {
          if (!cur.has(id)) return cur;
          const next = new Set(cur);
          next.delete(id);
          return next;
        });
      }, 430);
      enteringTimersRef.current.set(id, timer);
    }
  }, []);

  useEffect(() => {
    const timers = enteringTimersRef.current;
    return () => {
      for (const t of timers.values()) window.clearTimeout(t);
      timers.clear();
      window.clearTimeout(flipCleanupTimerRef.current);
    };
  }, []);

  useEffect(() => {
    for (const t of enteringTimersRef.current.values()) window.clearTimeout(t);
    enteringTimersRef.current.clear();
    window.clearTimeout(flipCleanupTimerRef.current);
    seenParticipantsRef.current = { raffleId, initialized: false, ids: new Set() };
    initialLoadedIdsRef.current.clear();
    queuedIdsRef.current = [];
    lastMountedListElRef.current = null;
    pinnedBottomRef.current = true;
    prevFromBottomRef.current.clear();
    handledStepGenRef.current = 0;
    flipAnimatingRef.current = false;
    wasOpenRef.current = false;
    setRevealState({ hiddenIds: [], stepIds: [], gen: 0 });
    setDrumEnteringIds(new Set());
    setCountBumpGen(0);
    setSelectedPlayer(null);
  }, [raffleId]);

  useEffect(() => {
    if (revealState.hiddenIds.length === 0) return;
    if (finishing || drumPhase === "spinning" || reduceMotion) {
      queuedIdsRef.current = [];
      setRevealState((prev) =>
        prev.hiddenIds.length === 0
          ? prev
          : { hiddenIds: [], stepIds: [], gen: prev.gen },
      );
      return;
    }
    const timer = window.setTimeout(() => {
      const currentQueue = queuedIdsRef.current;
      if (currentQueue.length === 0) return;
      const [nextId, ...rest] = currentQueue;
      queuedIdsRef.current = rest;
      setRevealState((prev) => ({
        hiddenIds: rest,
        stepIds: [nextId],
        gen: prev.gen + 1,
      }));
      markDrumEntering([nextId]);
      setCountBumpGen((g) => g + 1);
    }, 165);
    return () => window.clearTimeout(timer);
  }, [revealState.hiddenIds, finishing, drumPhase, markDrumEntering]);

  useEffect(() => {
    if (!canManage) setSelectedPlayer(null);
  }, [canManage]);

  const entryPath = raffleId ? buildRaffleEntryPath(raffleId) : "";
  const entryFullUrl = raffleId ? buildRaffleEntryUrl(raffleId) : "";
  const { copied: entryCopied, copy: copyEntryUrl } = useCopy(entryFullUrl);

  usePageMeta({
    title: raffle?.title ? `${raffle.title} — Raffles` : "Raffle",
    pageClass: "site--raffle-detail",
  });

  useEffect(() => {
    let alive = true;
    fetchSiteSettings().then((s) => {
      if (alive) setSiteSettings(s);
    });
    return () => {
      alive = false;
    };
  }, [dataRev]);

  const loadDetail = useCallback(
    async (signal?: AbortSignal, silent = false) => {
      if (!raffleId) {
        setStatus("notfound");
        return;
      }
      if (!silent) setStatus((prev) => (prev === "ready" ? prev : "loading"));
      try {
        const res = await getJson<RaffleDetailResponse>(`/api/raffles/${raffleId}`, { signal });
        if (signal?.aborted) return;
        const nextParticipants = Array.isArray(res.participants) ? res.participants : [];

        const tracker = seenParticipantsRef.current;
        if (!tracker.initialized || tracker.raffleId !== raffleId) {
          const initIds = new Set(nextParticipants.map((p) => p.id));
          seenParticipantsRef.current = {
            raffleId,
            initialized: true,
            ids: initIds,
          };
          initialLoadedIdsRef.current = new Set(initIds);
        } else {
          const prevIds = tracker.ids;
          const added = nextParticipants.filter((p) => !prevIds.has(p.id));
          seenParticipantsRef.current = {
            raffleId,
            initialized: true,
            ids: new Set(nextParticipants.map((p) => p.id)),
          };
          if (added.length > 0) {
            if (
              reduceMotion ||
              finishingRef.current ||
              drumPhaseRef.current === "spinning"
            ) {
              setCountBumpGen((g) => g + 1);
            } else {
              const sortedAddedIds = [...added]
                .sort((a, b) => a.ticket_no - b.ticket_no || a.id - b.id)
                .map((p) => p.id);

              if (queuedIdsRef.current.length > 0) {
                const combined = [...queuedIdsRef.current, ...sortedAddedIds];
                if (combined.length > 6) {
                  const overflow = combined.slice(0, combined.length - 6);
                  const tail = combined.slice(-6);
                  queuedIdsRef.current = tail;
                  setRevealState((prev) => ({
                    hiddenIds: tail,
                    stepIds: overflow,
                    gen: prev.gen + 1,
                  }));
                  markDrumEntering(overflow);
                  setCountBumpGen((g) => g + 1);
                } else {
                  queuedIdsRef.current = combined;
                  setRevealState((prev) => ({
                    ...prev,
                    hiddenIds: combined,
                  }));
                }
              } else {
                const immediateCount =
                  sortedAddedIds.length > 6 ? sortedAddedIds.length - 5 : 1;
                const immediate = sortedAddedIds.slice(0, immediateCount);
                const rest = sortedAddedIds.slice(immediateCount);
                queuedIdsRef.current = rest;
                setRevealState((prev) => ({
                  hiddenIds: rest,
                  stepIds: immediate,
                  gen: prev.gen + 1,
                }));
                markDrumEntering(immediate);
                setCountBumpGen((g) => g + 1);
              }
            }
          }
        }

        setRaffle(res.raffle);
        setWinners(
          Array.isArray(res.winners)
            ? res.winners
            : Array.isArray(res.raffle?.winners)
              ? res.raffle.winners
              : [],
        );
        setParticipants(nextParticipants);
        setJoined(Boolean(res.viewer?.joined));
        setStatus("ready");
      } catch (err) {
        if (signal?.aborted) return;
        const code = errorCode(err);
        if (code === "HTTP 404" || code === "http_404" || code.toLowerCase().includes("not found")) {
          setStatus("notfound");
        } else if (!silent) {
          setStatus("error");
        }
      }
    },
    [raffleId, markDrumEntering],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void loadDetail(ctrl.signal, false);
    return () => ctrl.abort();
  }, [loadDetail, accountRev, dataRev]);

  const isManual = raffle?.end_mode === "manual";
  const spinMode = raffle?.spin_mode === "elimination" ? "elimination" : "winner";
  const spinSpeed =
    raffle?.spin_speed === "fast" || raffle?.spin_speed === "instant"
      ? raffle.spin_speed
      : "normal";
  const spinDurationMs =
    typeof raffle?.spin_duration_ms === "number" && Number.isFinite(raffle.spin_duration_ms)
      ? Math.max(0, raffle.spin_duration_ms)
      : spinSpeed === "instant"
        ? 0
        : spinSpeed === "fast"
          ? 2000
          : 4000;
  const endsAt = Number(raffle?.ends_at) || 0;
  const startsAt = Number(raffle?.starts_at) || 0;
  const entriesLocked =
    Boolean(raffle?.entries_locked) || (!isManual && endsAt > 0 && endsAt <= now);
  const isOpen = Boolean(
    raffle &&
    raffle.ended_at == null &&
    startsAt <= now &&
    (isManual || endsAt > now || spinMode === "elimination"),
  );
  const canEnter = isOpen && !entriesLocked;

  const activeParticipantsCount = useMemo(
    () => participants.filter((p) => !p.is_eliminated).length,
    [participants],
  );
  const eliminatedParticipantsCount = participants.length - activeParticipantsCount;

  const hiddenSet = useMemo(
    () => (revealState.hiddenIds.length > 0 ? new Set(revealState.hiddenIds) : null),
    [revealState.hiddenIds],
  );
  const visibleParticipants = useMemo(
    () => (hiddenSet ? participants.filter((p) => !hiddenSet.has(p.id)) : participants),
    [participants, hiddenSet],
  );
  const visibleActiveCount = useMemo(
    () => visibleParticipants.filter((p) => !p.is_eliminated).length,
    [visibleParticipants],
  );
  const visibleEliminatedCount = visibleParticipants.length - visibleActiveCount;
  const chronologicalParticipants = useMemo(
    () =>
      [...visibleParticipants].sort(
        (a, b) => a.ticket_no - b.ticket_no || a.id - b.id,
      ),
    [visibleParticipants],
  );

  // Immediately finalize & fetch drawn winner on the server once a countdown timer hits 0
  const needsExpiryFinalize = Boolean(
    status === "ready" &&
    raffle &&
    !isManual &&
    raffle.ended_at == null &&
    endsAt > 0 &&
    endsAt <= now &&
    !(spinMode === "elimination" && Boolean(raffle.entries_locked)),
  );

  useEffect(() => {
    if (!needsExpiryFinalize) return;
    let followUpTimer = 0;
    const ctrl = new AbortController();
    const syncExpired = async () => {
      await loadDetail(ctrl.signal, true);
      if (!ctrl.signal.aborted) {
        followUpTimer = window.setTimeout(() => {
          void loadDetail(ctrl.signal, true);
        }, 500);
      }
    };
    void syncExpired();
    return () => {
      ctrl.abort();
      window.clearTimeout(followUpTimer);
    };
  }, [needsExpiryFinalize, loadDetail]);

  const drawSignature = useMemo(
    () =>
      raffle
        ? buildDrawSignature(
          raffleId,
          raffle.winner,
          raffle.updated_at,
          raffle.ended_at,
          raffle.last_spin_kind,
          raffle.last_eliminated,
          raffle.last_spin_at,
        )
        : "",
    [raffle, raffleId],
  );

  useEffect(() => {
    setLeftPanelMode("auto");
  }, [spinMode]);

  useEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      setLeftPanelMode("auto");
    }
    wasOpenRef.current = isOpen;

    if (drawSignature && drawSignature !== lastSignatureRef.current) {
      lastSignatureRef.current = drawSignature;
      setLeftPanelMode("auto");
      return;
    }
    if (!drawSignature) {
      lastSignatureRef.current = "";
    }
    if (isOpen && !finishing && !drawSignature) {
      setLeftPanelMode("auto");
    }
  }, [isOpen, finishing, drawSignature]);

  const awaitingFirstWinner = !raffle?.winner;

  // Keep gentle live poll active so viewers see new entrants, elimination spins, AND post-winner rerolls
  useEffect(() => {
    if (status !== "ready" || finishing || drumPhase === "spinning") return;
    const intervalMs = isOpen || awaitingFirstWinner ? 4_500 : 7_000;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      void loadDetail(undefined, true);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [status, isOpen, awaitingFirstWinner, finishing, drumPhase, loadDetail]);

  const runParticipationFlow = useCallback(
    async (replaceHistory: boolean) => {
      if (!raffleId || !raffle || joining) return;

      const registered = isSiteRegistered(account);
      const partnerReady = hasPartnerUsername(account);
      const kickLinked = Boolean(account?.linked);
      const raffleTitle = raffle.title || undefined;
      const rafflePrize = raffle.prize?.trim() || undefined;

      // 1. Missing verified email OR partner site username -> send to /account/
      if (!registered || !partnerReady) {
        setPendingRaffleJoin({
          raffleId,
          raffleTitle,
          rafflePrize,
          kickPrompted: false,
        });
        navigate(`/account/?join_raffle=${raffleId}`, { replace: replaceHistory });
        return;
      }

      // 2. Registered + partner username set, but Kick is not authorized -> open Kick required modal
      if (!kickLinked) {
        setPendingRaffleJoin({
          raffleId,
          raffleTitle,
          rafflePrize,
          kickPrompted: true,
        });
        openRaffleModal({
          kind: "kick-required",
          raffleId,
          raffleTitle,
          rafflePrize,
        });
        return;
      }

      // 3. All profile requirements met -> enter raffle & show Joined checkmark modal
      clearPendingRaffleJoin();

      if (joined) {
        openRaffleModal({
          kind: "joined",
          raffleId,
          raffleTitle,
          rafflePrize,
        });
        return;
      }

      if (!canEnter) {
        setJoinError(
          entriesLocked && isOpen
            ? JOIN_ERRORS.locked
            : JOIN_ERRORS.closed,
        );
        return;
      }

      setJoining(true);
      setJoinError(null);
      try {
        await postJson<RaffleJoin>(`/api/raffles/${raffleId}/join`, {});
        setJoined(true);
        await loadDetail(undefined, true);
        openRaffleModal({
          kind: "joined",
          raffleId,
          raffleTitle,
          rafflePrize,
        });
      } catch (err) {
        const code = errorCode(err);
        if (code === "register" || code === "partner") {
          setPendingRaffleJoin({
            raffleId,
            raffleTitle,
            rafflePrize,
            kickPrompted: false,
          });
          navigate(`/account/?join_raffle=${raffleId}`, { replace: false });
        } else if (code === "kick") {
          openRaffleModal({
            kind: "kick-required",
            raffleId,
            raffleTitle,
            rafflePrize,
          });
        } else if (
          code === "timeout" &&
          err instanceof ApiError &&
          typeof err.body.banned_until === "number"
        ) {
          const remMins = Math.max(1, Math.ceil((err.body.banned_until - Date.now()) / 60_000));
          setJoinError(`You are restricted from joining raffles for another ${remMins}m.`);
        } else {
          setJoinError(JOIN_ERRORS[code] || "Could not join right now. Please try again.");
        }
      } finally {
        setJoining(false);
      }
    },
    [
      raffleId,
      raffle,
      joining,
      account,
      navigate,
      openRaffleModal,
      joined,
      canEnter,
      entriesLocked,
      isOpen,
      loadDetail,
    ],
  );

  // Handle incoming `?join=1` participation link automatically once session & raffle are ready
  const wantAutoJoin = searchParams.get("join") === "1";
  useEffect(() => {
    if (!wantAutoJoin) return;
    if (sessionStatus === "loading" || status !== "ready" || !raffle) return;

    const next = new URLSearchParams(searchParams);
    next.delete("join");
    setSearchParams(next, { replace: true });
    void runParticipationFlow(true);
  }, [
    wantAutoJoin,
    sessionStatus,
    status,
    raffle,
    searchParams,
    setSearchParams,
    runParticipationFlow,
  ]);

  // If user had a pending join for this raffle
  useEffect(() => {
    if (wantAutoJoin) return;
    if (sessionStatus !== "ready" || status !== "ready" || !raffle) return;
    if (!isSiteRegistered(account) || !hasPartnerUsername(account) || !account?.linked) return;

    const pending = getPendingRaffleJoin();
    if (!pending || pending.raffleId !== raffleId) return;

    clearPendingRaffleJoin();
    void runParticipationFlow(false);
  }, [wantAutoJoin, sessionStatus, status, raffle, account, raffleId, runParticipationFlow]);

  const handleEntryLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    void runParticipationFlow(false);
  };

  const applySpinCompletion = useCallback(
    async (_res: SpinActionResult) => {
      await loadDetail(undefined, true);
      setSpinTrigger((n) => n + 1);
      setFinishing(false);
    },
    [loadDetail],
  );

  const handleResetWinners = async () => {
    if (!raffleId || !canManage || resettingWinners || finishing || drumPhase === "spinning") {
      return;
    }
    setResettingWinners(true);
    setActionMsg(null);
    try {
      await streamerApi(`/api/raffles/manage/${raffleId}/reset-winners`, {
        method: "POST",
        body: {},
      });
      lastSignatureRef.current = "";
      await loadDetail(undefined, true);
    } catch (err) {
      setActionMsg({
        text: errorCode(err) || "Could not reset winners",
        error: true,
      });
    } finally {
      setResettingWinners(false);
    }
  };

  const handleToggleEliminateEntry = async (entryId: number) => {
    if (!raffleId || !canManage || entryBusyId != null) return;
    setEntryBusyId(entryId);
    try {
      await streamerApi(
        `/api/raffles/manage/${raffleId}/entries/${entryId}/toggle-eliminate`,
        { method: "POST", body: {} },
      );
      await loadDetail(undefined, true);
    } catch (err) {
      setActionMsg({ text: errorCode(err), error: true });
    } finally {
      setEntryBusyId(null);
    }
  };

  const handleRemoveEntry = async (entryId: number) => {
    if (!raffleId || !canManage || entryBusyId != null) return;
    setEntryBusyId(entryId);
    try {
      await streamerApi(`/api/raffles/manage/${raffleId}/entries/${entryId}`, {
        method: "DELETE",
      });
      await loadDetail(undefined, true);
    } catch (err) {
      setActionMsg({ text: errorCode(err), error: true });
    } finally {
      setEntryBusyId(null);
    }
  };

  const openParticipantOverlay = useCallback(
    (p: RaffleParticipant) => {
      if (!canManage) return;
      const fallbackWinner =
        !p.kick_user_id && p.partner_username === undefined
          ? winners.find((w) => w.name.toLowerCase() === p.name.toLowerCase())
          : undefined;
      setSelectedPlayer({
        displayName: p.name,
        avatarUrl: p.avatar_url || fallbackWinner?.avatar_url,
        ticketNo: p.ticket_no || fallbackWinner?.ticket_no,
        isWinner: p.is_winner || Boolean(fallbackWinner),
        isEliminated: Boolean(p.is_eliminated),
        kickUserId: p.kick_user_id || fallbackWinner?.kick_user_id,
        kickName: p.kick_name || fallbackWinner?.kick_name || p.name,
        partnerUsername:
          p.partner_username !== undefined
            ? p.partner_username
            : (fallbackWinner?.partner_username ?? null),
        isBanned: Boolean(p.is_banned ?? fallbackWinner?.is_banned),
        bannedUntil: p.banned_until ?? fallbackWinner?.banned_until ?? null,
      });
    },
    [canManage, winners],
  );

  const openWinnerOverlay = useCallback(
    (w: RaffleWinner) => {
      if (!canManage) return;
      setSelectedPlayer({
        displayName: w.name,
        avatarUrl: w.avatar_url,
        ticketNo: w.ticket_no,
        isWinner: true,
        isEliminated: false,
        kickUserId: w.kick_user_id,
        kickName: w.kick_name || w.name,
        partnerUsername: w.partner_username ?? null,
        isBanned: Boolean(w.is_banned),
        bannedUntil: w.banned_until ?? null,
      });
    },
    [canManage],
  );

  const filteredParticipants = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chronologicalParticipants;
    return chronologicalParticipants.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        `#${p.ticket_no}`.includes(q) ||
        (canManage && p.partner_username && p.partner_username.toLowerCase().includes(q)),
    );
  }, [chronologicalParticipants, search, canManage]);

  const handleListScroll = useCallback(() => {
    const listEl = listRef.current;
    if (!listEl || search.trim() !== "") return;
    if (
      flipAnimatingRef.current &&
      Math.abs(listEl.scrollTop - lastAutoScrollTopRef.current) < 4
    ) {
      return;
    }
    const lastChild = listEl.lastElementChild as HTMLElement | null;
    const contentHeight = lastChild
      ? lastChild.offsetTop + lastChild.offsetHeight
      : listEl.scrollHeight;
    pinnedBottomRef.current = contentHeight - listEl.scrollTop - listEl.clientHeight < 64;
  }, [search]);

  // Smooth bottom-up live feed FLIP: new regular card slides out from the bottom and pushes older cards upward
  useLayoutEffect(() => {
    const listEl = listRef.current;
    if (!listEl) {
      lastMountedListElRef.current = null;
      prevFromBottomRef.current.clear();
      handledStepGenRef.current = revealState.gen;
      flipAnimatingRef.current = false;
      return;
    }

    const isFreshMount = lastMountedListElRef.current !== listEl;
    lastMountedListElRef.current = listEl;
    if (isFreshMount) {
      pinnedBottomRef.current = true;
    }

    const isSearching = search.trim() !== "";
    const hasNewStep = revealState.gen !== handledStepGenRef.current;
    handledStepGenRef.current = revealState.gen;

    // Leave in-flight glide untouched if an unrelated re-render occurs mid-animation
    if (!hasNewStep && !isFreshMount && !isSearching && flipAnimatingRef.current) {
      return;
    }

    const children = listEl.children;
    const scanStart = Math.max(0, children.length - 32);
    const inFlightMap = new Map<number, { y: number; opacity: string | null }>();

    for (let i = scanStart; i < children.length; i += 1) {
      const el = children[i] as HTMLElement;
      const rawId = el.dataset.entryId;
      if (!rawId) continue;
      if (el.style.transform || el.style.opacity) {
        const cs = window.getComputedStyle(el);
        let y = 0;
        if (cs.transform && cs.transform !== "none") {
          try {
            y = new DOMMatrixReadOnly(cs.transform).m42;
          } catch {
            y = 0;
          }
        }
        const op = el.style.opacity && Number(cs.opacity) < 0.99 ? cs.opacity : null;
        inFlightMap.set(Number(rawId), { y, opacity: op });
        el.style.transition = "none";
        el.style.transform = "";
        el.style.opacity = "";
      }
    }

    if (isSearching) {
      window.clearTimeout(flipCleanupTimerRef.current);
      flipAnimatingRef.current = false;
      prevFromBottomRef.current.clear();
      return;
    }

    if (isFreshMount || pinnedBottomRef.current) {
      const lastChild = listEl.lastElementChild as HTMLElement | null;
      const contentHeight = lastChild
        ? lastChild.offsetTop + lastChild.offsetHeight
        : listEl.scrollHeight;
      const targetScroll = Math.max(0, contentHeight - listEl.clientHeight);
      listEl.scrollTop = targetScroll;
      lastAutoScrollTopRef.current = listEl.scrollTop;
      pinnedBottomRef.current = true;
    }

    const scrollTop = listEl.scrollTop;
    const clientHeight = listEl.clientHeight;
    const nextFromBottom = new Map<number, number>();
    for (let i = scanStart; i < children.length; i += 1) {
      const el = children[i] as HTMLElement;
      const rawId = el.dataset.entryId;
      if (!rawId) continue;
      nextFromBottom.set(Number(rawId), el.offsetTop - scrollTop - clientHeight);
    }

    const shouldAnimate =
      hasNewStep && !isFreshMount && !reduceMotion && pinnedBottomRef.current;

    if (shouldAnimate) {
      window.clearTimeout(flipCleanupTimerRef.current);
      const stepNewIds = new Set(revealState.stepIds);
      const maxPush = Math.max(84, Math.round(clientHeight * 0.85));

      const existingAnimated: Array<{
        el: HTMLElement;
        deltaY: number;
        opacity: string | null;
      }> = [];
      const newAnimated: HTMLElement[] = [];
      let carryDelta = 0;

      for (let i = scanStart; i < children.length; i += 1) {
        const el = children[i] as HTMLElement;
        const rawId = el.dataset.entryId;
        if (!rawId) continue;
        const entryId = Number(rawId);

        if (stepNewIds.has(entryId)) {
          newAnimated.push(el);
          continue;
        }

        const prevFB = prevFromBottomRef.current.get(entryId);
        const nextFB = nextFromBottom.get(entryId);
        if (prevFB === undefined || nextFB === undefined) continue;

        const inFlight = inFlightMap.get(entryId);
        const rawDelta = prevFB + (inFlight ? inFlight.y : 0) - nextFB;
        const clampedDelta = Math.max(-maxPush, Math.min(maxPush, rawDelta));

        if (Math.abs(clampedDelta) > 0.5) {
          existingAnimated.push({
            el,
            deltaY: clampedDelta,
            opacity: inFlight?.opacity ?? null,
          });
          if (clampedDelta > carryDelta) {
            carryDelta = clampedDelta;
          }
        }
      }

      let newDelta = carryDelta;
      if (newDelta <= 0 && newAnimated.length > 0) {
        const firstNew = newAnimated[0];
        const firstNewId = Number(firstNew.dataset.entryId);
        const firstNewFB = nextFromBottom.get(firstNewId) ?? -66;
        newDelta = Math.min(maxPush, Math.max(66, -firstNewFB + 8));
      }

      if (existingAnimated.length > 0 || newAnimated.length > 0) {
        const allNodes: HTMLElement[] = [];

        for (const item of existingAnimated) {
          item.el.style.transition = "none";
          item.el.style.transform = `translate3d(0, ${item.deltaY.toFixed(1)}px, 0)`;
          if (item.opacity !== null) {
            item.el.style.opacity = item.opacity;
          }
          allNodes.push(item.el);
        }

        for (const el of newAnimated) {
          el.style.transition = "none";
          el.style.transform = `translate3d(0, ${newDelta.toFixed(1)}px, 0)`;
          el.style.opacity = "0";
          allNodes.push(el);
        }

        void listEl.offsetHeight;

        const peakDelta = Math.max(carryDelta, newDelta);
        const durMs = Math.round(Math.min(460, 360 + Math.min(peakDelta, 250) * 0.28));
        const moveTrans = `transform ${durMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
        const enterTrans = `transform ${durMs}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${Math.min(210, Math.round(durMs * 0.55))}ms ease-out`;

        for (const item of existingAnimated) {
          item.el.style.transition = item.opacity !== null ? enterTrans : moveTrans;
          item.el.style.transform = "translate3d(0, 0, 0)";
          if (item.opacity !== null) {
            item.el.style.opacity = "";
          }
        }

        for (const el of newAnimated) {
          el.style.transition = enterTrans;
          el.style.transform = "translate3d(0, 0, 0)";
          el.style.opacity = "";
        }

        flipAnimatingRef.current = true;
        flipCleanupTimerRef.current = window.setTimeout(() => {
          flipAnimatingRef.current = false;
          for (const el of allNodes) {
            el.style.transition = "";
            el.style.transform = "";
            el.style.opacity = "";
          }
        }, durMs + 60);
      } else {
        flipAnimatingRef.current = false;
      }
    }

    prevFromBottomRef.current = nextFromBottom;
  }, [filteredParticipants, revealState.gen, revealState.stepIds, search]);

  const liveKickChannel = siteSettings.kick_channel?.trim() || site.kickChannel;
  const liveKickUrl = siteSettings.kick_url?.trim() || site.kickUrl;
  const timerLeft = !isManual && isOpen && endsAt > now ? countdown(endsAt - now) : "";
  const viewerNameLower = (account?.name || "").trim().toLowerCase();

  if (status === "notfound") {
    return (
      <section className="raffle-view raffle-view--state">
        <div className="raffle-view__state-card">
          <span className="raffle-view__kicker">Raffle not found</span>
          <h1 className="raffle-view__state-title">This raffle doesn't exist or was removed.</h1>
          <Link className="raffle-view__back-cta" to="/raffles/">
            <ArrowLeftSvg />
            <span>Back to all raffles</span>
          </Link>
        </div>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="raffle-view raffle-view--state">
        <div className="raffle-view__state-card">
          <span className="raffle-view__kicker">Connection issue</span>
          <h1 className="raffle-view__state-title">Couldn't load this raffle right now.</h1>
          <div className="raffle-view__state-actions">
            <button
              type="button"
              className="raffle-view__join-btn"
              onClick={() => void loadDetail(undefined, false)}
            >
              Retry
            </button>
            <Link className="raffle-view__back-cta" to="/raffles/">
              <ArrowLeftSvg />
              <span>Back to all raffles</span>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (status === "loading" || !raffle) {
    return (
      <section className="raffle-view" aria-busy="true">
        <div className="raffle-view__grid">
          <div className="raffle-view__participants raffle-view__skel-box skel" />
          <div className="raffle-view__stage">
            <div className="raffle-view__stream-wrap">
              <div className="raffle-view__player-skel skel" />
              <div className="raffle-view__modebar-skel skel" />
            </div>
            <div className="raffle-view__entry-skel skel" />
            <div className="raffle-view__prize-skel skel" />
          </div>
        </div>
      </section>
    );
  }

  const headlinePrize = raffle.prize?.trim() || raffle.title || "Stream Giveaway";
  const hasEliminationSpin =
    raffle.last_spin_kind === "elimination" && Boolean(raffle.last_eliminated);
  const showDrumExperience =
    !isOpen ||
    finishing ||
    hasEliminationSpin ||
    Boolean(raffle.winner) ||
    (spinMode === "elimination" && visibleParticipants.length > 0);
  const showDrumPanel = showDrumExperience && leftPanelMode === "auto";
  const hasUnseenSpin = Boolean(
    showDrumExperience &&
    (raffle.winner || hasEliminationSpin) &&
    !reduceMotion &&
    spinDurationMs > 0 &&
    drawSignature &&
    !isRaffleDrawSeen(drawSignature),
  );
  const isRevealingSpin =
    finishing ||
    needsExpiryFinalize ||
    drumPhase === "spinning" ||
    (showDrumPanel && hasUnseenSpin);
  const awaitingPostEndSpin = !isOpen && !raffle.winner && participants.length > 0;
  const showModebar = !canManage && (isOpen || isRevealingSpin || awaitingPostEndSpin);
  const isSpinningWinnerReveal =
    isRevealingSpin &&
    Boolean(raffle.winner) &&
    !(raffle.last_spin_kind === "elimination" && !raffle.winner);
  const displayedWinners =
    isSpinningWinnerReveal && winners.length > 0 ? winners.slice(0, -1) : winners;
  const settledWinnerNames = new Set(
    displayedWinners.map((w) => w.name.toLowerCase()),
  );

  return (
    <section className="raffle-view" aria-labelledby="raffle-detail-title">
      <h1 className="sr-only" id="raffle-detail-title">
        {raffle.title}
      </h1>

      <div className="raffle-view__grid">
        {/* ───────────── LEFT HALF: DRUM ROULETTE OR PARTICIPANTS ───────────── */}
        {showDrumPanel ? (
          <RaffleDrumRoulette
            raffleId={raffleId}
            winner={raffle.winner || null}
            spinMode={spinMode}
            spinKind={raffle.last_spin_kind || null}
            eliminatedTarget={raffle.last_eliminated || null}
            remainingCount={visibleActiveCount}
            spinSpeed={spinSpeed}
            spinDurationMs={spinDurationMs}
            participants={visibleParticipants}
            viewerNameLower={viewerNameLower}
            awaitingDraw={finishing || needsExpiryFinalize}
            spinTrigger={spinTrigger}
            drawSignature={drawSignature}
            enteringIds={drumEnteringIds}
            countBumpGen={countBumpGen}
            canEnter={canEnter}
            joined={joined}
            joining={joining}
            canManage={canManage}
            onJoin={() => void runParticipationFlow(false)}
            onSelectPlayer={openParticipantOverlay}
            onPhaseChange={setDrumPhase}
            onShowParticipants={() => {
              initialLoadedIdsRef.current.clear();
              setLeftPanelMode("participants");
            }}
          />
        ) : (
          <aside className="raffle-view__participants" aria-label="Raffle participants">
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
                <h2 className="raffle-view__p-title">Participants</h2>
                <span
                  className={`raffle-view__p-count${countBumpGen > 0
                    ? countBumpGen % 2 === 1
                      ? " is-bump-a"
                      : " is-bump-b"
                    : ""
                    }`}
                  data-participants-count
                >
                  {visibleEliminatedCount > 0
                    ? `${visibleActiveCount}/${visibleParticipants.length}`
                    : visibleParticipants.length}
                </span>
              </div>

              <div className="raffle-view__p-cta">
                {showDrumExperience && (
                  <button
                    type="button"
                    className="raffle-drum__ctrl-btn raffle-drum__ctrl-btn--accent"
                    onClick={() => setLeftPanelMode("auto")}
                    data-raffle-show-roulette
                  >
                    <span>← Roulette</span>
                  </button>
                )}
                {joined ? (
                  <span className="raffle-view__joined-pill" data-raffle-joined>
                    ✓ You're in
                  </span>
                ) : !canEnter ? (
                  <span className="raffle-view__closed-pill">
                    {entriesLocked && isOpen ? "Entries locked" : "Entries closed"}
                  </span>
                ) : (
                  <button
                    type="button"
                    className={`raffle-view__join-btn${joining ? " is-loading-shimmer" : ""}`}
                    data-raffle-detail-join={raffleId}
                    disabled={joining}
                    onClick={() => void runParticipationFlow(false)}
                  >
                    {joining ? "Joining…" : "Join raffle"}
                  </button>
                )}
              </div>
            </div>

            {visibleParticipants.length > 4 && (
              <div className="raffle-view__p-search">
                <SearchSvg />
                <input
                  type="search"
                  className="raffle-view__p-search-input"
                  placeholder="Search participant or ticket #…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            )}

            <div
              ref={listRef}
              className="raffle-view__p-list"
              onScroll={handleListScroll}
              data-searching={search.trim() ? "true" : undefined}
              data-participants-list
            >
              {visibleParticipants.length === 0 ? (
                <div className="raffle-view__p-empty">
                  <img
                    src="/img/deco/last-raffles/ticket.webp"
                    alt=""
                    width={72}
                    height={42}
                    className="raffle-view__p-empty-img"
                  />
                  <strong>No participants yet</strong>
                  <p>
                    {canEnter
                      ? "Open the participation link or click Join raffle to take ticket #1."
                      : isOpen
                        ? "Entries are locked while the streamer prepares the draw."
                        : "This raffle ended with zero entries."}
                  </p>
                </div>
              ) : filteredParticipants.length === 0 ? (
                <div className="raffle-view__p-empty">
                  <strong>No match for "{search}"</strong>
                  <p>Try another Kick username or ticket number.</p>
                </div>
              ) : (
                filteredParticipants.map((p, idx) => {
                  const avatar = safeAvatar(p.avatar_url);
                  const isYou =
                    Boolean(viewerNameLower) && p.name.toLowerCase() === viewerNameLower;
                  const showWinHighlight =
                    settledWinnerNames.has(p.name.toLowerCase()) ||
                    (p.is_winner && !isRevealingSpin);
                  const isElim = Boolean(p.is_eliminated) && !isRevealingSpin;
                  const fromBottom = filteredParticipants.length - 1 - idx;
                  const isInitialReveal =
                    initialLoadedIdsRef.current.has(p.id) &&
                    search.trim() === "" &&
                    fromBottom < 12;
                  const visibleCount = Math.min(filteredParticipants.length, 12);
                  const rowAnimStyle: CSSProperties | undefined = isInitialReveal
                    ? ({ "--p-i": Math.max(0, visibleCount - 1 - fromBottom) } as CSSProperties)
                    : undefined;
                  const isBannedRow = canManage && Boolean(p.is_banned);
                  const isTimedOutRow =
                    canManage &&
                    !isBannedRow &&
                    Boolean(p.banned_until && p.banned_until > now);
                  return (
                    <div
                      key={p.id}
                      data-entry-id={p.id}
                      data-participant-player={canManage ? p.name : undefined}
                      style={rowAnimStyle}
                      role={canManage ? "button" : undefined}
                      tabIndex={canManage ? 0 : undefined}
                      onClick={canManage ? () => openParticipantOverlay(p) : undefined}
                      onKeyDown={
                        canManage
                          ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openParticipantOverlay(p);
                            }
                          }
                          : undefined
                      }
                      className={`raffle-view__p-row${canManage ? " is-clickable" : ""}${showWinHighlight ? " is-winner" : ""}${isElim ? " is-eliminated" : ""}${isYou ? " is-you" : ""}${isInitialReveal ? " is-initial-reveal" : ""}`}
                    >
                      <div className="raffle-view__p-user">
                        {avatar ? (
                          <img
                            src={avatar}
                            alt=""
                            width={36}
                            height={36}
                            className="raffle-view__p-avatar"
                            loading="lazy"
                          />
                        ) : (
                          <span className="raffle-view__p-avatar raffle-view__p-avatar--ph">
                            {(p.name[0] || "K").toUpperCase()}
                          </span>
                        )}
                        <div className="raffle-view__p-meta">
                          <span className="raffle-view__p-name">
                            {p.name}
                            {isYou && <span className="raffle-view__p-tag">You</span>}
                            {showWinHighlight && (
                              <span className="raffle-view__p-tag raffle-view__p-tag--win">
                                Winner
                              </span>
                            )}
                            {isElim && (
                              <span className="raffle-view__p-tag raffle-view__p-tag--out">
                                Out
                              </span>
                            )}
                            {isBannedRow && (
                              <span className="raffle-view__p-tag raffle-view__p-tag--out">
                                Banned
                              </span>
                            )}
                            {isTimedOutRow && (
                              <span className="raffle-view__p-tag raffle-view__p-tag--out">
                                Timed out
                              </span>
                            )}
                          </span>
                          <span className="raffle-view__p-sub">
                            {isElim
                              ? `Eliminated${p.eliminated_order ? ` · #${p.eliminated_order}` : ""}`
                              : formatRelJoin(p.joined_at, now) || "Entered"}
                          </span>
                        </div>
                      </div>

                      <div className="raffle-view__p-end">
                        {canManage && (
                          <div
                            className="raffle-view__p-manage"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="raffle-view__p-mini-btn"
                              disabled={entryBusyId === p.id}
                              title={p.is_eliminated ? "Restore entrant" : "Eliminate entrant"}
                              onClick={() => void handleToggleEliminateEntry(p.id)}
                            >
                              {p.is_eliminated ? "Restore" : "Out"}
                            </button>
                            <button
                              type="button"
                              className="raffle-view__p-mini-btn raffle-view__p-mini-btn--del"
                              disabled={entryBusyId === p.id}
                              title="Remove entry"
                              onClick={() => void handleRemoveEntry(p.id)}
                            >
                              ×
                            </button>
                          </div>
                        )}
                        <span className="raffle-view__p-ticket">#{p.ticket_no}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}

        {/* ───────────── RIGHT HALF: STREAM (OR STREAMER PANEL) + WINNERS + PRIZE CARD ───────────── */}
        <div className="raffle-view__stage">
          {/* 1. Streamer Panel (for streamer/admin) or Stream Player (for viewers) */}
          <div className="raffle-view__stream-wrap">
            {canManage ? (
              <StreamerRaffleOverlay
                mode="detail"
                inline
                canManage={canManage}
                raffle={raffle}
                totalEntries={participants.length}
                activeEntries={activeParticipantsCount}
                eliminatedEntries={eliminatedParticipantsCount}
                drumPhase={drumPhase}
                spinning={finishing}
                onSpinStart={() => {
                  setFinishing(true);
                  setLeftPanelMode("auto");
                  setActionMsg(null);
                }}
                onSpinComplete={applySpinCompletion}
                onSpinError={(msg) => {
                  setFinishing(false);
                  setActionMsg({ text: msg, error: true });
                }}
                onRaffleMutated={async () => {
                  await loadDetail(undefined, true);
                }}
              />
            ) : (
              <KickStreamPlayer
                channel={liveKickChannel}
                kickUrl={liveKickUrl}
                className="raffle-view__player"
              />
            )}

            {/* Open Mode Bar beneath the stream player for viewers (hidden once completed or when Streamer Panel is active) */}
            {showModebar && (
              <div
                className={`raffle-view__modebar ${isRevealingSpin
                  ? "raffle-view__modebar--timer"
                  : awaitingPostEndSpin || isManual
                    ? "raffle-view__modebar--manual"
                    : "raffle-view__modebar--timer"
                  }`}
                data-raffle-modebar={
                  isRevealingSpin
                    ? "drawing"
                    : awaitingPostEndSpin
                      ? "awaiting-spin"
                      : isManual
                        ? "manual"
                        : "timer"
                }
              >
                <div className="raffle-view__modebar-info">
                  <span className="raffle-view__modebar-icon">
                    {isRevealingSpin || awaitingPostEndSpin || isManual ? (
                      <BoltSvg />
                    ) : (
                      <ClockSvg />
                    )}
                  </span>
                  <div className="raffle-view__modebar-copy">
                    {isRevealingSpin ? (
                      <>
                        <span className="raffle-view__modebar-kicker">
                          {spinMode === "elimination"
                            ? "Elimination spin live"
                            : "Drawing winner live"}
                        </span>
                        <strong className="raffle-view__modebar-text">
                          Spinning the participant drum…
                        </strong>
                      </>
                    ) : awaitingPostEndSpin ? (
                      <>
                        <span className="raffle-view__modebar-kicker">
                          Entries closed · Awaiting draw
                        </span>
                        <strong className="raffle-view__modebar-text">
                          Raffle ended — waiting for the streamer to spin the roulette
                        </strong>
                      </>
                    ) : spinMode === "elimination" ? (
                      <>
                        <span className="raffle-view__modebar-kicker">
                          Elimination roulette{entriesLocked ? " · Locked" : ""}
                        </span>
                        <strong className="raffle-view__modebar-text">
                          {eliminatedParticipantsCount > 0
                            ? `${activeParticipantsCount} active · ${eliminatedParticipantsCount} eliminated — last player standing wins`
                            : "Each spin knocks out a player until the last survivor wins"}
                        </strong>
                      </>
                    ) : isManual ? (
                      <>
                        <span className="raffle-view__modebar-kicker">
                          Manual stream draw{entriesLocked ? " · Entries locked" : ""}
                        </span>
                        <strong className="raffle-view__modebar-text">
                          Closes by button press — streamer ends the raffle live on stream
                        </strong>
                      </>
                    ) : (
                      <>
                        <span className="raffle-view__modebar-kicker">Countdown timer raffle</span>
                        <strong className="raffle-view__modebar-text">
                          Ends automatically when the timer hits zero
                        </strong>
                      </>
                    )}
                  </div>
                </div>

                <div className="raffle-view__modebar-right">
                  {isOpen && !isManual && endsAt > now && (
                    <time
                      className="raffle-view__countdown"
                      dateTime={endsAt ? new Date(endsAt).toISOString() : ""}
                    >
                      {timerLeft || "Ending…"}
                    </time>
                  )}

                  {awaitingPostEndSpin ? (
                    <span className="raffle-view__modebar-pill">Ready to spin</span>
                  ) : (
                    isOpen &&
                    isManual && (
                      <span className="raffle-view__modebar-pill">
                        {spinMode === "elimination" ? "Elimination live" : "Live button draw"}
                      </span>
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          {actionMsg && actionMsg.error && (
            <p className="raffle-view__inline-alert is-error" role="alert">
              {actionMsg.text}
            </p>
          )}

          {/* 2. Winners Window (accumulates all winners drawn in this raffle + Reset) */}
          <section
            className="raffle-view__winners-box"
            aria-label="Raffle winners"
            data-raffle-winners-box
          >
            <header className="raffle-view__winners-head">
              <div className="raffle-view__winners-title-wrap">
                <span className="raffle-view__winners-icon" aria-hidden="true">
                  <TrophySvg />
                </span>
                <h2 className="raffle-view__winners-title">Winners</h2>
                {displayedWinners.length > 0 && (
                  <span className="raffle-view__winners-badge" data-raffle-winners-count>
                    {displayedWinners.length}
                  </span>
                )}
              </div>

              {canManage && (
                <button
                  type="button"
                  className="raffle-view__winners-reset"
                  data-raffle-winners-reset
                  disabled={
                    winners.length === 0 ||
                    resettingWinners ||
                    finishing ||
                    drumPhase === "spinning"
                  }
                  onClick={() => void handleResetWinners()}
                >
                  {resettingWinners ? "Resetting…" : "Reset"}
                </button>
              )}
            </header>

            <div className="raffle-view__winners-list" data-raffle-winners-list>
              {displayedWinners.length === 0 ? (
                <div className="raffle-view__winners-empty">
                  {isSpinningWinnerReveal
                    ? "Spinning drum for winner…"
                    : "No winners drawn yet"}
                </div>
              ) : (
                displayedWinners.map((w, idx) => {
                  const avatar = safeAvatar(w.avatar_url);
                  const isYou =
                    Boolean(viewerNameLower) && w.name.toLowerCase() === viewerNameLower;
                  const isBannedWinner = canManage && Boolean(w.is_banned);
                  const isTimedOutWinner =
                    canManage &&
                    !isBannedWinner &&
                    Boolean(w.banned_until && w.banned_until > now);
                  return (
                    <div
                      key={`${w.id}-${idx}`}
                      className={`raffle-view__winner-row${isYou ? " is-you" : ""}${canManage ? " is-clickable" : ""
                        }`}
                      data-raffle-winner-item={w.order}
                      data-winner-player={canManage ? w.name : undefined}
                      role={canManage ? "button" : undefined}
                      tabIndex={canManage ? 0 : undefined}
                      onClick={canManage ? () => openWinnerOverlay(w) : undefined}
                      onKeyDown={
                        canManage
                          ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openWinnerOverlay(w);
                            }
                          }
                          : undefined
                      }
                    >
                      <div className="raffle-view__winner-user">
                        <span className="raffle-view__winner-rank">#{w.order}</span>
                        {avatar ? (
                          <img
                            src={avatar}
                            alt=""
                            width={32}
                            height={32}
                            className="raffle-view__winner-avatar"
                            loading="lazy"
                          />
                        ) : (
                          <span className="raffle-view__winner-avatar raffle-view__p-avatar--ph">
                            {(w.name[0] || "K").toUpperCase()}
                          </span>
                        )}
                        <span className="raffle-view__winner-name">
                          <span className="raffle-view__winner-handle">{w.name}</span>
                          {isYou && <span className="raffle-view__p-tag">You</span>}
                          {isBannedWinner && (
                            <span className="raffle-view__p-tag raffle-view__p-tag--out">
                              Banned
                            </span>
                          )}
                          {isTimedOutWinner && (
                            <span className="raffle-view__p-tag raffle-view__p-tag--out">
                              Timed out
                            </span>
                          )}
                        </span>
                      </div>
                      {w.ticket_no ? (
                        <span className="raffle-view__p-ticket">#{w.ticket_no}</span>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* 3. Participation Link */}
          <div className="raffle-view__entry-wrap">
            <div className="raffle-view__entry-box" data-raffle-entry-box>
              <div className="raffle-view__entry-main">
                <span className="raffle-view__entry-icon" aria-hidden="true">
                  <LinkChainSvg />
                </span>
                <div className="raffle-view__entry-copy">
                  <span className="raffle-view__entry-label">Participation link</span>
                  <a
                    href={entryPath}
                    className="raffle-view__entry-url"
                    data-raffle-entry-link
                    onClick={handleEntryLinkClick}
                  >
                    {entryFullUrl}
                  </a>
                </div>
              </div>
              <button
                type="button"
                className={`raffle-view__entry-copy-btn${entryCopied ? " is-copied" : ""}`}
                data-raffle-copy-link
                onClick={() => void copyEntryUrl()}
              >
                <CopyMiniSvg />
                <span>{entryCopied ? "Copied!" : "Copy"}</span>
              </button>
            </div>

            {joinError && (
              <p className="raffle-view__inline-alert is-error" role="alert">
                {joinError}
              </p>
            )}
          </div>

          {/* 4. Prize Card */}
          <RafflePrizeCard headlinePrize={headlinePrize} />
        </div>
      </div>

      {canManage && selectedPlayer && (
        <RafflePlayerOverlay
          player={selectedPlayer}
          raffleId={raffleId}
          partnerName={siteSettings.partner_name}
          onClose={() => setSelectedPlayer(null)}
          onPlayerUpdated={setSelectedPlayer}
          onModerated={() => void loadDetail(undefined, true)}
        />
      )}
    </section>
  );
}
