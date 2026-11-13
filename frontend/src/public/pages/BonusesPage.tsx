import { useEffect, useRef } from "react";
import { partnerCode, site } from "../../shared/site";
import { useCopy } from "../hooks/useCopy";
import { useImgReady } from "../hooks/useMediaReady";
import { usePageMeta } from "../hooks/usePageMeta";
import { reduceMotion } from "../lib/format";

const HERO_SCENE_SRC = "/img/bg/bonus-scene.webp?v=2";
const HERO_KICKER_SRC = "/img/deco/bonus-claim.webp?v=2";
const HERO_WORD_SRC = "/img/deco/bonus-word.webp?v=2";
const VAMP_BG_SRC = "/img/partners/vamp-card-bg.webp";
const VAMP_MASCOT_POSTER = "/img/partners/vamp-raccoon.webp?v=3";
const VAMP_MASCOT_VIDEO = "/img/partners/vamp-raccoon.webm?v=4";
const VAMP_WORDMARK_SRC = "/img/partners/500-wordmark-vampire.webp";

function VampireBatCrest() {
  return (
    <div className="vamp-card__crest" aria-hidden="true">
      <svg viewBox="0 0 260 68" focusable="false">
        {/* Left & right carved gothic stone wings */}
        <path
          d="M130,44 L96,24 L62,18 L24,28 L6,44 C26,42 42,46 54,56 C68,48 84,50 96,58 L130,54 Z"
          fill="#433e5c"
          stroke="#0e0916"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <path
          d="M130,44 L164,24 L198,18 L236,28 L254,44 C234,42 218,46 206,56 C192,48 176,50 164,58 L130,54 Z"
          fill="#433e5c"
          stroke="#0e0916"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        {/* Wing top bevel highlights */}
        <path
          d="M95,27 L63,21.5 L28,30.5"
          fill="none"
          stroke="#6b648c"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M165,27 L197,21.5 L232,30.5"
          fill="none"
          stroke="#6b648c"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* Wing rib lines */}
        <path
          d="M94,26 L94,55 M63,21 L55,53 M166,26 L166,55 M197,21 L205,53"
          fill="none"
          stroke="#1d182b"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        {/* Central stone bat gargoyle medallion (matching Le Vampire slot top emblem) */}
        <path
          d="M104,58 L104,26 L112,8 L122,22 C127,20 133,20 138,22 L148,8 L156,26 L156,58 Z"
          fill="#524c6e"
          stroke="#0e0916"
          strokeWidth="3.6"
          strokeLinejoin="round"
        />
        <path
          d="M112,13 L119,25 C126,23 134,23 141,25 L148,13"
          fill="none"
          stroke="#7b749e"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Bat gargoyle fanged grin mouth */}
        <path
          d="M113,44 C118,34 142,34 147,44 C143,53 117,53 113,44 Z"
          fill="#1b1526"
          stroke="#0e0916"
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
        <polygon points="118,39 122,47 125,38" fill="#dfd9ee" stroke="#0e0916" strokeWidth="1.6" />
        <polygon points="142,39 138,47 135,38" fill="#dfd9ee" stroke="#0e0916" strokeWidth="1.6" />
        {/* Glowing crimson stone eyes */}
        <circle cx="121" cy="30" r="3" fill="#ff2a3c" stroke="#0e0916" strokeWidth="1.6" />
        <circle cx="139" cy="30" r="3" fill="#ff2a3c" stroke="#0e0916" strokeWidth="1.6" />
      </svg>
    </div>
  );
}

function VampireCornerFang({
  pos,
}: {
  pos: "tl" | "tr" | "bl" | "br";
}) {
  const flipX = pos === "tr" || pos === "br";
  const flipY = pos === "bl" || pos === "br";
  const transform = [
    flipX ? "translate(64, 0) scale(-1, 1)" : "",
    flipY ? "translate(0, 76) scale(1, -1)" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      className={`vamp-card__fang vamp-card__fang--${pos}`}
      viewBox="0 0 64 76"
      aria-hidden="true"
      focusable="false"
    >
      <g transform={transform || undefined}>
        {/* Curved gothic stone fang corbel (from Le Vampire slot frame corners) */}
        <path
          d="M2,2 H54 C46,16 40,26 36,42 C31,56 22,68 10,73 C6,52 2,28 2,2 Z"
          fill="#4b4566"
          stroke="#0e0916"
          strokeWidth="3.4"
          strokeLinejoin="round"
        />
        <path
          d="M6,6 H46 C40,16 35,25 31,39 L13,66 C9,47 6,25 6,6 Z"
          fill="#625b82"
        />
        <path
          d="M28,44 C24,55 18,64 10,70 C14,56 18,41 20,24 Z"
          fill="#322d47"
        />
        {/* Weathered stone crack */}
        <path
          d="M24,6 L20,16 L25,22"
          fill="none"
          stroke="#1b1528"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

function BatBulletIcon() {
  return (
    <svg className="vamp-card__go-bat" viewBox="0 0 32 20" aria-hidden="true" focusable="false">
      <path
        d="M16,6 L12,1 L10,6 L2,3 L5,11 C8,10 10,12 12,15 L16,12 L20,15 C22,12 24,10 27,11 L30,3 L22,6 L20,1 Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function BonusesPage() {
  usePageMeta({ title: "Bonuses", pageClass: "site--bonuses" });

  const partner = site.partners[0];
  const code = partner ? partnerCode(partner) : site.promoCode;
  const { copied, copy } = useCopy(code);

  const heroSceneImg = useImgReady(HERO_SCENE_SRC);
  const kickerImg = useImgReady(HERO_KICKER_SRC);
  const wordImg = useImgReady(HERO_WORD_SRC);
  const cardBgImg = useImgReady(VAMP_BG_SRC);
  const mascotImg = useImgReady(VAMP_MASCOT_POSTER);
  const wordmarkImg = useImgReady(VAMP_WORDMARK_SRC);

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
      void video.play().then(mark).catch(() => {});
    };
    if (video.readyState >= 2) start();
    else video.addEventListener("loadeddata", start, { once: true });
    video.load();
    return () => {
      video.removeEventListener("playing", mark);
      video.removeEventListener("loadeddata", start);
    };
  }, []);

  const bonuses = partner?.bonuses ?? [];

  return (
    <section className="bonus-hero" aria-labelledby="bonus-title">
      {!heroSceneImg.ready && <i className="skel-overlay skel-overlay--dark" aria-hidden="true" />}
      <img
        ref={heroSceneImg.ref}
        className={`bonus-hero__scene${!heroSceneImg.ready ? " is-media-pending" : ""}`}
        src={HERO_SCENE_SRC}
        alt=""
        width={3840}
        height={2160}
        onLoad={heroSceneImg.onLoad}
        onError={heroSceneImg.onError}
      />
      <div className="container bonus-hero__stage">
        <div className="bonus-hero__copy">
          <h1 className="title" id="bonus-title">
            {!kickerImg.ready && (
              <span className="bonus-hero__mark-skel bonus-hero__mark-skel--kicker skel" aria-hidden="true" />
            )}
            <img
              ref={kickerImg.ref}
              className={`bonus-hero__mark bonus-hero__mark--kicker${!kickerImg.ready ? " is-media-pending" : ""}`}
              src={HERO_KICKER_SRC}
              alt=""
              width={4000}
              height={817}
              onLoad={kickerImg.onLoad}
              onError={kickerImg.onError}
            />
            {!wordImg.ready && (
              <span className="bonus-hero__mark-skel bonus-hero__mark-skel--win skel" aria-hidden="true" />
            )}
            <img
              ref={wordImg.ref}
              className={`bonus-hero__mark bonus-hero__mark--win${!wordImg.ready ? " is-media-pending" : ""}`}
              src={HERO_WORD_SRC}
              alt=""
              width={4000}
              height={1194}
              onLoad={wordImg.onLoad}
              onError={wordImg.onError}
            />
            <span className="sr-only">Claim your bonus</span>
          </h1>

          {partner && (
            <article
              className="vamp-card"
              data-partner={partner.theme || "stake"}
              aria-label={`${partner.name} bonus offer`}
            >
              <VampireBatCrest />

              <div className="vamp-card__bezel">
                <VampireCornerFang pos="tl" />
                <VampireCornerFang pos="tr" />
                <VampireCornerFang pos="bl" />
                <VampireCornerFang pos="br" />

                <div className="vamp-card__stage">
                  {!cardBgImg.ready && (
                    <i className="skel-overlay skel-overlay--dark" aria-hidden="true" />
                  )}
                  <img
                    ref={cardBgImg.ref}
                    className={`vamp-card__bg${!cardBgImg.ready ? " is-media-pending" : ""}`}
                    src={VAMP_BG_SRC}
                    alt=""
                    width={2200}
                    height={1228}
                    decoding="async"
                    onLoad={cardBgImg.onLoad}
                    onError={cardBgImg.onError}
                  />
                  <div className="vamp-card__veil" aria-hidden="true" />

                  <div ref={mascotRef} className="vamp-card__mascot" aria-hidden="true">
                    <img
                      ref={mascotImg.ref}
                      className={!mascotImg.ready ? "is-media-pending" : undefined}
                      src={VAMP_MASCOT_POSTER}
                      alt=""
                      width={1918}
                      height={2000}
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
                        poster={VAMP_MASCOT_POSTER}
                        src={VAMP_MASCOT_VIDEO}
                      />
                    )}
                  </div>

                  <div className="vamp-card__copy">
                    <div className="vamp-card__brand">
                      <h2 className="vamp-card__name">
                        {!wordmarkImg.ready && (
                          <span className="vamp-card__logo-skel skel" aria-hidden="true" />
                        )}
                        <img
                          ref={wordmarkImg.ref}
                          className={!wordmarkImg.ready ? "is-media-pending" : undefined}
                          src={VAMP_WORDMARK_SRC}
                          alt={partner.name}
                          width={1444}
                          height={1021}
                          decoding="async"
                          onLoad={wordmarkImg.onLoad}
                          onError={wordmarkImg.onError}
                        />
                      </h2>
                    </div>

                    {bonuses.length > 0 && (
                      <ul className="vamp-card__perks" aria-label="Included bonuses">
                        {bonuses.map((perk) => (
                          <li key={perk.type} className="vamp-card__perk" data-perk={perk.type}>
                            <strong className="vamp-card__perk-val">{perk.value}</strong>
                            <span className="vamp-card__perk-lbl">{perk.label}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="vamp-card__actions">
                      <button
                        type="button"
                        className={`vamp-card__code${copied ? " is-copied" : ""}`}
                        data-copy={code}
                        aria-label={`Copy promo code ${code}`}
                        onClick={() => void copy()}
                      >
                        <img src="/img/icons/nav-copy.webp" alt="" width={26} height={26} />
                        <span className="vamp-card__code-copy">
                          <span className="vamp-card__code-kicker">Referral code</span>
                          <span className="vamp-card__code-value">{code}</span>
                        </span>
                        <span
                          className="vamp-card__code-toast"
                          data-copy-status
                          aria-live="polite"
                        >
                          {copied ? "Copied!" : ""}
                        </span>
                      </button>

                      <a
                        className="vamp-card__go"
                        href={partner.url}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                      >
                        <BatBulletIcon />
                        <span className="vamp-card__go-label">
                          {partner.cta || `Claim on ${partner.name}`}
                        </span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}
