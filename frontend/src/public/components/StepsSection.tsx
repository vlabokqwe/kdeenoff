import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type AnimationEvent,
  type CSSProperties,
} from "react";
import { site } from "../../shared/site";
import { useCopy } from "../hooks/useCopy";
import { useScrollFocus } from "../hooks/useReveal";
import { reduceMotion } from "../lib/format";
import { useUi } from "../state/ui";

type StepIndex = 0 | 1 | 2;
const STEP_INDICES: readonly StepIndex[] = [0, 1, 2];
const INITIAL_OPEN_DELAY_MS = 900;
const REENTER_OPEN_DELAY_MS = 300;
const STEP_OPEN_GAP_MS = 1150;
const REWIND_AFTER_BLUR_MS = 560;
const ENTER_RATIO = 0.42;
const ENTER_PX = 220;
const STAY_RATIO = 0.24;
const STAY_PX = 125;

const EMAIL_LETTERS: Array<{ ch: string; w: string }> = [
  { ch: "a", w: ".62em" },
  { ch: "m", w: ".92em" },
  { ch: "y", w: ".60em" },
  { ch: "@", w: "1em" },
  { ch: "m", w: ".92em" },
  { ch: "a", w: ".62em" },
  { ch: "i", w: ".32em" },
  { ch: "l", w: ".34em" },
  { ch: ".", w: ".34em" },
  { ch: "c", w: ".58em" },
  { ch: "o", w: ".64em" },
  { ch: "m", w: ".92em" },
];

const CODE_DIGITS = ["5", "8", "2", "9", "1", "6"];

const PROMO_GLYPHS: Array<{ ch: string; w: string }> = [
  { ch: "K", w: ".78em" },
  { ch: "D", w: ".80em" },
  { ch: "E", w: ".68em" },
  { ch: "E", w: ".68em" },
  { ch: "N", w: ".82em" },
  { ch: "O", w: ".84em" },
  { ch: "F", w: ".68em" },
  { ch: "F", w: ".68em" },
];

const SIGNUP_BEATS = ["press", "email", "code"] as const;
const PROMO_BEATS = ["aim", "type", "apply"] as const;
const LIVE_BEATS = ["live", "pin", "joined"] as const;
const BEAT_COUNTS: readonly [number, number, number] = [
  SIGNUP_BEATS.length,
  PROMO_BEATS.length,
  LIVE_BEATS.length,
];

function CursorIcon({
  onAnimationEnd,
}: {
  onAnimationEnd?: (event: AnimationEvent<HTMLSpanElement>) => void;
}) {
  return (
    <span className="join-cursor" onAnimationEnd={onAnimationEnd}>
      <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden="true">
        <path
          fill="#fff"
          stroke="#121820"
          strokeWidth="1.4"
          strokeLinejoin="round"
          d="M5.2 2.4v15.6l3.9-3.9 3.2 6.3 2.5-1.3-3.2-6.2h6.2L5.2 2.4z"
        />
      </svg>
    </span>
  );
}

export function StepsList({
  active = true,
  collapsing = false,
  revealOnActive = false,
  className,
}: {
  active?: boolean;
  collapsing?: boolean;
  revealOnActive?: boolean;
  className?: string;
}) {
  const listRef = useRef<HTMLOListElement | null>(null);
  const stepRefs = useRef<[HTMLLIElement | null, HTMLLIElement | null, HTMLLIElement | null]>([
    null,
    null,
    null,
  ]);
  const { copied, copy } = useCopy(site.promoCode);
  const { openAuthModal } = useUi();

  const [shown, setShown] = useState<boolean>(reduceMotion);
  const [stepVisible, setStepVisible] = useState<readonly [boolean, boolean, boolean]>(
    reduceMotion ? [true, true, true] : [false, false, false],
  );
  const [opened, setOpened] = useState<readonly [boolean, boolean, boolean]>(
    reduceMotion ? [true, true, true] : [false, false, false],
  );
  const [pageHidden, setPageHidden] = useState<boolean>(
    () => typeof document !== "undefined" && document.hidden,
  );
  const [beats, setBeats] = useState<readonly [number, number, number]>([0, 0, 0]);

  const stepVisibleRef = useRef(stepVisible);
  stepVisibleRef.current = stepVisible;
  const openedRef = useRef(opened);
  openedRef.current = opened;
  const pendingBeatRef = useRef<[boolean, boolean, boolean]>([false, false, false]);
  const nextOpenAtRef = useRef<number>(0);
  const enterSeqRef = useRef<number>(0);
  const enteredAtRef = useRef<[number, number, number]>([0, 0, 0]);
  const rewindTimersRef = useRef<[number, number, number]>([0, 0, 0]);

  const clearRewindTimer = useCallback((idx: StepIndex) => {
    const t = rewindTimersRef.current[idx];
    if (t) {
      window.clearTimeout(t);
      rewindTimersRef.current[idx] = 0;
    }
  }, []);

  const unlockStep = useCallback(
    (idx: StepIndex) => {
      clearRewindTimer(idx);
      setStepVisible((prev) => {
        if (prev[idx]) return prev;
        const next: [boolean, boolean, boolean] = [prev[0], prev[1], prev[2]];
        next[idx] = true;
        stepVisibleRef.current = next;
        return next;
      });
      setOpened((prev) => {
        if (prev[idx]) return prev;
        const next: [boolean, boolean, boolean] = [prev[0], prev[1], prev[2]];
        next[idx] = true;
        openedRef.current = next;
        return next;
      });
    },
    [clearRewindTimer],
  );

  const lockStep = useCallback(
    (idx: StepIndex) => {
      setOpened((prev) => {
        if (!prev[idx]) return prev;
        const next: [boolean, boolean, boolean] = [prev[0], prev[1], prev[2]];
        next[idx] = false;
        openedRef.current = next;
        return next;
      });
      clearRewindTimer(idx);
      rewindTimersRef.current[idx] = window.setTimeout(() => {
        rewindTimersRef.current[idx] = 0;
        if (openedRef.current[idx]) return;
        pendingBeatRef.current[idx] = false;
        setBeats((prev) => {
          if (prev[idx] === 0) return prev;
          const next: [number, number, number] = [prev[0], prev[1], prev[2]];
          next[idx] = 0;
          return next;
        });
      }, REWIND_AFTER_BLUR_MS);
    },
    [clearRewindTimer],
  );

  const advanceBeat = useCallback((idx: StepIndex, totalBeats: number) => {
    setBeats((prev) => {
      const next: [number, number, number] = [prev[0], prev[1], prev[2]];
      next[idx] = (prev[idx] + 1) % totalBeats;
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      for (const idx of STEP_INDICES) {
        if (rewindTimersRef.current[idx]) {
          window.clearTimeout(rewindTimersRef.current[idx]);
          rewindTimersRef.current[idx] = 0;
        }
      }
    };
  }, []);

  useEffect(() => {
    const onVisibility = () => setPageHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      setShown(true);
      const allTrue: readonly [boolean, boolean, boolean] = [true, true, true];
      stepVisibleRef.current = allTrue;
      openedRef.current = allTrue;
      setStepVisible(allTrue);
      setOpened(allTrue);
      return;
    }

    if (!active) {
      setShown(false);
      const reset: readonly [boolean, boolean, boolean] = [false, false, false];
      stepVisibleRef.current = reset;
      openedRef.current = reset;
      setStepVisible(reset);
      setOpened(reset);
      setBeats([0, 0, 0]);
      pendingBeatRef.current = [false, false, false];
      for (const idx of STEP_INDICES) clearRewindTimer(idx);
      return;
    }

    const root = listRef.current;
    if (!root) return;

    let raf1 = 0;
    let raf2 = 0;
    const revealInNextFrame = () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          nextOpenAtRef.current = performance.now() + INITIAL_OPEN_DELAY_MS;
          setShown(true);
        });
      });
    };

    if (typeof IntersectionObserver === "undefined") {
      const allTrue: readonly [boolean, boolean, boolean] = [true, true, true];
      stepVisibleRef.current = allTrue;
      setStepVisible(allTrue);
      enteredAtRef.current = [1, 2, 3];
      enterSeqRef.current = 3;
      revealInNextFrame();
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }

    let revealedOnce = revealOnActive;
    if (revealOnActive) {
      revealInNextFrame();
    }

    const listIo = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((entry) => entry.isIntersecting);
        if (hit && !revealedOnce) {
          revealedOnce = true;
          revealInNextFrame();
        }
      },
      { threshold: revealOnActive ? 0 : 0.08 },
    );
    listIo.observe(root);

    const stepIo = new IntersectionObserver(
      (entries) => {
        const updates: Array<{ idx: StepIndex; entry: IntersectionObserverEntry }> = [];
        for (const entry of entries) {
          const rawIdx = stepRefs.current.indexOf(entry.target as HTMLLIElement);
          if (rawIdx === 0 || rawIdx === 1 || rawIdx === 2) {
            updates.push({ idx: rawIdx, entry });
          }
        }
        if (updates.length === 0) return;
        updates.sort((a, b) => a.idx - b.idx);

        const prevVis = stepVisibleRef.current;
        const nextVis: [boolean, boolean, boolean] = [prevVis[0], prevVis[1], prevVis[2]];
        const newlyLocked: StepIndex[] = [];
        let changed = false;

        for (const { idx, entry } of updates) {
          const ratio = entry.intersectionRatio;
          const visiblePx = entry.intersectionRect.height;
          const wasVisible = nextVis[idx];
          const nowVisible = wasVisible
            ? entry.isIntersecting && (ratio >= STAY_RATIO || visiblePx >= STAY_PX)
            : entry.isIntersecting && (ratio >= ENTER_RATIO || visiblePx >= ENTER_PX);

          if (nowVisible !== wasVisible) {
            nextVis[idx] = nowVisible;
            changed = true;
            if (nowVisible) {
              enteredAtRef.current[idx] = ++enterSeqRef.current;
            } else {
              newlyLocked.push(idx);
            }
          }
        }

        if (changed) {
          stepVisibleRef.current = nextVis;
          setStepVisible(nextVis);
          for (const idx of newlyLocked) {
            lockStep(idx);
          }
        }
      },
      {
        rootMargin: "-56px 0px -6% 0px",
        threshold: [0, 0.12, 0.2, 0.24, 0.32, 0.42, 0.55, 0.75],
      },
    );

    for (const idx of STEP_INDICES) {
      const el = stepRefs.current[idx];
      if (el) stepIo.observe(el);
    }

    return () => {
      listIo.disconnect();
      stepIo.disconnect();
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [active, revealOnActive, clearRewindTimer, lockStep]);

  useEffect(() => {
    if (reduceMotion || !active || collapsing || !shown || pageHidden) return;

    const candidates = STEP_INDICES.filter((idx) => stepVisible[idx] && !opened[idx]);
    if (candidates.length === 0) return;

    candidates.sort((a, b) => enteredAtRef.current[a] - enteredAtRef.current[b] || a - b);
    const targetIdx = candidates[0];
    const now = performance.now();
    const delay = Math.max(REENTER_OPEN_DELAY_MS, nextOpenAtRef.current - now);

    const timer = window.setTimeout(() => {
      if (!stepVisibleRef.current[targetIdx]) return;
      nextOpenAtRef.current = performance.now() + STEP_OPEN_GAP_MS;
      unlockStep(targetIdx);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [active, collapsing, shown, stepVisible, opened, pageHidden, unlockStep]);

  useEffect(() => {
    if (reduceMotion || !active || collapsing || pageHidden) return;
    for (const idx of STEP_INDICES) {
      if (stepVisible[idx] && opened[idx] && pendingBeatRef.current[idx]) {
        pendingBeatRef.current[idx] = false;
        advanceBeat(idx, BEAT_COUNTS[idx]);
      }
    }
  }, [active, collapsing, stepVisible, pageHidden, opened, advanceBeat]);

  const isStepRunning = (idx: StepIndex) =>
    !reduceMotion && active && !collapsing && stepVisible[idx] && !pageHidden && opened[idx];

  const stepClass = (idx: StepIndex) =>
    `step${shown ? " is-in" : ""}${collapsing ? " is-collapsing" : ""}${opened[idx] ? " is-open" : ""}${isStepRunning(idx) ? " is-live" : ""}`;

  const reelClass = (idx: StepIndex, modifier?: string) =>
    `join-reel${modifier ? ` ${modifier}` : ""}${isStepRunning(idx) ? "" : " is-paused"}`;

  const handleCursorEnd = (
    stepIdx: StepIndex,
    beatIdx: number,
    totalBeats: number,
    event: AnimationEvent<HTMLSpanElement>,
  ) => {
    if (event.target !== event.currentTarget) return;
    if (beats[stepIdx] !== beatIdx) return;
    if (!isStepRunning(stepIdx)) {
      pendingBeatRef.current[stepIdx] = true;
      return;
    }
    advanceBeat(stepIdx, totalBeats);
  };

  return (
    <ol ref={listRef} className={className ? `steps__list ${className}` : "steps__list"}>
      <li
        ref={(el) => {
          stepRefs.current[0] = el;
        }}
        className={stepClass(0)}
        style={{ "--step-i": 0 } as CSSProperties}
        onPointerDown={() => unlockStep(0)}
        onFocus={() => unlockStep(0)}
      >
        <div className="step__media">
          <div className={reelClass(0)} data-join-reel inert aria-hidden="true">
            {SIGNUP_BEATS.map((beat, idx) => (
              <div
                key={beat}
                className={`join-clip join-clip--${beat}${beats[0] === idx ? " is-on" : ""}`}
              >
                <div className="join-stage">
                  <div className="join-page">
                    <span className="join-ghost join-ghost--wide" />
                    <span className="join-ghost" />
                    <span className="join-ghost join-ghost--short" />
                  </div>
                  <div className="join-dim" />
                  <div className="join-bar">
                    <span className="join-brand">
                      <span className="join-burger" />
                      <img src="/img/brand/mark-muzzle.png" alt="" width={37} height={26} />
                      <span className="join-word">KDEENOFF</span>
                    </span>
                    <span className="join-auth">
                      <span className="join-login">Login</span>
                      <span className="join-register">
                        Register
                        <span className="join-ripple" />
                      </span>
                    </span>
                  </div>
                  <div className="join-sheet">
                    <p className="join-title">Create your account</p>
                    <p className="join-sub">
                      <span className="join-sub__a">We'll email you a code.</span>
                      <span className="join-sub__b">Enter the code from your email.</span>
                    </p>
                    <div className="join-slot">
                      <div className="join-field">
                        <span className="join-placeholder">Email address</span>
                        <span className="join-value">
                          {EMAIL_LETTERS.map((letter, i) => (
                            <span
                              key={i}
                              className="join-char"
                              style={{ "--w": letter.w } as CSSProperties}
                            >
                              {letter.ch}
                            </span>
                          ))}
                          <span className="join-caret" />
                        </span>
                      </div>
                      <div className="join-boxes">
                        {CODE_DIGITS.map((digit, i) => (
                          <span key={i} className="join-box">
                            <span className="join-digit">{digit}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="join-send">
                      <span className="join-send__a">Send code</span>
                      <span className="join-send__b">Confirm</span>
                    </span>
                  </div>
                  <aside className="join-mail">
                    <span className="join-mail__top">
                      <span className="join-mail__avatar">K</span>
                      <span className="join-mail__who">
                        <span className="join-mail__from">KDeenOff</span>
                        <span className="join-mail__subject">Your code</span>
                      </span>
                    </span>
                    <span className="join-mail__code">582916</span>
                  </aside>
                  <CursorIcon
                    onAnimationEnd={(e) => handleCursorEnd(0, idx, SIGNUP_BEATS.length, e)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="step__tear" aria-hidden="true" />
        <div className="step__copy">
          <span className="step__index" aria-hidden="true">
            01
          </span>
          <h3 className="step__title">Sign up on KDeenOff</h3>
          <p className="step__text">
            <button
              type="button"
              className="step__signup"
              data-auth-open="register"
              onClick={() => openAuthModal("register")}
            >
              Create your account
            </button>{" "}
            — it's your ticket to every raffle.
          </p>
        </div>
      </li>

      <li
        ref={(el) => {
          stepRefs.current[1] = el;
        }}
        className={stepClass(1)}
        style={{ "--step-i": 1 } as CSSProperties}
        onPointerDown={() => unlockStep(1)}
        onFocus={() => unlockStep(1)}
      >
        <div className="step__media">
          <div className={reelClass(1, "join-reel--promo")} data-join-reel inert aria-hidden="true">
            {PROMO_BEATS.map((beat, idx) => (
              <div
                key={beat}
                className={`join-clip join-clip--${beat}${beats[1] === idx ? " is-on" : ""}`}
              >
                <div className="join-stage">
                  <div className="join-page">
                    <span className="join-ghost join-ghost--wide" />
                    <span className="join-ghost" />
                    <span className="join-ghost join-ghost--short" />
                  </div>
                  <div className="promo-card">
                    <p className="promo-title">Promo code</p>
                    <p className="promo-sub">Add it before you play.</p>
                    <div className="promo-field">
                      <span className="promo-placeholder">Enter code</span>
                      <span className="promo-value">
                        {PROMO_GLYPHS.map((glyph, i) => (
                          <span
                            key={i}
                            className="join-char"
                            style={{ "--w": glyph.w } as CSSProperties}
                          >
                            {glyph.ch}
                          </span>
                        ))}
                        <span className="join-caret" />
                      </span>
                    </div>
                    <span className="promo-apply">
                      <span className="promo-apply__a">Apply</span>
                      <span className="promo-apply__b">Applied</span>
                      <span className="promo-ripple" />
                    </span>
                  </div>
                  <CursorIcon
                    onAnimationEnd={(e) => handleCursorEnd(1, idx, PROMO_BEATS.length, e)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="step__tear" aria-hidden="true" />
        <div className="step__copy">
          <span className="step__index" aria-hidden="true">
            02
          </span>
          <h3 className="step__title">Use code KDEENOFF</h3>
          <p className="step__text">
            Enter{" "}
            <button
              type="button"
              className={`inline-code${copied ? " is-copied" : ""}`}
              data-copy={site.promoCode}
              onClick={() => void copy()}
            >
              {site.promoCode}
              <span className="sr-only" data-copy-status>
                {copied ? "Copied!" : ""}
              </span>
            </button>{" "}
            at our partner casino and play under it.
          </p>
        </div>
      </li>

      <li
        ref={(el) => {
          stepRefs.current[2] = el;
        }}
        className={stepClass(2)}
        style={{ "--step-i": 2 } as CSSProperties}
        onPointerDown={() => unlockStep(2)}
        onFocus={() => unlockStep(2)}
      >
        <div className="step__media">
          <div className={reelClass(2, "join-reel--live")} data-join-reel inert aria-hidden="true">
            {LIVE_BEATS.map((beat, idx) => (
              <div
                key={beat}
                className={`join-clip join-clip--${beat}${beats[2] === idx ? " is-on" : ""}`}
              >
                <div className="join-stage">
                  <div className="watch-zoom">
                    <div className="watch-frame">
                      <div className="watch-player">
                        <span className="watch-glow" />
                        <span className="watch-live">Live</span>
                        <span className="watch-bar">
                          <i />
                        </span>
                      </div>
                      <div className="watch-chat">
                        <div className="watch-pin">
                          <span className="watch-pin__tag">Pinned</span>
                          <span className="watch-pin__text">Raffle draw is open</span>
                          <span className="watch-pin__link">Enter the draw</span>
                        </div>
                        <p className="watch-line">
                          <b>ace****</b> tuned in
                        </p>
                        <p className="watch-line">
                          <b>rio****</b> ready
                        </p>
                        <p className="watch-line">
                          <b>nox****</b> watching
                        </p>
                      </div>
                    </div>
                    <CursorIcon
                      onAnimationEnd={(e) => handleCursorEnd(2, idx, LIVE_BEATS.length, e)}
                    />
                  </div>
                  <div className="watch-done">
                    <span className="watch-check" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width={46} height={46}>
                        <circle
                          cx={12}
                          cy={12}
                          r={9}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        />
                        <path
                          d="M7.2 12.4 10.4 15.6 16.8 8.6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <p className="watch-done__title">You're in</p>
                    <p className="watch-done__sub">The draw has your entry.</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="step__tear" aria-hidden="true" />
        <div className="step__copy">
          <span className="step__index" aria-hidden="true">
            03
          </span>
          <h3 className="step__title">Watch the raffles on stream</h3>
          <p className="step__text">
            Winners are drawn live on{" "}
            <a href={site.kickUrl} target="_blank" rel="noopener noreferrer">
              Kick
            </a>{" "}
            — tune in so you don't miss yours.
          </p>
        </div>
      </li>
    </ol>
  );
}

export function StepsSection() {
  const { loaderCovering } = useUi();
  const headFocus = useScrollFocus<HTMLElement>({
    revealThreshold: 0.2,
    enterRatio: 0.45,
    stayRatio: 0.2,
    initialOpenDelayMs: 260,
    reenterOpenDelayMs: 220,
  });

  return (
    <section className="steps" aria-labelledby="steps-title">
      <div className="steps__bg" aria-hidden="true" />
      <div className="container">
        <header
          ref={headFocus.ref}
          className={`section-head${headFocus.shown ? " is-in" : ""}${headFocus.opened ? " is-open" : ""}`}
          data-reveal
          onPointerDown={headFocus.unlock}
        >
          <h2 className="title" id="steps-title">
            How to join <span className="accent">the raffle</span>
          </h2>
        </header>

        <StepsList active={!loaderCovering} />
      </div>
    </section>
  );
}
