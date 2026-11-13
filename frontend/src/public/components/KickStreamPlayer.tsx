import { useEffect, useRef, useState } from "react";
import { site } from "../../shared/site";
import { useImgReady, usePosterReady } from "../hooks/useMediaReady";
import { reduceMotion } from "../lib/format";

export type KickPlayerState = "pending" | "offline" | "live" | "unknown";

/** Kick's offline screen, until a livestream is actually up. A failed check falls back to the embed. */
export function useKickPlayer(channel: string): KickPlayerState {
  const [player, setPlayer] = useState<KickPlayerState>("pending");

  useEffect(() => {
    if (!channel) {
      setPlayer("offline");
      return;
    }
    let ignore = false;

    const pull = () => {
      fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(channel)}`, {
        headers: { accept: "application/json" },
      })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then((data: unknown) => {
          if (ignore || !data || typeof data !== "object") return;
          const live = "livestream" in data && (data as { livestream: unknown }).livestream != null;
          setPlayer(live ? "live" : "offline");
        })
        .catch(() => {
          if (!ignore) {
            setPlayer((current) =>
              current === "offline" || current === "live" ? current : "unknown",
            );
          }
        });
    };

    pull();
    const timer = window.setInterval(pull, 30_000);
    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, [channel]);

  return player;
}

const OFFLINE_MASCOT_POSTER = "/img/hero/offline-leprechaun.webp";
const OFFLINE_MASCOT_IDLE_VIDEO = "/img/hero/offline-leprechaun-idle.webm?v=2";
const OFFLINE_MASCOT_EMOTE_VIDEOS = [
  "/img/hero/offline-leprechaun.webm",
  "/img/hero/offline-leprechaun-coin.webm",
  "/img/hero/offline-leprechaun-hat.webm",
  "/img/hero/offline-leprechaun-laugh.webm",
  "/img/hero/offline-leprechaun-lookout.webm",
] as const;

function buildShuffledIndices(count: number, avoidFirst?: number): number[] {
  const indices = Array.from({ length: count }, (_, idx) => idx);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  if (count > 1 && avoidFirst !== undefined && indices[0] === avoidFirst) {
    const swapIdx = 1 + Math.floor(Math.random() * (count - 1));
    [indices[0], indices[swapIdx]] = [indices[swapIdx], indices[0]];
  }
  return indices;
}

/** Stand-in for Kick's offline player: living mascot, status link, and corner mark. */
export function KickOfflineCard({
  kickUrl = site.kickUrl,
  channelName = site.channelName,
}: {
  kickUrl?: string;
  channelName?: string;
}) {
  const mascotRef = useRef<HTMLDivElement | null>(null);
  const videoARef = useRef<HTMLVideoElement | null>(null);
  const videoBRef = useRef<HTMLVideoElement | null>(null);
  const offlineBgReady = usePosterReady("/img/hero/offline-bg.webp?v=2");
  const leprechaunImg = useImgReady(OFFLINE_MASCOT_POSTER);

  useEffect(() => {
    const root = mascotRef.current;
    const videoA = videoARef.current;
    const videoB = videoBRef.current;
    if (!root || !videoA || !videoB || reduceMotion) return;

    const videos: [HTMLVideoElement, HTMLVideoElement] = [videoA, videoB];
    let emoteBag: number[] = [];
    let lastEmoteIdx: number | undefined;
    // Start with 2 calm idle cycles (~12s), then 3–4 calm idle cycles (~18–24s) between each active emote
    let calmRemaining = 2;

    const pullNextUrl = (): string => {
      if (calmRemaining > 0) {
        calmRemaining -= 1;
        return OFFLINE_MASCOT_IDLE_VIDEO;
      }
      calmRemaining = 3 + Math.floor(Math.random() * 2);
      if (emoteBag.length === 0) {
        emoteBag = buildShuffledIndices(OFFLINE_MASCOT_EMOTE_VIDEOS.length, lastEmoteIdx);
      }
      const idx = emoteBag.shift() ?? 0;
      lastEmoteIdx = idx;
      return OFFLINE_MASCOT_EMOTE_VIDEOS[idx];
    };

    let disposed = false;
    let activeSlot: 0 | 1 = 0;
    let standbyCleanup: (() => void) | null = null;

    const clearStandbyWait = () => {
      if (standbyCleanup) {
        standbyCleanup();
        standbyCleanup = null;
      }
    };

    const preloadInto = (el: HTMLVideoElement, url: string) => {
      if (disposed) return;
      el.pause();
      el.muted = true;
      el.preload = "auto";
      if (el.getAttribute("data-clip-src") === url && !el.error && el.readyState >= 2) {
        try {
          el.currentTime = 0;
        } catch {
          /* ignore */
        }
        return;
      }
      el.setAttribute("data-clip-src", url);
      el.src = url;
      el.load();
    };

    const replayCurrent = (el: HTMLVideoElement) => {
      try {
        el.currentTime = 0;
        void el.play().catch(() => { });
      } catch {
        /* ignore */
      }
    };

    const handoffTo = (nextSlot: 0 | 1) => {
      if (disposed) return;
      clearStandbyWait();
      const prevSlot = (1 - nextSlot) as 0 | 1;
      const currentEl = videos[prevSlot];
      const nextEl = videos[nextSlot];

      const commitSwap = () => {
        if (disposed) return;
        try {
          nextEl.currentTime = 0;
        } catch {
          /* ignore */
        }
        void nextEl
          .play()
          .then(() => {
            if (disposed) return;
            activeSlot = nextSlot;
            root.classList.add("is-playing");
            nextEl.classList.add("is-active");
            currentEl.classList.remove("is-active");
            preloadInto(currentEl, pullNextUrl());
          })
          .catch(() => {
            if (!disposed) replayCurrent(currentEl);
          });
      };

      if (nextEl.error) {
        preloadInto(nextEl, pullNextUrl());
        replayCurrent(currentEl);
        return;
      }

      if (nextEl.readyState >= 2) {
        commitSwap();
        return;
      }

      const onCanPlay = () => {
        clearStandbyWait();
        commitSwap();
      };
      const fallbackTimer = window.setTimeout(() => {
        clearStandbyWait();
        replayCurrent(currentEl);
      }, 1200);

      nextEl.addEventListener("canplay", onCanPlay, { once: true });
      standbyCleanup = () => {
        window.clearTimeout(fallbackTimer);
        nextEl.removeEventListener("canplay", onCanPlay);
      };
    };

    const onEndedA = () => {
      if (activeSlot === 0) handoffTo(1);
    };
    const onEndedB = () => {
      if (activeSlot === 1) handoffTo(0);
    };

    videoA.addEventListener("ended", onEndedA);
    videoB.addEventListener("ended", onEndedB);

    let standbyPreloaded = false;
    const markInitial = () => {
      if (disposed) return;
      root.classList.add("is-playing");
      if (!standbyPreloaded) {
        standbyPreloaded = true;
        preloadInto(videoB, pullNextUrl());
      }
    };

    videoA.classList.add("is-active");
    videoB.classList.remove("is-active");
    videoA.addEventListener("playing", markInitial);

    const startInitial = () => {
      if (disposed) return;
      void videoA.play().then(markInitial).catch(() => { });
    };

    preloadInto(videoA, pullNextUrl());
    if (videoA.readyState >= 2) startInitial();
    else videoA.addEventListener("loadeddata", startInitial, { once: true });

    const onVisibility = () => {
      if (disposed || document.visibilityState !== "visible") return;
      const cur = videos[activeSlot];
      if (cur.ended) {
        handoffTo((1 - activeSlot) as 0 | 1);
      } else if (cur.paused) {
        void cur.play().catch(() => { });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      clearStandbyWait();
      videoA.removeEventListener("ended", onEndedA);
      videoB.removeEventListener("ended", onEndedB);
      videoA.removeEventListener("playing", markInitial);
      videoA.removeEventListener("loadeddata", startInitial);
      document.removeEventListener("visibilitychange", onVisibility);
      videoA.pause();
      videoB.pause();
    };
  }, []);

  return (
    <div className="hero__offline">
      {!offlineBgReady && <i className="skel-overlay skel-overlay--dark" aria-hidden="true" />}
      <div ref={mascotRef} className="hero__offline-mascot" aria-hidden="true">
        <img
          ref={leprechaunImg.ref}
          className={!leprechaunImg.ready ? "is-media-pending" : undefined}
          src={OFFLINE_MASCOT_POSTER}
          alt=""
          width={590}
          height={692}
          onLoad={leprechaunImg.onLoad}
          onError={leprechaunImg.onError}
        />
        {!reduceMotion && (
          <>
            <video
              ref={videoARef}
              className="is-active"
              muted
              playsInline
              preload="none"
              poster={OFFLINE_MASCOT_POSTER}
            />
            <video
              ref={videoBRef}
              muted
              playsInline
              preload="none"
              poster={OFFLINE_MASCOT_POSTER}
            />
          </>
        )}
      </div>
      <a
        className="hero__offline-status"
        href={kickUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="hero__offline-badge">Offline</span>
        <span className="hero__offline-title">{channelName} is offline</span>
      </a>
      <a
        className="hero__offline-mark"
        href={kickUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Kick"
      >
        <img src="/img/brand/kick-logo.svg" alt="" width={80} height={26} />
      </a>
    </div>
  );
}

interface KickStreamPlayerProps {
  channel?: string;
  kickUrl?: string;
  channelName?: string;
  className?: string;
}

export function KickStreamPlayer({
  channel = site.kickChannel,
  kickUrl = site.kickUrl,
  channelName = site.channelName,
  className = "hero__player",
}: KickStreamPlayerProps) {
  const kickPlayer = useKickPlayer(channel);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const isKickPending = kickPlayer === "pending";
  const isKickOffline = kickPlayer === "offline";
  const kickCover = isKickPending || isKickOffline;
  const showPlayerSkeleton = isKickPending || (!isKickOffline && !iframeLoaded);

  useEffect(() => {
    setIframeLoaded(false);
  }, [channel]);

  useEffect(() => {
    if (kickCover || iframeLoaded) return;
    const fallback = window.setTimeout(() => setIframeLoaded(true), 3500);
    return () => window.clearTimeout(fallback);
  }, [kickCover, iframeLoaded]);

  if (!channel) return null;

  return (
    <div className={className}>
      {!kickCover && (
        <iframe
          src={`https://player.kick.com/${encodeURIComponent(channel)}?autoplay=true&muted=true`}
          title={`${channelName} live on Kick`}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          onLoad={() => setIframeLoaded(true)}
        />
      )}
      {isKickOffline && <KickOfflineCard kickUrl={kickUrl} channelName={channelName} />}
      {showPlayerSkeleton && (
        <div className="hero__player-skel skel-overlay skel-overlay--dark" aria-hidden="true">
          <span className="hero__player-skel-status skel" />
          <span className="hero__player-skel-mark skel" />
        </div>
      )}
    </div>
  );
}
