import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { partnerCode, site, type Partner } from "../../shared/site";
import { KickStreamPlayer } from "../components/KickStreamPlayer";
import { LeaderboardShell } from "../components/LeaderboardShell";
import { StepsSection } from "../components/StepsSection";
import { useCopy } from "../hooks/useCopy";
import { useImgReady, usePosterReady } from "../hooks/useMediaReady";
import { usePageMeta } from "../hooks/usePageMeta";
import { useEntranceReady, useScrollFocus } from "../hooks/useReveal";
import {
  boardCadence,
  boardHref,
  defaultSiteSettings,
  fetchBoards,
  fetchSiteSettings,
  moneyShort,
  partnerTheme,
} from "../lib/boards";
import { reduceMotion } from "../lib/format";
import type { Board, SiteSettings } from "../lib/types";
import { useUi, type HomeSection } from "../state/ui";

function ModeCard({
  to,
  modifier,
  poster,
  src,
  label,
  index,
}: {
  to: string;
  modifier: "raffle" | "bonus";
  poster: string;
  src: string;
  label: string;
  index: number;
}) {
  const { ref: cardRef, opened, unlock } = useScrollFocus<HTMLAnchorElement>({
    initialOpenDelayMs: 360,
    reenterOpenDelayMs: 280,
    staggerMs: index * 140,
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const posterReady = usePosterReady(poster);

  useEffect(() => {
    const card = cardRef.current;
    const video = videoRef.current;
    if (!card || !video || reduceMotion) return;

    video.loop = false;
    video.muted = true;
    let dir = 0;
    let gen = 0;
    let scrubRaf = 0;
    let onSeeked: (() => void) | null = null;

    const clearSeek = () => {
      if (!onSeeked) return;
      video.removeEventListener("seeked", onSeeked);
      onSeeked = null;
    };

    const live = (on: boolean) => {
      card.classList.toggle("is-live", on);
      card.dataset.want = on ? "1" : "0";
    };

    const ready = (): Promise<void> => {
      if (video.readyState >= 1) return Promise.resolve();
      video.preload = "auto";
      return new Promise((resolve) => {
        video.addEventListener("loadeddata", () => resolve(), { once: true });
        video.load();
      });
    };

    const halt = () => {
      dir = 0;
      gen += 1;
      cancelAnimationFrame(scrubRaf);
      clearSeek();
      video.pause();
      try {
        video.playbackRate = 1;
        video.currentTime = 0;
      } catch {
        /* not ready */
      }
      live(false);
    };

    const scrubBack = (id: number) => {
      cancelAnimationFrame(scrubRaf);
      clearSeek();
      video.pause();
      try {
        video.playbackRate = 1;
      } catch {
        /* unsupported */
      }
      live(true);
      const frameMs = 1000 / 24;
      let cursor = video.currentTime;
      let last = performance.now();
      let acc = frameMs;

      const step = (now: number) => {
        if (id !== gen || dir !== -1) return;
        acc += now - last;
        last = now;
        if (acc < frameMs) {
          scrubRaf = requestAnimationFrame(step);
          return;
        }
        const frames = Math.min(2, Math.floor(acc / frameMs));
        acc -= frames * frameMs;
        cursor -= frames / 24;
        if (cursor <= 0.03) {
          halt();
          return;
        }
        const finish = () => {
          if (onSeeked !== finish) return;
          clearSeek();
          if (id !== gen || dir !== -1) return;
          scrubRaf = requestAnimationFrame(step);
        };
        onSeeked = finish;
        video.addEventListener("seeked", finish);
        try {
          video.currentTime = cursor;
        } catch {
          halt();
          return;
        }
        if (!video.seeking) finish();
      };
      scrubRaf = requestAnimationFrame(step);
    };

    const playForward = () => {
      const id = ++gen;
      dir = 1;
      cancelAnimationFrame(scrubRaf);
      clearSeek();
      ready()
        .then(() => {
          if (id !== gen) return;
          const dur = video.duration;
          if (Number.isFinite(dur) && video.currentTime >= dur - 0.05) {
            try {
              video.currentTime = 0;
            } catch {
              /* ignore */
            }
          }
          video.playbackRate = 1;
          return video.play();
        })
        .then(() => {
          if (id === gen && dir === 1) live(true);
        })
        .catch(() => {
          if (id === gen) live(false);
        });
    };

    const playBackward = () => {
      const id = ++gen;
      dir = -1;
      cancelAnimationFrame(scrubRaf);
      clearSeek();
      ready()
        .then(() => {
          if (id !== gen) return;
          if (video.currentTime <= 0.04) {
            halt();
            return;
          }
          const dur = video.duration;
          if (Number.isFinite(dur) && video.currentTime >= dur - 0.02) {
            try {
              video.currentTime = Math.max(0, dur - 0.08);
            } catch {
              /* ignore */
            }
          }
          let reverseNative = false;
          try {
            video.playbackRate = -1;
            reverseNative = video.playbackRate < 0;
          } catch {
            /* unsupported */
          }
          if (!reverseNative) {
            try {
              video.playbackRate = 1;
            } catch {
              /* ignore */
            }
            scrubBack(id);
            return;
          }
          return video.play().then(() => {
            if (id !== gen) return;
            if (video.playbackRate < 0) live(true);
            else scrubBack(id);
          });
        })
        .catch(() => {
          if (id === gen) scrubBack(id);
        });
    };

    const onEnded = () => {
      if (dir > 0) playBackward();
      else if (dir < 0) halt();
    };

    const onPause = () => {
      if (dir < 0 && video.currentTime <= 0.06) halt();
    };

    const onFocus = () => {
      if (card.matches(":hover")) return;
      playForward();
    };

    video.addEventListener("ended", onEnded);
    video.addEventListener("pause", onPause);
    card.addEventListener("pointerenter", playForward);
    card.addEventListener("focus", onFocus);

    return () => {
      cancelAnimationFrame(scrubRaf);
      clearSeek();
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("pause", onPause);
      card.removeEventListener("pointerenter", playForward);
      card.removeEventListener("focus", onFocus);
    };
  }, []);

  return (
    <Link
      ref={cardRef}
      className={`mode mode--${modifier}${opened ? " is-open" : ""}`}
      to={to}
      style={{ "--reveal-i": index } as CSSProperties}
      onPointerDown={unlock}
      onFocus={unlock}
    >
      {!posterReady && <i className="skel-overlay skel-overlay--dark" aria-hidden="true" />}
      <video
        ref={videoRef}
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        poster={poster}
        src={src}
      />
      <span>{label}</span>
    </Link>
  );
}

function formatDashBadge(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((w) =>
      w.length > 4 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toUpperCase(),
    )
    .join(" ");
}

function dashTitle(board: Board): string {
  const cents = Number(board.prize_pool_cents) || 0;
  const customBadge = board.badge?.trim();
  if (customBadge) {
    const badgeFormatted = formatDashBadge(customBadge);
    if (cents > 0) return `${moneyShort(cents)} ${badgeFormatted}`;
    return board.title || badgeFormatted;
  }
  const wordMap: Record<string, string | undefined> = {
    WEEKLY: "Weekly",
    MONTHLY: "Monthly",
    DAILY: "Daily",
  };
  const word = wordMap[boardCadence(board)];
  if (cents > 0 && word) return `${moneyShort(cents)} ${word}`;
  if (cents > 0) return `${moneyShort(cents)} Race`;
  return board.title || "Leaderboard";
}

function DashBoardList({ index }: { index: number }) {
  const { dataRev } = useUi();
  const dashFocus = useScrollFocus<HTMLElement>({
    initialOpenDelayMs: 360,
    reenterOpenDelayMs: 280,
    staggerMs: index * 140,
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const dashBgReady = usePosterReady("/img/deco/dash-live.webp");

  useEffect(() => {
    let alive = true;
    fetchBoards().then((list) => {
      if (alive) setBoards(list);
    });
    return () => {
      alive = false;
    };
  }, [dataRev]);

  const visibleBoards = useMemo(
    () => (boards === null ? null : boards.filter((b) => b.show_on_home !== 0)),
    [boards],
  );

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

  const now = Date.now();

  return (
    <section
      ref={dashFocus.ref}
      className={`lb-dash${dashFocus.opened ? " is-open" : ""}`}
      aria-label="Leaderboards"
      style={{ "--reveal-i": index } as CSSProperties}
      onPointerDown={dashFocus.unlock}
      onFocus={dashFocus.unlock}
    >
      {!dashBgReady && <i className="skel-overlay skel-overlay--blue" aria-hidden="true" />}
      <video
        ref={videoRef}
        className="lb-dash__live"
        muted
        loop
        playsInline
        autoPlay={!reduceMotion}
        preload="auto"
        aria-hidden="true"
        poster="/img/deco/dash-live.webp"
        src="/img/deco/dash-live.mp4"
      />
      <div className="lb-dash__list" data-lb-dash>
        {visibleBoards === null ? (
          <div className="lb-dash__card lb-dash__card--skeleton" aria-hidden="true">
            <span className="lb-dash__copy">
              <span className="lb-dash__skel-title skel" />
              <span className="lb-dash__skel-go skel" />
            </span>
          </div>
        ) : visibleBoards.length === 0 ? (
          <p className="lb-dash__empty">New races are coming soon.</p>
        ) : (
          visibleBoards.map((board, idx) => {
            const end = Number(board.ends_at) || 0;
            const ended = !(end - now > 0);

            return (
              <Link
                key={board.slug}
                className={`lb-dash__card${ended ? " is-ended" : ""}`}
                data-partner={partnerTheme(board.partner)}
                to={boardHref(board.slug)}
                data-ends={end}
                style={{ "--i": idx } as CSSProperties}
              >
                <span className="lb-dash__copy">
                  <span className="lb-dash__title">
                    <span className="lb-dash__mark">
                      <img src="/img/icons/nav-trophy.webp" alt="" width={14} height={14} />
                    </span>
                    <span>{dashTitle(board)}</span>
                  </span>
                  <span className="lb-dash__go">View board</span>
                </span>
                {ended && <span className="lb-dash__ended">Ended</span>}
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}

function PartnerCard({ partner, index }: { partner: Partner; index: number }) {
  const cardFocus = useScrollFocus<HTMLElement>({
    revealThreshold: 0.14,
    enterRatio: 0.36,
    enterPx: 200,
    stayRatio: 0.2,
    stayPx: 115,
    initialOpenDelayMs: 360,
    reenterOpenDelayMs: 280,
    staggerMs: index * 140,
  });
  const code = partnerCode(partner);
  const { copied, copy } = useCopy(code);
  const mascotRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const goRef = useRef<HTMLAnchorElement | null>(null);
  const sceneImg = useImgReady(partner.scene);
  const mascotImg = useImgReady(partner.mascot);
  const logoImg = useImgReady(partner.logo);

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

  const setClaimRate = useCallback((rate: number) => {
    if (reduceMotion || !goRef.current) return;
    goRef.current.getAnimations({ subtree: true }).forEach((anim) => {
      anim.playbackRate = rate;
    });
  }, []);

  return (
    <article
      ref={cardFocus.ref}
      className={`partner-card${cardFocus.shown ? " is-in" : ""}${cardFocus.opened ? " is-open" : ""}`}
      data-partner={partner.theme || "generic"}
      data-reveal
      style={{ "--reveal-i": index } as CSSProperties}
      onPointerDown={cardFocus.unlock}
      onFocus={cardFocus.unlock}
    >
      {partner.scene && (
        <>
          {!sceneImg.ready && <i className="skel-overlay skel-overlay--dark" aria-hidden="true" />}
          <img
            ref={sceneImg.ref}
            className={`partner-card__bg${!sceneImg.ready ? " is-media-pending" : ""}`}
            src={partner.scene}
            alt=""
            width={1600}
            height={900}
            onLoad={sceneImg.onLoad}
            onError={sceneImg.onError}
          />
          <div className="partner-card__veil" aria-hidden="true" />
        </>
      )}
      {partner.mascot && (
        <div ref={mascotRef} className="partner-card__mascot" aria-hidden="true">
          <img
            ref={mascotImg.ref}
            className={!mascotImg.ready ? "is-media-pending" : undefined}
            src={partner.mascot}
            alt=""
            width={836}
            height={960}
            onLoad={mascotImg.onLoad}
            onError={mascotImg.onError}
          />
          {partner.mascotVideo && (
            <video
              ref={videoRef}
              muted
              loop
              playsInline
              preload="none"
              poster={partner.mascot}
              src={partner.mascotVideo}
            />
          )}
        </div>
      )}
      <div className="partner-card__copy">
        <h3 className="partner-card__name">
          {partner.logo ? (
            <>
              {!logoImg.ready && (
                <span className="partner-card__logo-skel skel" aria-hidden="true" />
              )}
              <img
                ref={logoImg.ref}
                className={!logoImg.ready ? "is-media-pending" : undefined}
                src={partner.logo}
                alt={partner.name}
                width={1400}
                height={967}
                onLoad={logoImg.onLoad}
                onError={logoImg.onError}
              />
            </>
          ) : (
            partner.name
          )}
        </h3>
        <div className="partner-card__actions">
          <button
            type="button"
            className={`partner-card__code${copied ? " is-copied" : ""}`}
            data-copy={code}
            aria-label={`Copy code ${code}`}
            onClick={() => void copy()}
          >
            <img src="/img/icons/nav-copy.webp" alt="" width={28} height={28} />
            <span className="partner-card__code-copy">
              <span className="partner-card__code-kicker">Referral code</span>
              <span className="partner-card__code-value">{code}</span>
            </span>
            <span className="partner-card__code-toast" data-copy-status aria-live="polite">
              {copied ? "Copied!" : ""}
            </span>
          </button>
          <a
            ref={goRef}
            className="partner-card__go"
            href={partner.url}
            target="_blank"
            rel="noopener noreferrer sponsored"
            onPointerEnter={() => setClaimRate(2.6)}
            onPointerLeave={() => setClaimRate(1)}
            onFocus={() => setClaimRate(2.6)}
            onBlur={() => setClaimRate(1)}
          >
            <span className="partner-card__go-label">{partner.cta || "Claim bonus"}</span>
          </a>
        </div>
      </div>
    </article>
  );
}

interface ContactSlotCardProps {
  slot: "hooligan" | "sortudo" | "count";
  href: string;
  scene: string;
  wordmark: string;
  wordmarkSize: readonly [number, number];
  title: string;
  index: number;
}

function ContactCard({
  slot,
  href,
  scene,
  wordmark,
  wordmarkSize,
  title,
  index,
}: ContactSlotCardProps) {
  const cardFocus = useScrollFocus<HTMLDivElement>({
    revealThreshold: 0.14,
    enterRatio: 0.36,
    enterPx: 170,
    stayRatio: 0.2,
    stayPx: 96,
    initialOpenDelayMs: 320,
    reenterOpenDelayMs: 280,
    staggerMs: index * 140,
  });
  const sceneImg = useImgReady(scene);
  const wordmarkImg = useImgReady(wordmark);
  return (
    <div
      ref={cardFocus.ref}
      className={`contact-card contact-card--${slot}${cardFocus.shown ? " is-in" : ""}${cardFocus.opened ? " is-open" : ""}`}
      data-slot={slot}
      data-reveal
      style={{ "--reveal-i": index } as CSSProperties}
      onPointerDown={cardFocus.unlock}
      onFocus={cardFocus.unlock}
    >
      {!sceneImg.ready && <i className="skel-overlay skel-overlay--dark" aria-hidden="true" />}
      <img
        ref={sceneImg.ref}
        className={`contact-card__scene${!sceneImg.ready ? " is-media-pending" : ""}`}
        src={scene}
        alt=""
        width={1800}
        height={1005}
        loading="lazy"
        onLoad={sceneImg.onLoad}
        onError={sceneImg.onError}
      />
      <span className="contact-card__veil" aria-hidden="true" />

      <a
        className="contact-card__logo"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={title}
      >
        {!wordmarkImg.ready && (
          <span className="contact-card__wordmark-skel skel" aria-hidden="true" />
        )}
        <img
          ref={wordmarkImg.ref}
          className={`contact-card__wordmark${!wordmarkImg.ready ? " is-media-pending" : ""}`}
          src={wordmark}
          alt={title}
          width={wordmarkSize[0]}
          height={wordmarkSize[1]}
          loading="lazy"
          onLoad={wordmarkImg.onLoad}
          onError={wordmarkImg.onError}
        />
      </a>
    </div>
  );
}

export function HomePage() {
  usePageMeta({ title: "Home", pageClass: "site--home" });

  const { setHomeSection, dataRev } = useUi();
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(() => defaultSiteSettings());
  const lbBgReady = usePosterReady("/img/bg/leaderboard-clouds-crest.webp?v=4");

  useEffect(() => {
    let alive = true;
    fetchSiteSettings().then((settings) => {
      if (alive) setSiteSettings(settings);
    });
    return () => {
      alive = false;
    };
  }, [dataRev]);

  const livePromoCode = siteSettings.promo_code?.trim() || site.promoCode;
  const liveKickChannel = siteSettings.kick_channel?.trim() || site.kickChannel;
  const liveKickUrl = siteSettings.kick_url?.trim() || site.kickUrl;
  const liveTelegramUrl = siteSettings.telegram_url?.trim() || site.telegramUrl;
  const liveXUrl = site.xUrl || site.social.x;

  const livePartners = useMemo<Partner[]>(
    () =>
      site.partners.map((p, idx) => {
        if (p.id === "500" || idx === 0) {
          const nextName = siteSettings.partner_name?.trim() || p.name;
          return {
            ...p,
            name: nextName,
            code: livePromoCode,
            url: siteSettings.partner_signup_url?.trim() || p.url,
            cta: siteSettings.partner_name?.trim() ? `Claim on ${nextName}` : p.cta,
          };
        }
        return p;
      }),
    [livePromoCode, siteSettings.partner_name, siteSettings.partner_signup_url],
  );

  const { copied, copy } = useCopy(livePromoCode);
  const heroReady = useEntranceReady();
  const heroStageFocus = useScrollFocus<HTMLDivElement>({
    initialOpenDelayMs: 220,
    reenterOpenDelayMs: 260,
  });
  const heroCopyFocus = useScrollFocus<HTMLDivElement>({
    enterRatio: 0.45,
    stayRatio: 0.2,
    initialOpenDelayMs: 280,
    reenterOpenDelayMs: 240,
  });
  const bonusHeadFocus = useScrollFocus<HTMLElement>({
    revealThreshold: 0.2,
    enterRatio: 0.45,
    stayRatio: 0.2,
    initialOpenDelayMs: 240,
    reenterOpenDelayMs: 220,
  });
  const lbFocus = useScrollFocus<HTMLDivElement>({
    revealThreshold: 0.08,
    enterRatio: 0.28,
    enterPx: 260,
    stayRatio: 0.16,
    stayPx: 140,
    initialOpenDelayMs: 340,
    reenterOpenDelayMs: 280,
    rootMargin: "-64px 0px -6% 0px",
  });
  const contactsHeadFocus = useScrollFocus<HTMLElement>({
    revealThreshold: 0.2,
    enterRatio: 0.45,
    stayRatio: 0.2,
    initialOpenDelayMs: 240,
    reenterOpenDelayMs: 220,
  });
  const bonusRef = useRef<HTMLElement | null>(null);
  const contactsRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setHomeSection("home");
    const sections = [bonusRef.current, contactsRef.current].filter(
      (el): el is HTMLElement => el !== null,
    );
    if (!sections.length || typeof IntersectionObserver === "undefined") {
      return () => setHomeSection("home");
    }
    const visible = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => visible.set(e.target.id, e.isIntersecting));
        const hit = sections.find((s) => visible.get(s.id));
        const next: HomeSection =
          hit?.id === "bonus" || hit?.id === "contacts" ? hit.id : "home";
        setHomeSection(next);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => {
      io.disconnect();
      setHomeSection("home");
    };
  }, [setHomeSection]);

  const contactSlots = [
    liveTelegramUrl
      ? ({
          slot: "hooligan",
          href: liveTelegramUrl,
          scene: "/img/contacts/tg-scene.webp",
          wordmark: "/img/contacts/tg-wordmark.webp",
          wordmarkSize: [1400, 352],
          title: "Telegram",
        } as const)
      : null,
    liveKickUrl
      ? ({
          slot: "sortudo",
          href: liveKickUrl,
          scene: "/img/contacts/kick-scene.webp",
          wordmark: "/img/contacts/kick-wordmark.webp",
          wordmarkSize: [1400, 674],
          title: "Kick",
        } as const)
      : null,
    liveXUrl
      ? ({
          slot: "count",
          href: liveXUrl,
          scene: "/img/contacts/x-scene.webp",
          wordmark: "/img/contacts/x-wordmark.webp",
          wordmarkSize: [1200, 752],
          title: "X",
        } as const)
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <>
      <section
        className={`hero${heroReady ? " is-hero-in" : ""}`}
        id="top"
        aria-labelledby="hero-title"
      >
        <div className="hero__bg" aria-hidden="true" />
        <div className="container hero__inner">
          <div
            ref={heroStageFocus.ref}
            className={`hero__stage${heroStageFocus.opened ? " is-open" : ""}`}
            onPointerDown={heroStageFocus.unlock}
            onFocus={heroStageFocus.unlock}
          >
            <KickStreamPlayer channel={liveKickChannel} kickUrl={liveKickUrl} />
          </div>
          <div
            ref={heroCopyFocus.ref}
            className={`hero__copy${heroCopyFocus.opened ? " is-open" : ""}`}
            onPointerDown={heroCopyFocus.unlock}
            onFocus={heroCopyFocus.unlock}
          >
            <h1 className="hero__title" id="hero-title">
              Play with code{" "}
              <button
                type="button"
                className={`accent hero__codeword${copied ? " is-copied" : ""}`}
                data-copy={livePromoCode}
                aria-label={
                  copied ? `Copied promo code ${livePromoCode}` : `Copy promo code ${livePromoCode}`
                }
                onClick={() => void copy()}
              >
                <span className="hero__codeword-slot">
                  <span className="hero__codeword-word">{livePromoCode}</span>
                  <span className="hero__codeword-mark" aria-hidden="true">
                    <svg viewBox="2.2 4.4 19 14.8">
                      <path
                        d="M4.5 12.5 9.6 17.6 19.5 6.4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </span>
                <span className="sr-only" data-copy-status aria-live="polite">
                  {copied ? "Copied" : ""}
                </span>
              </button>
            </h1>
          </div>

          <div className="modes">
            <ModeCard
              to="/raffles/"
              modifier="raffle"
              poster="/img/deco/raffle-burst.webp"
              src="/img/deco/raffle-burst.mp4"
              label="Raffles"
              index={0}
            />
            <ModeCard
              to="/bonuses/"
              modifier="bonus"
              poster="/img/deco/bonus-burst.webp"
              src="/img/deco/bonus-burst.mp4"
              label="Bonuses"
              index={1}
            />
            <DashBoardList index={2} />
          </div>
        </div>
        <a className="hero__scroll" href="#steps-title">
          <span>Start earning rewards</span>
        </a>
      </section>

      <StepsSection />

      <section ref={bonusRef} className="bonus" id="bonus" aria-labelledby="bonus-title">
        <div className="bonus__bg" aria-hidden="true" />
        <div className="container">
          <header
            ref={bonusHeadFocus.ref}
            className={`section-head${bonusHeadFocus.shown ? " is-in" : ""}${bonusHeadFocus.opened ? " is-open" : ""}`}
            data-reveal
            onPointerDown={bonusHeadFocus.unlock}
          >
            <h2 className="title" id="bonus-title">
              Claim your <span className="accent">bonus</span>
            </h2>
          </header>

          <div className="bonus__layout">
            <div className="bonus__cards">
              {livePartners.map((p, idx) => (
                <PartnerCard key={p.id} partner={p} index={idx} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        className="board-section board-section--home"
        id="leaderboard"
        aria-label="Leaderboard"
      >
        <div className="container home-lb-layout">
          <div
            ref={lbFocus.ref}
            className={`home-lb-card${lbFocus.shown ? " is-in" : ""}${lbFocus.opened ? " is-open" : ""}`}
            data-home-lb-reveal
            onPointerDown={lbFocus.unlock}
            onFocus={lbFocus.unlock}
          >
            {!lbBgReady && (
              <i className="skel-overlay skel-overlay--olympus" aria-hidden="true" />
            )}
            <div className="home-lb-card__bg" aria-hidden="true" />
            <LeaderboardShell
              slug=""
              switcher
              collapse
              homeOnly
              heading="h2"
              plain
              podiumArt
              zeusTheme
            />
          </div>
        </div>
      </section>

      <section
        ref={contactsRef}
        className="contacts"
        id="contacts"
        aria-labelledby="contacts-title"
      >
        <div className="contacts__bg" aria-hidden="true" />
        <div className="container contacts__inner">
          <header
            ref={contactsHeadFocus.ref}
            className={`section-head${contactsHeadFocus.shown ? " is-in" : ""}${contactsHeadFocus.opened ? " is-open" : ""}`}
            data-reveal
            onPointerDown={contactsHeadFocus.unlock}
          >
            <h2 className="title" id="contacts-title">
              Join the <span className="accent">community</span>
            </h2>
            <p className="lead">
              Giveaways, code drops and stream alerts — we post them here first.
            </p>
          </header>

          <div className="contacts__grid">
            {contactSlots.map((item, idx) => (
              <ContactCard
                key={item.slot}
                slot={item.slot}
                href={item.href}
                scene={item.scene}
                wordmark={item.wordmark}
                wordmarkSize={item.wordmarkSize}
                title={item.title}
                index={idx}
              />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
