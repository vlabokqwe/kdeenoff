import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getJson } from "../lib/api";
import type { Account } from "../lib/types";

export type SessionStatus = "loading" | "ready" | "error";

export interface SessionValue {
  /** `loading` until /api/kick/me answers; `error` if it failed. */
  status: SessionStatus;
  /** The /api/kick/me payload (email + Kick link), or null when unknown. */
  account: Account | null;
  /** Confirmed email or linked Kick account. */
  signedIn: boolean;
  /** Bumped every time an account payload is applied (initial load, sign-in, local preview). */
  accountRev: number;
  /** Replace the account everywhere (was the `kdeenoff-account` event). */
  applyAccount: (account: Account | null) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function isSignedIn(account: Account | null | undefined): boolean {
  return Boolean(account && ((account.emailVerified && account.email) || account.linked));
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [account, setAccount] = useState<Account | null>(null);
  const [accountRev, setAccountRev] = useState(0);
  const seq = useRef(0);

  const applyAccount = useCallback((next: Account | null) => {
    seq.current += 1;
    setStatus("ready");
    setAccount(next);
    setAccountRev((n) => n + 1);
  }, []);

  useEffect(() => {
    const mine = ++seq.current;
    const ctrl = new AbortController();
    getJson<Account>("/api/kick/me", { signal: ctrl.signal })
      .then((data) => {
        if (mine !== seq.current) return;
        setStatus("ready");
        setAccount(data);
        setAccountRev((n) => n + 1);
      })
      .catch(() => {
        if (ctrl.signal.aborted || mine !== seq.current) return;
        setStatus("error");
        setAccount(null);
        setAccountRev((n) => n + 1);
      });
    return () => ctrl.abort();
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      account,
      signedIn: isSignedIn(account),
      accountRev,
      applyAccount,
    }),
    [status, account, accountRev, applyAccount],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession outside SessionProvider");
  return value;
}
