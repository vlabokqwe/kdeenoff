import { useCallback, useEffect, useRef, useState } from "react";

export type StatusType = "success" | "error";

export interface StatusState {
  text: string;
  type: StatusType;
  visible: boolean;
}

/**
 * Status message box (legacy `showStatus`): shows `adm-status adm-status--<type>`
 * with the text and hides it again after 4 seconds.
 */
export function useStatus(): [StatusState | null, (text: string, type?: StatusType) => void] {
  const [status, setStatus] = useState<StatusState | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((text: string, type: StatusType = "success") => {
    window.clearTimeout(timer.current);
    setStatus({ text, type, visible: true });
    timer.current = window.setTimeout(() => {
      setStatus((s) => (s ? { ...s, visible: false } : s));
    }, 4000);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return [status, show];
}
