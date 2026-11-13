import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { useSession } from "../state/session";
import { useUi } from "../state/ui";

const FILL_DURATION_MS = 1650;
const MAX_WAIT_SESSION_MS = 3600;
const MAX_WAIT_ASSET_MS = 180;
const HOLD_FULL_MS = 160;
const EXIT_MS = 440;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function HeaderLogoLockup({ imgRef }: { imgRef?: RefObject<HTMLImageElement | null> }) {
  return (
    <div className="loader-screen__lockup">
      <img
        ref={imgRef}
        src="/img/brand/mark-muzzle.png"
        alt=""
        width={37}
        height={26}
        decoding="sync"
        fetchPriority="high"
      />
      <span className="loader-screen__word">KDEENOFF</span>
    </div>
  );
}

export function LoadingScreen() {
  const { status: sessionStatus } = useSession();
  const { loaderRun, loaderMode, startLoaderLeave, finishLoader } = useUi();

  const sessionReadyRef = useRef(sessionStatus !== "loading");
  sessionReadyRef.current = sessionStatus !== "loading";

  const logoRef = useRef<HTMLDivElement | null>(null);
  const markImgRef = useRef<HTMLImageElement | null>(null);
  const pctRunRef = useRef(0);
  const pctRef = useRef(0);
  const [leavingRun, setLeavingRun] = useState(0);

  if (pctRunRef.current !== loaderRun) {
    pctRunRef.current = loaderRun;
    pctRef.current = 0;
  }

  const leaving = loaderRun > 0 && leavingRun === loaderRun;

  useEffect(() => {
    if (!loaderRun) return;

    const activeRun = loaderRun;
    let cancelled = false;
    let left = false;
    let rafId = 0;
    let assetTimer = 0;
    let holdTimer = 0;
    const waitForSession = loaderMode === "initial";

    const applyPct = (pct: number) => {
      pctRef.current = pct;
      logoRef.current?.style.setProperty("--loader-pct", `${pct.toFixed(2)}%`);
    };

    applyPct(0);

    const beginLeave = () => {
      if (left || cancelled) return;
      left = true;
      setLeavingRun(activeRun);
      startLoaderLeave(activeRun);
    };

    const startAnimation = () => {
      if (cancelled) return;
      rafId = requestAnimationFrame((firstNow) => {
        if (cancelled) return;
        const startedAt = firstNow;
        let lastNow = firstNow;
        let shownPct = 0;

        const tick = (now: number) => {
          if (cancelled) return;
          const dt = Math.max(0, now - lastNow);
          lastNow = now;
          const elapsed = Math.max(0, now - startedAt);
          const raw = Math.min(1, elapsed / FILL_DURATION_MS);
          const eased = easeInOutCubic(raw) * 100;

          const sessionDone =
            !waitForSession || sessionReadyRef.current || elapsed >= MAX_WAIT_SESSION_MS;
          const targetPct = !sessionDone ? Math.min(92, eased) : eased;

          if (raw >= 1 && sessionDone && shownPct < 99.9) {
            shownPct = Math.min(100, shownPct + Math.max(1.2, (dt / 180) * 8));
          } else {
            shownPct = Math.max(shownPct, targetPct);
          }

          applyPct(shownPct);

          if (raw >= 1 && sessionDone && shownPct >= 99.9) {
            applyPct(100);
            holdTimer = window.setTimeout(() => {
              beginLeave();
            }, HOLD_FULL_MS);
            return;
          }

          rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
      });
    };

    const img = markImgRef.current;
    let started = false;
    const runOnce = () => {
      if (started || cancelled) return;
      started = true;
      window.clearTimeout(assetTimer);
      startAnimation();
    };

    if (!img || (img.complete && img.naturalWidth > 0)) {
      runOnce();
    } else {
      assetTimer = window.setTimeout(runOnce, MAX_WAIT_ASSET_MS);
      if (typeof img.decode === "function") {
        img.decode().then(runOnce, runOnce);
      } else {
        img.addEventListener("load", runOnce, { once: true });
        img.addEventListener("error", runOnce, { once: true });
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.clearTimeout(assetTimer);
      window.clearTimeout(holdTimer);
      applyPct(100);
      setLeavingRun(activeRun);
      startLoaderLeave(activeRun);
    };
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.clearTimeout(assetTimer);
      window.clearTimeout(holdTimer);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [loaderRun, loaderMode, startLoaderLeave]);

  useEffect(() => {
    if (!loaderRun || !leaving) return;
    const activeRun = loaderRun;
    const timer = window.setTimeout(() => {
      finishLoader(activeRun);
    }, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [loaderRun, leaving, finishLoader]);

  if (!loaderRun) return null;

  return (
    <div
      className={`loader-screen${leaving ? " is-leaving" : ""}`}
      data-loader-screen=""
      role="status"
      aria-live="polite"
      aria-label="Loading KDeenOff"
    >
      <div
        ref={logoRef}
        className="loader-screen__logo"
        style={{ "--loader-pct": `${pctRef.current.toFixed(2)}%` } as CSSProperties}
        aria-hidden="true"
      >
        <div className="loader-screen__layer loader-screen__layer--base">
          <HeaderLogoLockup imgRef={markImgRef} />
        </div>
        <div className="loader-screen__layer loader-screen__layer--fill">
          <HeaderLogoLockup />
        </div>
      </div>
    </div>
  );
}
