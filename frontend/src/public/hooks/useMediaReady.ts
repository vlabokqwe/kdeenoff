import { useCallback, useLayoutEffect, useRef, useState } from "react";

export interface ImgReadyState {
  ref: React.RefObject<HTMLImageElement | null>;
  ready: boolean;
  onLoad: () => void;
  onError: () => void;
}

/**
 * Tracks whether an <img> has finished loading (or failed), checking `.complete`
 * synchronously before paint so cached images never flash a skeleton.
 */
export function useImgReady(src: string | undefined): ImgReadyState {
  const ref = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState<boolean>(!src);

  useLayoutEffect(() => {
    if (!src) {
      setReady(true);
      return;
    }
    const el = ref.current;
    if (el && el.complete) {
      setReady(true);
      return;
    }
    setReady(false);
  }, [src]);

  const markReady = useCallback(() => {
    setReady(true);
  }, []);

  return {
    ref,
    ready,
    onLoad: markReady,
    onError: markReady,
  };
}

/**
 * Tracks whether a background / poster image URL has finished downloading,
 * checking `Image.complete` synchronously before paint to avoid flashes on cache hits.
 */
export function usePosterReady(url: string | undefined): boolean {
  const [ready, setReady] = useState<boolean>(!url);

  useLayoutEffect(() => {
    if (!url) {
      setReady(true);
      return;
    }
    const probe = new Image();
    probe.src = url;
    if (probe.complete) {
      setReady(true);
      return;
    }
    setReady(false);
    let alive = true;
    const done = () => {
      if (alive) setReady(true);
    };
    probe.addEventListener("load", done, { once: true });
    probe.addEventListener("error", done, { once: true });
    return () => {
      alive = false;
      probe.removeEventListener("load", done);
      probe.removeEventListener("error", done);
    };
  }, [url]);

  return ready;
}
