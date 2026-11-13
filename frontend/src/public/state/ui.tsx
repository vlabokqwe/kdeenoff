import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { invalidateBoardsCache, invalidateSiteSettingsCache } from "../lib/boards";
import { reduceMotion } from "../lib/format";

const MENU_KEY = "kdeenoff-menu";
const CHAT_KEY = "kdeenoff-chat";
const DATA_REV_KEY = "kdeenoff-data-rev";
const ADMIN_CHANNEL = "kdeenoff-admin";

export type HomeSection = "home" | "bonus" | "contacts";
export type LoaderMode = "initial" | "demo";
export type AdminTab = "overview" | "leaderboards" | "raffles" | "users" | "settings" | "audit";
export type RaffleModalKind = "joined" | "kick-required";
export type AuthModalMode = "login" | "register";

export interface RaffleModalState {
  kind: RaffleModalKind;
  raffleId?: number;
  raffleTitle?: string;
  rafflePrize?: string;
}

export interface OpenAdminOptions {
  tab?: AdminTab;
  boardSlug?: string | null;
}

export interface UiValue {
  /** Left drawer expanded (`body.drawer-open`), remembered per tab. */
  drawerOpen: boolean;
  /** True once the drawer was set at least once (the toggle label switches from "Open menu"). */
  drawerTouched: boolean;
  /** The drawer scrim shows only for an open drawer on narrow screens (checked when toggled). */
  scrimVisible: boolean;
  setDrawer: (open: boolean) => void;
  /** Kick chat column (`body.chat-open`); the first value comes from the pre-paint script. */
  chatOpen: boolean;
  setChat: (open: boolean) => void;
  /** Home scrollspy: which section is in the middle of the screen. */
  homeSection: HomeSection;
  setHomeSection: (section: HomeSection) => void;
  /** Active loading screen run (> 0 while visible; incremented on each replay). */
  loaderRun: number;
  /** True while the opaque brand loading screen still covers the viewport (before fade-out begins). */
  loaderCovering: boolean;
  loaderMode: LoaderMode;
  playLoader: () => void;
  startLoaderLeave: (run: number) => void;
  finishLoader: (run: number) => void;
  /** Full-screen interactive Admin Dashboard modal state. */
  adminOpen: boolean;
  adminTab: AdminTab;
  adminBoardSlug: string | null;
  openAdmin: (options?: OpenAdminOptions) => void;
  closeAdmin: () => void;
  setAdminTab: (tab: AdminTab) => void;
  setAdminBoardSlug: (slug: string | null) => void;
  /** Raffle participation onboarding / confirmation modals. */
  raffleModal: RaffleModalState | null;
  openRaffleModal: (modal: RaffleModalState) => void;
  closeRaffleModal: () => void;
  /** Email sign-in / sign-up dialog (`.auth-dialog`). */
  authModal: AuthModalMode | null;
  openAuthModal: (mode?: AuthModalMode) => void;
  closeAuthModal: () => void;
  /** Bumped whenever admin dashboard mutates boards/raffles/settings so live pages refresh. */
  dataRev: number;
  bumpDataRev: () => void;
}

const UiContext = createContext<UiValue | null>(null);

function storedMenu(): boolean {
  try {
    return sessionStorage.getItem(MENU_KEY) === "1";
  } catch {
    return false;
  }
}

export function UiProvider({ children }: { children: ReactNode }) {
  const initialDrawer = useRef(storedMenu()).current;
  const loaderSeq = useRef(reduceMotion ? 0 : 1);
  const leaveTimer = useRef(0);
  const collapseTimer = useRef(0);
  const scrimTimer = useRef(0);
  const chatResizeTimer = useRef(0);
  const [drawerOpen, setDrawerOpen] = useState(initialDrawer);
  const [drawerTouched, setDrawerTouched] = useState(initialDrawer);
  const [scrimVisible, setScrimVisible] = useState(false);
  const [chatOpen, setChatOpen] = useState(() => document.body.classList.contains("chat-open"));
  const [homeSection, setHomeSection] = useState<HomeSection>("home");
  const [loaderRun, setLoaderRun] = useState<number>(() => (reduceMotion ? 0 : 1));
  const [leavingRun, setLeavingRun] = useState<number>(0);
  const [loaderMode, setLoaderMode] = useState<LoaderMode>("initial");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminTab>("overview");
  const [adminBoardSlug, setAdminBoardSlug] = useState<string | null>(null);
  const [raffleModal, setRaffleModal] = useState<RaffleModalState | null>(null);
  const [authModal, setAuthModal] = useState<AuthModalMode | null>(null);
  const [dataRev, setDataRev] = useState(0);

  const openAdmin = useCallback((options?: OpenAdminOptions) => {
    if (options?.tab) setAdminTab(options.tab);
    if (options?.boardSlug !== undefined) setAdminBoardSlug(options.boardSlug);
    setAdminOpen(true);
  }, []);

  const closeAdmin = useCallback(() => {
    setAdminOpen(false);
  }, []);

  const openRaffleModal = useCallback((modal: RaffleModalState) => {
    setRaffleModal(modal);
  }, []);

  const closeRaffleModal = useCallback(() => {
    setRaffleModal(null);
  }, []);

  const openAuthModal = useCallback((mode: AuthModalMode = "register") => {
    setAuthModal(mode === "login" ? "login" : "register");
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModal(null);
  }, []);

  const bumpDataRev = useCallback(() => {
    setDataRev((n) => n + 1);
  }, []);

  useEffect(() => {
    let lastFocusRefresh = 0;
    const syncLiveData = () => {
      invalidateBoardsCache();
      invalidateSiteSettingsCache();
      setDataRev((n) => n + 1);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === DATA_REV_KEY) syncLiveData();
    };
    const onFocus = () => {
      const now = Date.now();
      if (now - lastFocusRefresh < 1500) return;
      lastFocusRefresh = now;
      syncLiveData();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        bc = new BroadcastChannel(ADMIN_CHANNEL);
        bc.onmessage = () => syncLiveData();
      }
    } catch {
      bc = null;
    }

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      try {
        bc?.close();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const playLoader = useCallback(() => {
    const next = ++loaderSeq.current;
    setLoaderMode("demo");
    setLoaderRun(next);
  }, []);

  const startLoaderLeave = useCallback((run: number) => {
    setLeavingRun((cur) => (run > cur ? run : cur));
  }, []);

  const finishLoader = useCallback((run: number) => {
    setLoaderRun((cur) => (cur === run ? 0 : cur));
  }, []);

  const loaderCovering = loaderRun > 0 && leavingRun !== loaderRun;

  useEffect(() => {
    document.body.classList.remove("site-booting");
  }, []);

  useEffect(() => {
    document.body.classList.toggle("site-loading", loaderRun > 0);
    return () => {
      document.body.classList.remove("site-loading");
    };
  }, [loaderRun]);

  useEffect(
    () => () => {
      window.clearTimeout(leaveTimer.current);
      window.clearTimeout(collapseTimer.current);
      window.clearTimeout(scrimTimer.current);
      window.clearTimeout(chatResizeTimer.current);
      document.body.classList.remove("drawer-leaving", "drawer-collapsing");
    },
    [],
  );

  const setDrawer = useCallback((open: boolean) => {
    const wasExpanded =
      document.body.classList.contains("drawer-open") &&
      !document.body.classList.contains("drawer-leaving");
    const narrow = window.matchMedia("(max-width: 800px)").matches;
    window.clearTimeout(leaveTimer.current);
    window.clearTimeout(collapseTimer.current);
    window.clearTimeout(scrimTimer.current);

    if (open) {
      document.body.classList.remove("drawer-leaving", "drawer-collapsing");
      document.body.classList.add("drawer-open");
      setScrimVisible(narrow);
    } else if (wasExpanded && !reduceMotion) {
      document.body.classList.remove("drawer-collapsing");
      document.body.classList.add("drawer-leaving");
      leaveTimer.current = window.setTimeout(() => {
        document.body.classList.remove("drawer-open", "drawer-leaving");
        void document.body.offsetWidth;
        document.body.classList.add("drawer-collapsing");
        collapseTimer.current = window.setTimeout(() => {
          document.body.classList.remove("drawer-collapsing");
        }, 950);
      }, 235);
      if (narrow) {
        scrimTimer.current = window.setTimeout(() => {
          setScrimVisible(false);
        }, 340);
      } else {
        setScrimVisible(false);
      }
    } else if (!document.body.classList.contains("drawer-leaving")) {
      document.body.classList.remove("drawer-open", "drawer-collapsing");
      setScrimVisible(false);
    }

    try {
      sessionStorage.setItem(MENU_KEY, open ? "1" : "0");
    } catch {
      /* private mode */
    }
    setDrawerTouched(true);
    setDrawerOpen(open);
  }, []);

  const setChat = useCallback((open: boolean) => {
    document.body.classList.toggle("chat-open", open);
    try {
      localStorage.setItem(CHAT_KEY, open ? "1" : "0");
    } catch {
      /* private mode */
    }
    window.dispatchEvent(new Event("resize"));
    window.clearTimeout(chatResizeTimer.current);
    if (!reduceMotion) {
      chatResizeTimer.current = window.setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 500);
    }
    setChatOpen(open);
  }, []);

  // Restore the remembered drawer, then enable the slide transition on the next frame.
  useEffect(() => {
    if (initialDrawer) setDrawer(true);
    const raf = requestAnimationFrame(() => document.body.classList.add("drawer-ready"));
    return () => cancelAnimationFrame(raf);
  }, [initialDrawer, setDrawer]);

  // Escape closes the drawer (menus that sit on top of it stop the key first).
  useEffect(() => {
    if (!drawerOpen || adminOpen || raffleModal || authModal) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawer(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen, adminOpen, raffleModal, authModal, setDrawer]);

  const value = useMemo<UiValue>(
    () => ({
      drawerOpen,
      drawerTouched,
      scrimVisible,
      setDrawer,
      chatOpen,
      setChat,
      homeSection,
      setHomeSection,
      loaderRun,
      loaderCovering,
      loaderMode,
      playLoader,
      startLoaderLeave,
      finishLoader,
      adminOpen,
      adminTab,
      adminBoardSlug,
      openAdmin,
      closeAdmin,
      setAdminTab,
      setAdminBoardSlug,
      raffleModal,
      openRaffleModal,
      closeRaffleModal,
      authModal,
      openAuthModal,
      closeAuthModal,
      dataRev,
      bumpDataRev,
    }),
    [
      drawerOpen,
      drawerTouched,
      scrimVisible,
      setDrawer,
      chatOpen,
      setChat,
      homeSection,
      loaderRun,
      loaderCovering,
      loaderMode,
      playLoader,
      startLoaderLeave,
      finishLoader,
      adminOpen,
      adminTab,
      adminBoardSlug,
      openAdmin,
      closeAdmin,
      raffleModal,
      openRaffleModal,
      closeRaffleModal,
      authModal,
      openAuthModal,
      closeAuthModal,
      dataRev,
      bumpDataRev,
    ],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiValue {
  const value = useContext(UiContext);
  if (!value) throw new Error("useUi outside UiProvider");
  return value;
}
