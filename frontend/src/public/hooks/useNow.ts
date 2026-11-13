import { useSyncExternalStore } from "react";

/**
 * One shared 1s ticker for every countdown on the page (was `onTick` in boards-api.js).
 * Components that call `useNow()` re-render once a second with the current time.
 */
const listeners = new Set<() => void>();
let now = Date.now();
let handle = 0;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!handle) {
    now = Date.now();
    handle = window.setInterval(() => {
      now = Date.now();
      listeners.forEach((fn) => fn());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && handle) {
      window.clearInterval(handle);
      handle = 0;
    }
  };
}

function getSnapshot(): number {
  return now;
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
