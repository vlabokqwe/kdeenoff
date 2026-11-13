import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { reduceMotion } from "../lib/format";
import { useUi } from "../state/ui";

export interface RevealOptions {
  threshold?: number;
  rootMargin?: string;
}

export interface ScrollFocusOptions {
  revealThreshold?: number;
  enterRatio?: number;
  enterPx?: number;
  stayRatio?: number;
  stayPx?: number;
  initialOpenDelayMs?: number;
  reenterOpenDelayMs?: number;
  staggerMs?: number;
  rootMargin?: string;
}

export interface ScrollFocusState<T extends Element> {
  ref: RefObject<T | null>;
  shown: boolean;
  opened: boolean;
  unlock: () => void;
}

const FOCUS_THRESHOLDS = [0, 0.08, 0.14, 0.2, 0.24, 0.32, 0.42, 0.55, 0.75];

/**
 * Scroll reveal for `[data-reveal]` blocks: becomes true once the element enters the viewport
 * after the brand loading curtain starts lifting (immediately with reduced motion).
 * Add `is-in` to the element's class when it is true.
 */
export function useReveal<T extends Element>(
  options?: RevealOptions,
): [RefObject<T | null>, boolean] {
  const { loaderCovering } = useUi();
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(reduceMotion);
  const threshold = options?.threshold ?? 0.16;
  const rootMargin = options?.rootMargin ?? "0px 0px -6% 0px";

  useEffect(() => {
    const el = ref.current;
    if (shown || loaderCovering || !el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, loaderCovering, threshold, rootMargin]);

  return [ref, shown];
}

/**
 * Reversible step-card style blur/focus (`is-open`) paired with one-time entrance (`is-in`):
 * - `shown` turns true once on first viewport arrival (`is-in`).
 * - `opened` turns true shortly after entering (`is-open`, clearing blur), and resets to false
 *   whenever the element scrolls out of view so scrolling back reveals the blur again.
 */
export function useScrollFocus<T extends Element>(
  options?: ScrollFocusOptions,
): ScrollFocusState<T> {
  const { loaderCovering } = useUi();
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(reduceMotion);
  const [visible, setVisible] = useState(reduceMotion);
  const [opened, setOpened] = useState(reduceMotion);
  const [pageHidden, setPageHidden] = useState(
    () => typeof document !== "undefined" && document.hidden,
  );

  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const openedOnceRef = useRef(false);

  const revealThreshold = options?.revealThreshold ?? 0.14;
  const enterRatio = options?.enterRatio ?? 0.36;
  const enterPx = options?.enterPx ?? 200;
  const stayRatio = options?.stayRatio ?? 0.2;
  const stayPx = options?.stayPx ?? 115;
  const initialOpenDelayMs = options?.initialOpenDelayMs ?? 340;
  const reenterOpenDelayMs = options?.reenterOpenDelayMs ?? 280;
  const staggerMs = options?.staggerMs ?? 0;
  const rootMargin = options?.rootMargin ?? "-56px 0px -6% 0px";

  const unlock = useCallback(() => {
    if (reduceMotion) return;
    visibleRef.current = true;
    openedOnceRef.current = true;
    if (!shownRef.current) {
      shownRef.current = true;
      setShown(true);
    }
    setVisible(true);
    setOpened(true);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const onVisibility = () => setPageHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      setShown(true);
      setVisible(true);
      setOpened(true);
      return;
    }

    if (loaderCovering) {
      visibleRef.current = false;
      setVisible(false);
      setOpened(false);
      return;
    }

    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      shownRef.current = true;
      visibleRef.current = true;
      setShown(true);
      setVisible(true);
      setOpened(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        const ratio = entry.intersectionRatio;
        const visiblePx = entry.intersectionRect.height;

        if (!shownRef.current && entry.isIntersecting && (ratio >= revealThreshold || visiblePx >= 72)) {
          shownRef.current = true;
          setShown(true);
        }

        const wasVisible = visibleRef.current;
        const nowVisible = wasVisible
          ? entry.isIntersecting && (ratio >= stayRatio || visiblePx >= stayPx)
          : entry.isIntersecting && (ratio >= enterRatio || visiblePx >= enterPx);

        if (nowVisible !== wasVisible) {
          visibleRef.current = nowVisible;
          setVisible(nowVisible);
          if (!nowVisible) {
            setOpened(false);
          }
        }
      },
      { rootMargin, threshold: FOCUS_THRESHOLDS },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [loaderCovering, revealThreshold, enterRatio, enterPx, stayRatio, stayPx, rootMargin]);

  useEffect(() => {
    if (reduceMotion || loaderCovering || pageHidden || !visible || opened) return;
    const baseDelay = openedOnceRef.current ? reenterOpenDelayMs : initialOpenDelayMs;
    const timer = window.setTimeout(() => {
      if (!visibleRef.current) return;
      openedOnceRef.current = true;
      setOpened(true);
    }, baseDelay + staggerMs);
    return () => window.clearTimeout(timer);
  }, [loaderCovering, pageHidden, visible, opened, initialOpenDelayMs, reenterOpenDelayMs, staggerMs]);

  return { ref, shown, opened, unlock };
}

/**
 * Above-the-fold entrance trigger synced with the brand loading screen:
 * stays false while `loaderCovering` is true, then flips true on the next painted frame
 * so hero elements animate in right as the curtain lifts (or on SPA route arrival).
 */
export function useEntranceReady(): boolean {
  const { loaderCovering } = useUi();
  const [ready, setReady] = useState(reduceMotion);

  useEffect(() => {
    if (reduceMotion) {
      setReady(true);
      return;
    }
    if (loaderCovering) {
      setReady(false);
      return;
    }
    let raf1 = 0;
    let raf2 = 0;
    let settleTimer = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setReady(true);
        settleTimer = window.setTimeout(() => {
          window.dispatchEvent(new Event("resize"));
        }, 820);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(settleTimer);
    };
  }, [loaderCovering]);

  return ready;
}

/**
 * Staggered reveal for lists painted from the API (raffle and case cards):
 * true one frame after `key` changes, so the cards animate in with their `--i` index.
 */
export function useNextFrameReveal(key: unknown): boolean {
  const [revealed, setRevealed] = useState<unknown>(undefined);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setRevealed(() => key));
    return () => cancelAnimationFrame(raf);
  }, [key]);
  return revealed === key;
}
