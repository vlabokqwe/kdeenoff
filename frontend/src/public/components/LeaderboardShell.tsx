import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { partnerCode, site } from "../../shared/site";
import { useCopy } from "../hooks/useCopy";
import { useImgReady } from "../hooks/useMediaReady";
import { useNow } from "../hooks/useNow";
import { ApiError, getJson } from "../lib/api";
import {
  boardCadence,
  boardHref,
  defaultSiteSettings,
  dhms,
  fetchBoards,
  fetchSiteSettings,
  money,
  moneyShort,
  partnerLabel,
  partnerTheme,
  slugFromPath,
} from "../lib/boards";
import { reduceMotion } from "../lib/format";
import type { Board, BoardDetail, BoardPlayer, SiteSettings } from "../lib/types";
import { NotFoundPage } from "../pages/NotFoundPage";
import { useSession } from "../state/session";
import { useUi } from "../state/ui";

const EMPTY_COPY = "No players yet — be the first on the board!";
const ERROR_COPY = "Could not load this leaderboard. Refresh the page.";
const PODIUM_RANKS = [2, 1, 3] as const;

const ZEUS_PODIUM_BADGE: Record<1 | 2 | 3, string> = {
  1: "1ST",
  2: "2ND",
  3: "3RD",
};

const ZEUS_REEL_GLYPHS = ["π", "δ", "α", "φ"] as const;
const ZEUS_MASCOT_POSTER = "/img/partners/zeus-raccoon.webp?v=5";
const ZEUS_MASCOT_VIDEO = "/img/partners/zeus-raccoon.webm?v=5";

function ZeusPartnerMascot() {
  const mascotImg = useImgReady(ZEUS_MASCOT_POSTER);
  const mascotRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    const root = mascotRef.current;
    if (!video || !root) return;
    if (reduceMotion) {
      video.pause();
      return;
    }
    const mark = () => root.classList.add("is-playing");
    video.muted = true;
    video.preload = "auto";
    video.addEventListener("playing", mark);
    const start = () => {
      void video.play().then(mark).catch(() => { });
    };
    if (video.readyState >= 2) start();
    else video.addEventListener("loadeddata", start, { once: true });
    video.load();
    return () => {
      video.removeEventListener("playing", mark);
      video.removeEventListener("loadeddata", start);
    };
  }, []);

  return (
    <div ref={mascotRef} className="zeus-partner-card__mascot" aria-hidden="true">
      <img
        ref={mascotImg.ref}
        className={!mascotImg.ready ? "is-media-pending" : undefined}
        src={ZEUS_MASCOT_POSTER}
        alt=""
        width={930}
        height={960}
        decoding="async"
        onLoad={mascotImg.onLoad}
        onError={mascotImg.onError}
      />
      {!reduceMotion && (
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="none"
          poster={ZEUS_MASCOT_POSTER}
          src={ZEUS_MASCOT_VIDEO}
        />
      )}
    </div>
  );
}

function ZeusBoltIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 28 38"
      aria-hidden="true"
      focusable="false"
    >
      <polygon
        points="17,2 3,21 13,21 9,36 25,16 15,16"
        fill="#ffd629"
        stroke="#241007"
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      <polygon points="15.8,5.5 6.8,19 13.4,19 15.2,13.5" fill="#fff699" />
    </svg>
  );
}

function ZeusLaurelSprig({
  className,
  mirrored = false,
  tone = "gold",
}: {
  className?: string;
  mirrored?: boolean;
  tone?: "gold" | "silver" | "bronze";
}) {
  const fill =
    tone === "silver"
      ? { main: "#dfe8f4", hi: "#ffffff" }
      : tone === "bronze"
        ? { main: "#ea9550", hi: "#ffe1c0" }
        : { main: "#ffd218", hi: "#fff68f" };

  return (
    <svg
      className={className}
      viewBox="0 0 44 38"
      aria-hidden="true"
      focusable="false"
    >
      <g transform={mirrored ? "translate(44, 0) scale(-1, 1)" : undefined}>
        <path
          d="M36,33 C24,29 14,20 8,7"
          fill="none"
          stroke="#1b0c06"
          strokeWidth={2.8}
          strokeLinecap="round"
        />
        {[
          { x: 28, y: 28, r: -48, s: 0.92 },
          { x: 19, y: 21, r: -28, s: 1 },
          { x: 12, y: 12, r: -8, s: 0.94 },
          { x: 28, y: 18, r: 16, s: 0.86 },
        ].map((leaf, idx) => (
          <g
            key={idx}
            transform={`translate(${leaf.x}, ${leaf.y}) rotate(${leaf.r}) scale(${leaf.s})`}
          >
            <path
              d="M0,-9.5 C5.4,-5.5 5.4,4 0,8.8 C-5.4,4 -5.4,-5.5 0,-9.5 Z"
              fill={fill.main}
              stroke="#1b0c06"
              strokeWidth={2.2}
              strokeLinejoin="round"
            />
            <path
              d="M-0.4,-7.2 C2.5,-4 2.5,2.4 -0.4,6.2 C-2,2.4 -2,-4 -0.4,-7.2 Z"
              fill={fill.hi}
            />
          </g>
        ))}
      </g>
    </svg>
  );
}

function ZeusSlotMarquee({
  label,
  tone = "gold",
  withBolts = false,
}: {
  label: string;
  tone?: "gold" | "silver" | "bronze";
  withBolts?: boolean;
}) {
  return (
    <div className={`zeus-marquee zeus-marquee--${tone}`} aria-hidden="true">
      <ZeusLaurelSprig className="zeus-marquee__sprig zeus-marquee__sprig--l" tone={tone} />
      {withBolts && <ZeusBoltIcon className="zeus-marquee__bolt zeus-marquee__bolt--l" />}
      <span className="zeus-marquee__word">
        <span className="zeus-marquee__word-stroke" aria-hidden="true">
          {label}
        </span>
        <span className="zeus-marquee__word-fill">{label}</span>
      </span>
      {withBolts && <ZeusBoltIcon className="zeus-marquee__bolt zeus-marquee__bolt--r" />}
      <ZeusLaurelSprig
        className="zeus-marquee__sprig zeus-marquee__sprig--r"
        mirrored
        tone={tone}
      />
    </div>
  );
}

function ZeusAvatarFallback() {
  return (
    <svg
      className="podium__avatar-fallback"
      viewBox="0 0 128 128"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="64" cy="64" r="61" fill="#6b2e2b" stroke="#2c1208" strokeWidth={4.5} />
      <circle cx="64" cy="64" r="50" fill="#461b1d" stroke="#b98252" strokeWidth={2.8} />
      <path
        d="M40,54 C40,34 88,34 88,54 L91,84 L75,94 L70,69 L58,69 L53,94 L37,84 Z"
        fill="#f0c781"
        stroke="#2c1208"
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <path d="M48,55 H80 L75,64 H53 Z" fill="#2a0d0e" />
    </svg>
  );
}

const SKEL_ROW_NAME_WIDTHS = ["58%", "44%", "66%", "50%", "39%"] as const;

function PodiumDecoImg({ rank }: { rank: 1 | 2 | 3 }) {
  const src = `/img/lb/place-${rank}.webp`;
  const img = useImgReady(src);
  return (
    <div className="podium__art" aria-hidden="true">
      {!img.ready && <i className="podium__art-skel skel" aria-hidden="true" />}
      <img
        ref={img.ref}
        className={`podium__deco${!img.ready ? " is-media-pending" : ""}`}
        src={src}
        alt=""
        width={320}
        height={240}
        loading="lazy"
        onLoad={img.onLoad}
        onError={img.onError}
      />
    </div>
  );
}

function BoardAvatarImg({
  src,
  className,
  size,
  lazy = false,
  dataPodium = false,
  onBroken,
}: {
  src: string;
  className: string;
  size: number;
  lazy?: boolean;
  dataPodium?: boolean;
  onBroken?: (url: string) => void;
}) {
  const img = useImgReady(src);
  return (
    <>
      {!img.ready && <i className="lb-avatar-skel skel" aria-hidden="true" />}
      <img
        ref={img.ref}
        className={`${className}${!img.ready ? " is-media-pending" : ""}`}
        data-podium-avatar={dataPodium ? "" : undefined}
        src={src}
        alt=""
        width={size}
        height={size}
        loading={lazy ? "lazy" : undefined}
        decoding="async"
        onLoad={img.onLoad}
        onError={() => {
          img.onError();
          onBroken?.(src);
        }}
      />
    </>
  );
}

function ZeusCorniceCap({
  mirrored = false,
  wide = false,
}: {
  mirrored?: boolean;
  wide?: boolean;
}) {
  return (
    <svg
      className={`zeus-lintel__cap ${mirrored ? "zeus-lintel__cap--r" : "zeus-lintel__cap--l"}`}
      viewBox="0 0 52 50"
      aria-hidden="true"
      focusable="false"
    >
      <g transform={mirrored ? "translate(52, 0) scale(-1, 1)" : undefined}>
        {/* Weathered sandstone blocks atop the temple roof (like in Le Zeus slot) */}
        <g className="zeus-lintel__stones">
          {!mirrored && wide && (
            <polygon
              points="23,9.5 25.5,4.8 32,4.8 33.8,9.5"
              fill="#e9bc7b"
              stroke="#4e2410"
              strokeWidth={2.2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <polygon
            points={mirrored ? "33,9.5 37,2.2 48.5,2.2 50.8,9.5" : "35,9.5 38,2 49.5,2 51.5,9.5"}
            fill="#f1ca89"
            stroke="#4e2410"
            strokeWidth={2.3}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <polygon
            points={mirrored ? "44.5,2.8 48,2.8 50,8.9 46,8.9" : "46,2.8 49,2.8 50.8,8.9 47.2,8.9"}
            fill="#cb8644"
          />
        </g>

        {/* Recessed terracotta-bronze architrave necking above the burgundy slot grid */}
        <path d="M35,20.5 H52 V41.5 H35 Z" fill="#8b4922" />
        <path d="M35,20.5 H52 V28 H35 Z" fill="#b86c33" />
        <path d="M35,36.5 H52 V41.5 H35 Z" fill="#632f14" />
        <line
          x1="35"
          y1="41.5"
          x2="52"
          y2="41.5"
          stroke="#4e2410"
          strokeWidth={2.4}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1="35"
          y1="28.2"
          x2="52"
          y2="28.2"
          stroke="#4e2410"
          strokeWidth={1.8}
          vectorEffect="non-scaling-stroke"
        />

        {/* Moulded Ionic capital collar (echinus) landing squarely atop the Greek-key column */}
        <rect
          x="16.5"
          y="40.5"
          width="23.5"
          height="7.5"
          rx="2.4"
          fill="#ecd09d"
          stroke="#4e2410"
          strokeWidth={2.3}
          vectorEffect="non-scaling-stroke"
        />
        <rect x="18" y="41.6" width="20.5" height="2.4" rx="1" fill="#fdf2d6" />

        {/* Rolled Ionic Volute Scroll tucked directly beneath the overhanging cornice */}
        <path
          d="M39,20.5 H16 C8.2,20.5 3.5,25.6 3.5,32.8 C3.5,40.2 9,45.2 16.2,45.2 C22.5,45.2 26.8,40.8 26.8,34.8 C26.8,33.2 27.6,32.5 39,32.5 Z"
          fill="#efc585"
        />
        <path
          d="M5.2,36.8 C7.5,42 11.8,44.4 16.4,44.4 C21.8,44.4 25.5,40.8 26.2,35.4 C24.4,39.8 20.8,41.8 16.2,41.8 C11.5,41.8 7.6,39.8 5.2,36.8 Z"
          fill="#cb8644"
        />
        <path
          d="M38.5,20.5 V31.5 H26.6"
          fill="none"
          stroke="#c98545"
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M27,31.5 H39 V20.5"
          fill="none"
          stroke="#4e2410"
          strokeWidth={2.3}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M16,20.5 C8.2,20.5 3.5,25.6 3.5,32.8 C3.5,40.2 9,45.2 16.2,45.2 C22.4,45.2 26.6,40.6 26.6,34.4 C26.6,28.5 22.4,24.6 16.8,24.6 C12,24.6 8.8,28 8.8,32.6 C8.8,36.6 11.8,39.4 15.8,39.4 C18.8,39.4 20.8,37.3 20.8,34.5 C20.8,32.2 19,30.6 16.6,30.6 C14.8,30.6 13.6,31.8 13.6,33.4"
          fill="none"
          stroke="#4e2410"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Full-width overhanging flat sandstone cornice slab on top */}
        <path
          d="M52,9.5 H4.5 C2.8,9.5 1.8,10.6 1.8,12.2 V18 C1.8,19.5 2.8,20.5 4.5,20.5 H52 Z"
          fill="#efc483"
        />
        <path d="M3,10.5 H52 V14.2 H3 Z" fill="#fdf1d4" />
        <path d="M2.6,17.2 H52 V20.2 H2.6 Z" fill="#cb8544" />
        <path
          d="M52,9.5 H4.5 C2.8,9.5 1.8,10.6 1.8,12.2 V18 C1.8,19.5 2.8,20.5 4.5,20.5 H52"
          fill="none"
          stroke="#4e2410"
          strokeWidth={2.4}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Tiny cartoon weathered stone notch */}
        <path
          d="M14,9.8 L15.6,13 L17.2,9.8"
          fill="#cb8544"
          stroke="#4e2410"
          strokeWidth={1.6}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </svg>
  );
}

function ZeusArchitrave({ wide = false }: { wide?: boolean }) {
  return (
    <div className={`zeus-lintel${wide ? " zeus-lintel--wide" : ""}`} aria-hidden="true">
      <ZeusCorniceCap wide={wide} />
      <svg
        className="zeus-lintel__span"
        viewBox="0 0 100 50"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        {/* Recessed terracotta-bronze frieze spanning above the burgundy reels */}
        <rect x="0" y="20.5" width="100" height="21" fill="#8b4922" />
        <rect x="0" y="20.5" width="100" height="7.7" fill="#b86c33" />
        <rect x="0" y="36.5" width="100" height="5" fill="#632f14" />
        {/* Overhanging flat sandstone cornice slab */}
        <rect x="0" y="9.5" width="100" height="11" fill="#efc483" />
        <rect x="0" y="10.5" width="100" height="3.7" fill="#fdf1d4" />
        <rect x="0" y="17.2" width="100" height="3" fill="#cb8544" />
        <line
          x1="0"
          y1="9.5"
          x2="100"
          y2="9.5"
          stroke="#4e2410"
          strokeWidth={2.4}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1="0"
          y1="20.5"
          x2="100"
          y2="20.5"
          stroke="#4e2410"
          strokeWidth={2.4}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1="0"
          y1="28.2"
          x2="100"
          y2="28.2"
          stroke="#4e2410"
          strokeWidth={1.8}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1="0"
          y1="41.5"
          x2="100"
          y2="41.5"
          stroke="#4e2410"
          strokeWidth={2.4}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <ZeusCorniceCap mirrored wide={wide} />
    </div>
  );
}

export interface LeaderboardShellProps {
  slug?: string;
  switcher?: boolean;
  collapse?: boolean;
  homeOnly?: boolean;
  heading?: "h1" | "h2";
  plain?: boolean;
  podiumArt?: boolean;
  zeusTheme?: boolean;
  onNotFoundChange?: (notFound: boolean) => void;
}

export function LeaderboardShell({
  slug = "",
  switcher = false,
  collapse = false,
  homeOnly = false,
  heading: Heading = "h2",
  plain = false,
  podiumArt = false,
  zeusTheme = false,
  onNotFoundChange,
}: LeaderboardShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const now = useNow();
  const { dataRev } = useUi();
  const { accountRev } = useSession();

  const [boards, setBoards] = useState<Board[]>([]);
  const [boardsLoaded, setBoardsLoaded] = useState(false);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(() => defaultSiteSettings());
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [detail, setDetail] = useState<BoardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [brokenAvatars, setBrokenAvatars] = useState<Record<string, true>>({});

  const visibleBoards = useMemo(
    () => (homeOnly ? boards.filter((b) => b.show_on_home !== 0) : boards),
    [boards, homeOnly],
  );

  const explicitSlug = slug.trim();
  const pathSlug = slugFromPath(location.pathname) || "";
  const validSelectedSlug =
    selectedSlug && (!homeOnly || visibleBoards.some((b) => b.slug === selectedSlug))
      ? selectedSlug
      : "";
  const activeSlug =
    validSelectedSlug || explicitSlug || pathSlug || visibleBoards[0]?.slug || "";

  useEffect(() => {
    setSelectedSlug("");
  }, [explicitSlug, pathSlug]);

  useEffect(() => {
    let alive = true;
    fetchBoards().then((list) => {
      if (!alive) return;
      setBoards(list);
      setBoardsLoaded(true);
    });
    fetchSiteSettings().then((settings) => {
      if (alive) setSiteSettings(settings);
    });
    return () => {
      alive = false;
    };
  }, [dataRev]);

  useEffect(() => {
    if (!boardsLoaded && !explicitSlug && !pathSlug) return;
    if (!activeSlug) {
      setDetail({ players: [] });
      setLoading(false);
      setError(false);
      setNotFound(false);
      onNotFoundChange?.(false);
      return;
    }

    const ctrl = new AbortController();
    setLoading(true);
    setError(false);
    setNotFound(false);
    onNotFoundChange?.(false);

    getJson<BoardDetail>(`/api/leaderboards/${encodeURIComponent(activeSlug)}`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then((data) => {
        if (!data.board) throw new ApiError("missing", {}, 404);
        setDetail(data);
        setLoading(false);
        setError(false);
        setNotFound(false);
        onNotFoundChange?.(false);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        const is404 = err instanceof ApiError && err.status === 404;
        setDetail(null);
        setLoading(false);
        setError(true);
        setNotFound(is404);
        onNotFoundChange?.(is404);
      });

    return () => ctrl.abort();
  }, [activeSlug, boardsLoaded, explicitSlug, pathSlug, dataRev, onNotFoundChange]);

  useEffect(() => {
    if (!accountRev || !activeSlug) return;
    const ctrl = new AbortController();
    getJson<BoardDetail>(`/api/leaderboards/${encodeURIComponent(activeSlug)}`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then((data) => {
        if (!ctrl.signal.aborted && data.board) {
          setDetail(data);
        }
      })
      .catch(() => {
        /* keep current board state */
      });
    return () => ctrl.abort();
  }, [accountRev, activeSlug]);

  const board = detail?.board;
  const avatarsDisabled = String(board?.avatar_style || "").trim().toLowerCase() === "none";
  const players: BoardPlayer[] = detail?.players
    ? [...detail.players].sort((a, b) => (Number(a.rank) || 0) - (Number(b.rank) || 0))
    : [];
  const listed = players.filter((player) => !player.empty_spot);
  const zeusOtherRows: BoardPlayer[] = (() => {
    if (!zeusTheme) return [];
    const byRank = new Map<number, BoardPlayer>();
    const unranked: BoardPlayer[] = [];
    players.forEach((player, idx) => {
      const r = Number(player.rank) || idx + 1;
      if (r <= 3) return;
      if (!player.empty_spot) {
        if (Number(player.rank) >= 1) byRank.set(Number(player.rank), player);
        else unranked.push(player);
      } else if (Number(player.prize_cents) > 0 && !byRank.has(r)) {
        byRank.set(r, player);
      }
    });
    for (const s of detail?.spots || []) {
      const r = Number(s.rank);
      if (r > 3 && !Number(s.hidden) && Number(s.prize_cents) > 0 && !byRank.has(r)) {
        byRank.set(r, {
          rank: r,
          username: "—",
          wagered_cents: 0,
          prize_cents: s.prize_cents,
          empty_spot: 1,
        });
      }
    }
    return [
      ...[...byRank.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row),
      ...unranked,
    ];
  })();
  const tablePlayers = zeusTheme
    ? collapse
      ? zeusOtherRows.slice(0, 7)
      : zeusOtherRows
    : listed;
  const isBoardLoading = loading && !error;
  const showSkeleton = isBoardLoading;
  const hasRows =
    !error &&
    (showSkeleton || (detail !== null && (listed.length > 0 || tablePlayers.length > 0)));
  const markBrokenAvatar = (url: string) => {
    setBrokenAvatars((prev) => (prev[url] ? prev : { ...prev, [url]: true }));
  };

  const defaultPartner = site.partners[0];
  const liveSitePromoCode =
    siteSettings.promo_code?.trim() ||
    (defaultPartner ? partnerCode(defaultPartner) : site.promoCode);
  const promoCode = board?.promo_code?.trim() || liveSitePromoCode;
  const { copied, copy } = useCopy(promoCode);

  const theme = board ? partnerTheme(board.partner) : "stake";
  const partnerCtaLabel = board
    ? partnerLabel(board.partner)
    : partnerLabel(siteSettings.partner_name || defaultPartner?.name);
  const partnerRawKey = String(board?.partner || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const is500Partner =
    !partnerRawKey ||
    partnerRawKey === "stake" ||
    partnerRawKey === "500" ||
    partnerRawKey === "500casino";
  const signupHref =
    board?.partner_signup_url ||
    siteSettings.partner_signup_url ||
    defaultPartner?.url ||
    "#";
  const poolShort = board ? moneyShort(board.prize_pool_cents) : "$—";

  const zeusCardBg = useImgReady(
    zeusTheme && !collapse ? "/img/partners/zeus-card-bg.webp" : undefined,
  );
  const zeusWordmark = useImgReady(
    zeusTheme && !collapse && is500Partner ? "/img/partners/500-wordmark-zeus.webp" : undefined,
  );

  useEffect(() => {
    if (!pathSlug || !board?.title) return;
    document.title = `${board.title} — ${site.title}`;
    return () => {
      document.title = site.title;
    };
  }, [pathSlug, board?.title]);

  if (!collapse && pathSlug && notFound) {
    return <NotFoundPage />;
  }

  const parts = board ? dhms(Number(board.ends_at) - now) : null;
  const isEnded = Boolean(!isBoardLoading && board && !parts);
  const cd = parts || { d: "00", h: "00", m: "00", s: "00" };

  let emptyMessage = "";
  let showEmpty = false;
  if (error) {
    emptyMessage = ERROR_COPY;
    showEmpty = true;
  } else if (
    !isBoardLoading &&
    detail !== null &&
    !listed.length &&
    !players.length &&
    !tablePlayers.length
  ) {
    emptyMessage = EMPTY_COPY;
    showEmpty = true;
  }

  const rootClasses = [
    "lb",
    zeusTheme ? "lb--zeus" : "",
    loading ? "is-loading" : "",
    hasRows ? "has-rows" : "",
    collapse ? "is-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const hideZeusTable = zeusTheme && !showSkeleton && !showEmpty && tablePlayers.length === 0;

  const tableRowsMarkup = (
    <>
      <div className="lb-row lb-row--head" aria-hidden="true">
        <span>Place</span>
        <span>{zeusTheme ? "Player" : "User"}</span>
        <span>Wagered</span>
        <span>Prize</span>
      </div>
      <ol className="lb__rows" data-lb-rows>
        {showSkeleton
          ? SKEL_ROW_NAME_WIDTHS.map((nameW, i) => (
            <li key={i} className="lb-row lb-row--skeleton" aria-hidden="true">
              <span className="lb-row__rank">
                <i className="lb-row__skel-rank skel" />
              </span>
              <span className="lb-row__user">
                <i className="lb-row__skel-avatar skel" />
                <i className="lb-row__skel-name skel" style={{ width: nameW }} />
              </span>
              <span className="lb-row__wager">
                <i className="lb-row__skel-num skel" />
              </span>
              <span className="lb-row__prize">
                <i className="lb-row__skel-prize skel" />
              </span>
            </li>
          ))
          : tablePlayers.map((player, index) => {
            const empty = Boolean(player.empty_spot);
            const hasPrize = Number(player.prize_cents) > 0;
            const name = empty ? "—" : player.display_name || player.username || "—";
            const wager = empty ? "—" : money(player.wagered_cents);
            const prize = hasPrize ? money(player.prize_cents) : "—";
            const rank = player.rank || (zeusTheme ? index + 4 : index + 1);
            const rawAvatar = !empty && !avatarsDisabled ? player.avatar_url || "" : "";
            const validRowAvatar = rawAvatar && !brokenAvatars[rawAvatar] ? rawAvatar : "";

            return (
              <li
                key={`${rank}-${index}`}
                className={`lb-row${empty ? " is-empty" : ""}`}
                data-rank={rank}
                data-has-prize={hasPrize ? "" : undefined}
                style={{ "--i": index } as CSSProperties}
              >
                <span className="lb-row__rank">
                  {zeusTheme && (
                    <span className="lb-row__glyph" aria-hidden="true">
                      {ZEUS_REEL_GLYPHS[index % ZEUS_REEL_GLYPHS.length]}
                    </span>
                  )}
                  <span className="lb-row__rank-badge">{rank}</span>
                </span>
                <span className="lb-row__user">
                  {zeusTheme ? (
                    !empty &&
                    !avatarsDisabled && (
                      <span className="lb-row__avatar-frame" aria-hidden="true">
                        {validRowAvatar ? (
                          <BoardAvatarImg
                            src={validRowAvatar}
                            className="lb-row__avatar"
                            size={36}
                            lazy
                            onBroken={markBrokenAvatar}
                          />
                        ) : (
                          <ZeusAvatarFallback />
                        )}
                      </span>
                    )
                  ) : (
                    !empty &&
                    !avatarsDisabled &&
                    validRowAvatar && (
                      <span className="lb-row__avatar-wrap" aria-hidden="true">
                        <BoardAvatarImg
                          src={validRowAvatar}
                          className="lb-row__avatar"
                          size={36}
                          lazy
                          onBroken={markBrokenAvatar}
                        />
                      </span>
                    )
                  )}
                  <span className="lb-row__name">{name}</span>
                </span>
                <span className="lb-row__wager">
                  {zeusTheme ? <span className="lb-row__hud-pill">{wager}</span> : wager}
                </span>
                <span className="lb-row__prize">
                  <span className="lb-row__prize-val">{prize}</span>
                </span>
              </li>
            );
          })}
      </ol>
      <p className="lb__empty" data-lb-empty hidden={!showEmpty}>
        {emptyMessage || EMPTY_COPY}
      </p>
    </>
  );

  return (
    <div
      className={rootClasses}
      data-leaderboard-shell
      data-lb-slug={slug}
      data-lb-switcher={switcher ? "" : undefined}
      data-lb-collapse={collapse ? "" : undefined}
      data-partner={theme}
    >
      <header className="lb__intro section-head">
        <Heading className="title">
          <span className="accent" data-lb-pool-short>
            {isBoardLoading ? (
              <i className="lb__pool-skel skel" aria-hidden="true" />
            ) : (
              poolShort
            )}
          </span>{" "}
          Leaderboard
        </Heading>
        {!collapse && (
          <p className="lead lb__subtitle-spacer" data-lb-subtitle aria-hidden="true" />
        )}
        <div className="lb__controls">
          <div
            className="seg"
            data-lb-tabs
            role="tablist"
            aria-label="Choose leaderboard"
            hidden={!switcher || visibleBoards.length < 2}
          >
            {switcher &&
              visibleBoards.length >= 2 &&
              visibleBoards.map((b) => {
                const selected = b.slug === activeSlug;
                const label = b.title || boardCadence(b);
                return (
                  <button
                    key={b.slug}
                    type="button"
                    className="seg__btn"
                    role="tab"
                    id={`lb-tab-${b.slug}`}
                    aria-selected={selected}
                    data-lb-tab={b.slug}
                    onClick={() => {
                      if (selected) return;
                      if (pathSlug) {
                        navigate(boardHref(b.slug));
                      } else {
                        setSelectedSlug(b.slug);
                      }
                    }}
                  >
                    {label}
                  </button>
                );
              })}
          </div>
          {!collapse && !zeusTheme && (
            <a
              className="btn btn--emerald btn--sm"
              data-lb-partner-cta
              href={signupHref}
              target="_blank"
              rel="noopener noreferrer sponsored"
              hidden={Boolean(board && !board.partner_signup_url)}
            >
              Join <span data-lb-partner-label>{partnerCtaLabel}</span>
            </a>
          )}
        </div>
      </header>

      <div className="lb__stage" data-lb-podium>
        {!plain && (
          <div className="lb__stage-scene" aria-hidden="true">
            <div className="stage-glow" />
          </div>
        )}

        <div
          className={`countdown${isEnded ? " is-ended" : ""}`}
          data-lb-countdown
          role="timer"
          aria-label="Leaderboard ends in"
        >
          {!plain ? (
            <div className="slot-clock">
              <img
                className="slot-clock__jewel"
                src="/img/lb/slot-gem.webp"
                alt=""
                width={960}
                height={459}
                decoding="async"
              />
              <img
                className="slot-clock__lamp"
                src="/img/lb/slot-lamp.webp"
                alt=""
                width={1600}
                height={273}
                decoding="async"
              />
              <div className="slot-clock__bay">
                <video
                  className="slot-clock__host"
                  muted
                  loop
                  playsInline
                  autoPlay={!reduceMotion}
                  preload="metadata"
                  poster="/img/lb/slot-host-poster.webp"
                  aria-hidden="true"
                >
                  <source src="/img/lb/slot-host.webm" type="video/webm" />
                </video>
                <img
                  className="slot-clock__host slot-clock__host--still"
                  src="/img/lb/slot-host-poster.webp"
                  alt=""
                  width={352}
                  height={432}
                  decoding="async"
                />
                <div className="countdown__cells">
                  <span className="slot-clock__pay" aria-hidden="true" />
                  <p>
                    <strong data-cd="d">
                      {isBoardLoading ? <i className="countdown__skel skel" aria-hidden="true" /> : cd.d}
                    </strong>
                    <span>Days</span>
                  </p>
                  <p>
                    <strong data-cd="h">
                      {isBoardLoading ? <i className="countdown__skel skel" aria-hidden="true" /> : cd.h}
                    </strong>
                    <span>Hrs</span>
                  </p>
                  <p>
                    <strong data-cd="m">
                      {isBoardLoading ? <i className="countdown__skel skel" aria-hidden="true" /> : cd.m}
                    </strong>
                    <span>Min</span>
                  </p>
                  <p>
                    <strong data-cd="s">
                      {isBoardLoading ? <i className="countdown__skel skel" aria-hidden="true" /> : cd.s}
                    </strong>
                    <span>Sec</span>
                  </p>
                </div>
                <img
                  className="slot-clock__lever"
                  src="/img/cabinet/lever.webp"
                  alt=""
                  width={64}
                  height={220}
                  decoding="async"
                />
              </div>
            </div>
          ) : (
            <div className="countdown__cells">
              <p>
                <strong data-cd="d">
                  {isBoardLoading ? <i className="countdown__skel skel" aria-hidden="true" /> : cd.d}
                </strong>{" "}
                <span>Days</span>
              </p>
              <p>
                <strong data-cd="h">
                  {isBoardLoading ? <i className="countdown__skel skel" aria-hidden="true" /> : cd.h}
                </strong>{" "}
                <span>Hrs</span>
              </p>
              <p>
                <strong data-cd="m">
                  {isBoardLoading ? <i className="countdown__skel skel" aria-hidden="true" /> : cd.m}
                </strong>{" "}
                <span>Min</span>
              </p>
              <p>
                <strong data-cd="s">
                  {isBoardLoading ? <i className="countdown__skel skel" aria-hidden="true" /> : cd.s}
                </strong>{" "}
                <span>Sec</span>
              </p>
            </div>
          )}
        </div>

        <div className="lb__winners">
          {PODIUM_RANKS.map((rank) => {
            const spot = players.find((p) => Number(p.rank) === rank);
            const configuredSpot = detail?.spots?.find(
              (s) => Number(s.rank) === rank && !Number(s.hidden),
            );
            const player = spot && !spot.empty_spot ? spot : null;
            const prizeText =
              player && Number(player.prize_cents) > 0
                ? money(player.prize_cents)
                : Number(spot?.prize_cents) > 0
                  ? money(spot?.prize_cents)
                  : Number(configuredSpot?.prize_cents) > 0
                    ? money(configuredSpot?.prize_cents)
                    : "—";
            const wagerText = player ? money(player.wagered_cents) : "—";
            const nameText = player ? player.display_name || player.username || "—" : "—";
            const avatarUrl =
              player?.avatar_url && !brokenAvatars[player.avatar_url]
                ? player.avatar_url
                : undefined;
            const rawPodiumAvatar = !avatarsDisabled && player ? player.avatar_url || "" : "";
            const validPodiumAvatar =
              rawPodiumAvatar && !brokenAvatars[rawPodiumAvatar] ? rawPodiumAvatar : "";
            const showPodiumAvatar = !avatarsDisabled;
            const podiumTone = rank === 1 ? "gold" : rank === 2 ? "silver" : "bronze";

            return (
              <article
                key={rank}
                className={`podium podium--${rank} ${isBoardLoading ? "is-loading is-empty" : player ? "is-in" : "is-empty"}`}
                data-podium-rank={rank}
                aria-label={`Place ${rank}`}
              >
                {zeusTheme ? (
                  <div className="podium__pedestal">
                    <div className="podium__cap" aria-hidden="true">
                      <ZeusSlotMarquee label={ZEUS_PODIUM_BADGE[rank]} tone={podiumTone} />
                      <ZeusArchitrave />
                    </div>
                    <div className="podium__body">
                      <span className="podium__pilaster podium__pilaster--l" aria-hidden="true" />
                      <div className="podium__chamber">
                        <div className="podium__hero-cell">
                          <span
                            className="podium__cell-glyph podium__cell-glyph--tl"
                            aria-hidden="true"
                          >
                            {ZEUS_REEL_GLYPHS[(rank - 1) % ZEUS_REEL_GLYPHS.length]}
                          </span>
                          <span
                            className="podium__cell-glyph podium__cell-glyph--tr"
                            aria-hidden="true"
                          >
                            {ZEUS_REEL_GLYPHS[(rank + 1) % ZEUS_REEL_GLYPHS.length]}
                          </span>
                          {showPodiumAvatar && (
                            <div className="podium__crest">
                              <div className="podium__avatar-ring">
                                {isBoardLoading ? (
                                  <i className="podium__avatar-skel skel" aria-hidden="true" />
                                ) : validPodiumAvatar ? (
                                  <BoardAvatarImg
                                    src={validPodiumAvatar}
                                    className="podium__avatar"
                                    size={108}
                                    dataPodium
                                    onBroken={markBrokenAvatar}
                                  />
                                ) : (
                                  <ZeusAvatarFallback />
                                )}
                              </div>
                            </div>
                          )}
                          <div className="podium__nameplate">
                            <h3 className="podium__name" data-podium-username>
                              {isBoardLoading ? (
                                <i className="podium__skel-name skel" aria-hidden="true" />
                              ) : (
                                nameText
                              )}
                            </h3>
                          </div>
                        </div>
                        <div className="podium__stats">
                          <p className="stat-box stat-box--prize">
                            <span className="stat-box__kicker">Prize</span>{" "}
                            <strong data-podium-prize>
                              {isBoardLoading ? (
                                <i
                                  className="podium__skel-stat podium__skel-stat--prize skel"
                                  aria-hidden="true"
                                />
                              ) : (
                                prizeText
                              )}
                            </strong>
                          </p>
                          <p className="stat-box stat-box--wager">
                            <span className="stat-box__kicker">Wagered</span>{" "}
                            <strong data-podium-wager>
                              {isBoardLoading ? (
                                <i className="podium__skel-stat skel" aria-hidden="true" />
                              ) : (
                                wagerText
                              )}
                            </strong>
                          </p>
                        </div>
                      </div>
                      <span className="podium__pilaster podium__pilaster--r" aria-hidden="true" />
                    </div>
                    <div className="podium__plinth" aria-hidden="true">
                      <div className="zeus-sill" />
                      <div className="podium__dado">
                        {rank !== 3 && <span className="podium__dado-tablet" />}
                      </div>
                      <div className="zeus-steps">
                        <span className="zeus-steps__tier zeus-steps__tier--1" />
                        <span className="zeus-steps__tier zeus-steps__tier--2" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {(podiumArt || !plain) && <PodiumDecoImg rank={rank} />}
                    <span className="podium__rank" aria-hidden="true">
                      {rank}
                    </span>
                    <div className="podium__who">
                      {isBoardLoading ? (
                        <i className="podium__who-avatar-skel skel" aria-hidden="true" />
                      ) : (
                        avatarUrl && (
                          <span className="podium__who-avatar-wrap">
                            <BoardAvatarImg
                              src={avatarUrl}
                              className="podium__avatar"
                              size={40}
                              lazy
                              dataPodium
                              onBroken={markBrokenAvatar}
                            />
                          </span>
                        )
                      )}
                      <h3 className="podium__name" data-podium-username>
                        {isBoardLoading ? (
                          <i className="podium__skel-name skel" aria-hidden="true" />
                        ) : (
                          nameText
                        )}
                      </h3>
                    </div>
                    <div className="podium__stats">
                      <p className="stat-box stat-box--prize">
                        <span>Prize</span>
                        {plain ? " " : null}
                        <strong data-podium-prize>
                          {isBoardLoading ? (
                            <i
                              className="podium__skel-stat podium__skel-stat--prize skel"
                              aria-hidden="true"
                            />
                          ) : (
                            prizeText
                          )}
                        </strong>
                      </p>
                      <p className="stat-box">
                        <span>Wagered</span>
                        {plain ? " " : null}
                        <strong data-podium-wager>
                          {isBoardLoading ? (
                            <i className="podium__skel-stat skel" aria-hidden="true" />
                          ) : (
                            wagerText
                          )}
                        </strong>
                      </p>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      </div>

      {zeusTheme && !collapse && (
        <article
          className="zeus-partner-card"
          data-partner={theme}
          hidden={Boolean(board && !board.partner_signup_url && !defaultPartner?.url)}
        >
          <div className="zeus-partner-card__stage">
            {!zeusCardBg.ready && (
              <i className="skel-overlay skel-overlay--zeus" aria-hidden="true" />
            )}
            <img
              ref={zeusCardBg.ref}
              className={`zeus-partner-card__bg${!zeusCardBg.ready ? " is-media-pending" : ""}`}
              src="/img/partners/zeus-card-bg.webp"
              alt=""
              width={2200}
              height={1228}
              decoding="async"
              onLoad={zeusCardBg.onLoad}
              onError={zeusCardBg.onError}
            />
            <ZeusPartnerMascot />

            <div className="zeus-partner-card__copy">
              <h3 className="zeus-partner-card__name">
                {is500Partner ? (
                  <>
                    {!zeusWordmark.ready && (
                      <i className="zeus-partner-card__wordmark-skel skel" aria-hidden="true" />
                    )}
                    <img
                      ref={zeusWordmark.ref}
                      className={!zeusWordmark.ready ? "is-media-pending" : undefined}
                      src="/img/partners/500-wordmark-zeus.webp"
                      alt={partnerCtaLabel}
                      width={1428}
                      height={1011}
                      decoding="async"
                      onLoad={zeusWordmark.onLoad}
                      onError={zeusWordmark.onError}
                    />
                  </>
                ) : (
                  <span className="zeus-partner-card__fallback-name">{partnerCtaLabel}</span>
                )}
              </h3>

              <div className="zeus-partner-card__actions">
                <button
                  type="button"
                  className={`zeus-partner-card__code${copied ? " is-copied" : ""}`}
                  data-copy={promoCode}
                  aria-label={`Copy code ${promoCode}`}
                  onClick={() => void copy()}
                >
                  <img src="/img/icons/nav-copy.webp" alt="" width={28} height={28} />
                  <span className="zeus-partner-card__code-copy">
                    <span className="zeus-partner-card__code-kicker">Referral code</span>
                    <span className="zeus-partner-card__code-value">{promoCode}</span>
                  </span>
                  <span
                    className="zeus-partner-card__code-toast"
                    data-copy-status
                    aria-live="polite"
                  >
                    {copied ? "Copied!" : ""}
                  </span>
                </button>

                <a
                  className="zeus-partner-card__go"
                  data-lb-partner-cta
                  href={signupHref}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                >
                  <span className="zeus-partner-card__go-label">
                    Claim on <span data-lb-partner-label>{partnerCtaLabel}</span>
                  </span>
                </a>
              </div>
            </div>
          </div>
        </article>
      )}

      {zeusTheme ? (
        <div className="lb__table lb-temple" hidden={hideZeusTable}>
          <div className="lb-temple__cap" aria-hidden="true">
            <ZeusSlotMarquee label="RANKINGS" tone="gold" withBolts />
            <ZeusArchitrave wide />
          </div>
          <div className="lb-temple__frame">
            <span className="lb-temple__pillar lb-temple__pillar--l" aria-hidden="true" />
            <div className="lb-temple__grid">{tableRowsMarkup}</div>
            <span className="lb-temple__pillar lb-temple__pillar--r" aria-hidden="true" />
          </div>
          <div className="lb-temple__base" aria-hidden="true">
            <div className="zeus-sill zeus-sill--wide" />
            <div className="zeus-steps zeus-steps--wide">
              <span className="zeus-steps__tier zeus-steps__tier--1" />
              <span className="zeus-steps__tier zeus-steps__tier--2" />
            </div>
          </div>
        </div>
      ) : (
        <div className="lb__table">{tableRowsMarkup}</div>
      )}

      {collapse && zeusTheme && (
        <div className="lb__more">
          <Link
            className="lb__full-cta"
            to={activeSlug ? boardHref(activeSlug) : "/leaderboards/"}
            data-lb-full-link
          >
            <span>View full leaderboard</span>
          </Link>
        </div>
      )}

    </div>
  );
}
