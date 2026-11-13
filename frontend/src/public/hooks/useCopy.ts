import { useCallback, useEffect, useRef, useState } from "react";

/** Clipboard write with the old textarea fallback for browsers without the async API. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;left:-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

/**
 * Copy button state (was `[data-copy]` in main.js): `copied` is true for 1.8s after a copy,
 * during which the button gets `is-copied` and its status reads "Copied!".
 */
export function useCopy(code: string): { copied: boolean; copy: () => Promise<void> } {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    if (!code) return;
    await copyText(code);
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  }, [code]);

  return { copied, copy };
}
