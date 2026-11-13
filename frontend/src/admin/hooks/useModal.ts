import { useCallback, useState } from "react";

/**
 * Open/close state for a modal plus a nonce that changes on every opening,
 * used as a React `key` to reset the modal form like the legacy `form.reset()`.
 */
export function useModal<T = undefined>() {
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<T | undefined>(undefined);

  const show = useCallback((payload?: T) => {
    setData(payload);
    setNonce((n) => n + 1);
    setOpen(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return { open, nonce, data, show, close };
}
