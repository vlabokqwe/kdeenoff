import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { site } from "../../shared/site";
import { useImgReady } from "../hooks/useMediaReady";
import { useEntranceReady } from "../hooks/useReveal";
import { getJson, postJson } from "../lib/api";
import { accountInitial, displayName, reduceMotion, safeAvatar } from "../lib/format";
import type { Account, KickMessage, UserRole } from "../lib/types";
import { useSession } from "../state/session";
import { useUi } from "../state/ui";
import { Drawer } from "./Drawer";
import { Footer } from "./Footer";
import { LoadingScreen } from "./LoadingScreen";
import { AuthDialog } from "./AuthDialog";
import { RaffleModals } from "./RaffleModals";

const AdminDashboardModal = lazy(() => import("./admin/AdminDashboardModal"));

/* ───────────── Home scale ground ───────────── */

const HERO_BLOCK = { hexH: 300, gap: 16 };
const HERO_ANGLES = [145, 215, 325, 35];
const HERO_EMBLEMS = [
  "gift",
  "trophy",
  "ticket",
  "coin",
  "dice",
  "diamond",
  "medal",
  "star",
].map((name) => `/img/bg/glyph-${name}.webp`);

const HERO_BOX_ANCHORS = [
  ".hero__player",
  ".modes > .mode",
  ".modes > .lb-dash",
  ".step",
  ".partner-card",
  ".podium",
  ".countdown",
  ".lb-row",
  ".contact-card",
].join(",");

const HERO_TEXT_ANCHORS = [
  ".hero__copy",
  ".hero__scroll",
  ".section-head",
  ".footer__brand",
  ".footer__col",
  ".footer__bottom",
].join(",");

const HERO_TONE = {
  boxDrop: 7,
  textLift: 4,
  boxReach: 320,
  textReach: 90,
};

function heroHash(a: number, b: number, salt: number): number {
  let x = (a * 374761393 + b * 668265263 + salt * 2147483647) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function heroSmooth(edge: number, d: number): number {
  const t = Math.min(1, Math.max(0, d / edge));
  return 1 - t * t * (3 - 2 * t);
}

function heroRectDist(x: number, y: number, box: DOMRect): number {
  const dx = Math.max(box.left - x, 0, x - box.right);
  const dy = Math.max(box.top - y, 0, y - box.bottom);
  return Math.hypot(dx, dy);
}

interface GroundConfig {
  h: number;
  s: number;
  l: number;
  boxDrop: number;
  textLift: number;
}

function heroBlockTone(
  ground: GroundConfig,
  boxK: number,
  textK: number,
  col: number,
  row: number,
) {
  const dark = ground.l < 40;
  const variant = (((col + row * 2) % 3) + 3) % 3;
  const calm = 1 - textK * 0.2;
  const baseL =
    ground.l -
    ground.boxDrop * 0.18 * Math.pow(boxK, 1.2) +
    ground.textLift * 0.1 * textK;
  const h = ground.h + (heroHash(col, row, 7) - 0.5) * 4;
  const s = ground.s;

  const hsl = (hh: number, sat: number, lit: number, a = 1) =>
    `hsl(${hh.toFixed(1)} ${sat.toFixed(1)}% ${lit.toFixed(1)}% / ${a.toFixed(3)})`;

  let a: string;
  let mid: string;
  let b: string;
  let core: string;
  let rim: string;
  if (dark) {
    const shadeL = Math.max(4, baseL - 7);
    const deepL = Math.max(3, baseL - 10.5);
    const liftL = Math.min(42, baseL + 6.5);
    if (variant === 0) {
      a = hsl(h, s + 6, deepL, 0.38 * calm);
      mid = hsl(h, s + 2, shadeL, 0.12 * calm);
      b = hsl(h, s, baseL, 0);
      core = hsl(h, s, baseL, 0);
      rim = hsl(h, s + 8, deepL, 0.34 * calm);
    } else if (variant === 1) {
      a = hsl(h, s + 8, deepL, 0.76 * calm);
      mid = hsl(h, s + 4, shadeL, 0.34 * calm);
      b = hsl(h, s + 6, liftL, 0.38 * calm);
      core = hsl(h, s, baseL, 0);
      rim = hsl(h, s + 8, deepL, 0.46 * calm);
    } else {
      a = hsl(h, s + 8, deepL, 0.72 * calm);
      mid = hsl(h, s + 4, shadeL, 0.32 * calm);
      b = hsl(h, s + 4, liftL, 0.14 * calm);
      core = hsl(h, s + 8, deepL, 0.52 * calm);
      rim = hsl(h, s + 4, shadeL, 0.18 * calm);
    }
  } else {
    const shadeL = Math.max(60, baseL - 7.5);
    const deepL = Math.max(52, baseL - 12);
    const liftL = Math.min(99, baseL + 5.5);
    if (variant === 0) {
      a = hsl(h, s + 4, deepL, 0.28 * calm);
      mid = hsl(h, s, shadeL, 0.1 * calm);
      b = hsl(h, s, baseL, 0);
      core = hsl(h, s, baseL, 0);
      rim = hsl(h, s + 4, deepL, 0.24 * calm);
    } else if (variant === 1) {
      a = hsl(h, s + 6, deepL, 0.56 * calm);
      mid = hsl(h, s + 2, shadeL, 0.24 * calm);
      b = hsl(h, s, liftL, 0.45 * calm);
      core = hsl(h, s, baseL, 0);
      rim = hsl(h, s + 6, deepL, 0.34 * calm);
    } else {
      a = hsl(h, s + 6, deepL, 0.52 * calm);
      mid = hsl(h, s + 2, shadeL, 0.22 * calm);
      b = hsl(h, s, liftL, 0.2 * calm);
      core = hsl(h, s + 6, deepL, 0.36 * calm);
      rim = hsl(h, s, shadeL, 0.12 * calm);
    }
  }

  return {
    a,
    mid,
    b,
    core,
    rim,
    inkTop: hsl(
      h,
      Math.min(80, s + 8),
      Math.max(3, baseL - (dark ? 9.5 : 14)),
      dark ? 0.72 : 0.38,
    ),
    ink: hsl(
      h,
      Math.min(80, s + 6),
      Math.max(4, baseL - (dark ? 6 : 9)),
      dark ? 0.44 : 0.24,
    ),
    hi: hsl(h, s, Math.min(97, baseL + (dark ? 4.5 : 5)), dark ? 0.08 : 0.28),
  };
}

function HomeGround() {
  const { loaderCovering } = useUi();
  const coveringRef = useRef(loaderCovering);
  coveringRef.current = loaderCovering;
  const scheduleRef = useRef<(() => void) | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!loaderCovering) {
      scheduleRef.current?.();
    }
  }, [loaderCovering]);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;

    let placed = "";
    let frame = 0;

    const boxesOf = (selector: string): DOMRect[] => {
      const boxes: DOMRect[] = [];
      document.body.querySelectorAll(selector).forEach((el) => {
        const box = el.getBoundingClientRect();
        if (box.width < 2 || box.height < 2) return;
        boxes.push(box);
      });
      return boxes;
    };

    const paint = () => {
      const boxes = boxesOf(HERO_BOX_ANCHORS);
      const texts = boxesOf(HERO_TEXT_ANCHORS);
      const css = getComputedStyle(field);
      const num = (name: string, fallback: number) => {
        const v = parseFloat(css.getPropertyValue(name));
        return Number.isFinite(v) ? v : fallback;
      };
      const ground: GroundConfig = {
        h: num("--ground-h", 40),
        s: num("--ground-s", 20),
        l: num("--ground-l", 86),
        boxDrop: num("--ground-box-drop", HERO_TONE.boxDrop),
        textLift: num("--ground-text-lift", HERO_TONE.textLift),
      };
      for (const child of Array.from(field.children)) {
        const cell = child as HTMLElement;
        const rect = cell.getBoundingClientRect();
        const x = (rect.left + rect.right) / 2;
        const y = rect.top + Number(cell.dataset.vc);
        let boxD = Infinity;
        for (const box of boxes) boxD = Math.min(boxD, heroRectDist(x, y, box));
        let textD = Infinity;
        for (const box of texts) textD = Math.min(textD, heroRectDist(x, y, box));
        const boxK = Number.isFinite(boxD) ? heroSmooth(HERO_TONE.boxReach, boxD) : 0;
        const textK = Number.isFinite(textD) ? heroSmooth(HERO_TONE.textReach, textD) : 0;
        const tone = heroBlockTone(
          ground,
          boxK,
          textK,
          Number(cell.dataset.col),
          Number(cell.dataset.row),
        );
        cell.style.setProperty("--tone-a", tone.a);
        cell.style.setProperty("--tone-mid", tone.mid);
        cell.style.setProperty("--tone-b", tone.b);
        cell.style.setProperty("--tone-core", tone.core);
        cell.style.setProperty("--tone-rim", tone.rim);
        cell.style.setProperty("--mark-ink-top", tone.inkTop);
        cell.style.setProperty("--mark-ink", tone.ink);
        cell.style.setProperty("--mark-hi", tone.hi);
      }
    };

    const layout = () => {
      const width = field.clientWidth;
      const height = field.clientHeight;
      if (width < 1 || height < 1) return;
      const key = `${Math.round(width)}x${Math.round(height)}`;
      const sizeChanged = key !== placed;
      if (sizeChanged) {
        placed = key;
        const { hexH, gap } = HERO_BLOCK;
        const hexW = Math.round((hexH * Math.sqrt(3)) / 2);
        const pitchX = hexW + gap;
        const pitchY = Math.round(hexH * 0.75 + (gap * Math.sqrt(3)) / 2);
        const cols = Math.min(80, Math.ceil(width / pitchX) + 2);
        const rows = Math.min(500, Math.ceil(height / pitchY) + 2);
        const offX = Math.round((width - (cols - 0.5) * pitchX) / 2);
        const offY = -Math.round(hexH * 0.35);
        const markSize = `${Math.round(hexW * 0.44)}px`;

        const frag = document.createDocumentFragment();
        for (let row = 0; row < rows; row += 1) {
          const shift = row % 2 ? pitchX / 2 : 0;
          for (let col = 0; col < cols; col += 1) {
            const cell = document.createElement("div");
            cell.className = "hero__block";
            cell.dataset.col = String(col);
            cell.dataset.row = String(row);
            cell.dataset.vc = String(hexH / 2);
            cell.style.left = `${Math.round(offX + shift + col * pitchX)}px`;
            cell.style.top = `${offY + row * pitchY}px`;
            cell.style.width = `${hexW}px`;
            cell.style.height = `${hexH}px`;
            cell.style.setProperty(
              "--angle",
              `${HERO_ANGLES[(col + row * 2) % HERO_ANGLES.length]}deg`,
            );

            const mark =
              (((col + row * 3) % HERO_EMBLEMS.length) + HERO_EMBLEMS.length) %
              HERO_EMBLEMS.length;
            cell.dataset.mark = "1";
            cell.style.setProperty("--mark", `url("${HERO_EMBLEMS[mark]}")`);
            cell.style.setProperty("--mark-size", markSize);

            const tile = document.createElement("div");
            tile.className = "hero__tile";
            cell.appendChild(tile);
            frag.appendChild(cell);
          }
        }
        field.replaceChildren(frag);
      }
      if (!coveringRef.current || sizeChanged) {
        paint();
      }
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    };
    scheduleRef.current = schedule;

    const scheduleWhenVisible = () => {
      if (coveringRef.current) return;
      schedule();
    };

    schedule();
    const ro = new ResizeObserver(scheduleWhenVisible);
    ro.observe(field);
    const main = document.getElementById("main");
    let mo: MutationObserver | null = null;
    if (main) {
      ro.observe(main);
      mo = new MutationObserver(scheduleWhenVisible);
      mo.observe(main, { childList: true, subtree: true });
    }
    const footer = document.body.querySelector(".footer");
    if (footer) ro.observe(footer);
    if (document.fonts && document.fonts.ready) {
      void document.fonts.ready.then(scheduleWhenVisible);
    }

    return () => {
      scheduleRef.current = null;
      cancelAnimationFrame(frame);
      ro.disconnect();
      mo?.disconnect();
    };
  }, []);

  return (
    <div className="home-ground" aria-hidden="true">
      <div ref={fieldRef} className="home-ground__blocks" data-hero-blocks />
    </div>
  );
}

/* ───────────── Kick chat column ───────────── */

const CHAT_POLL_MS = 12_000;
const EMOTE_RE = /\[emote:(\d+):([^\]]+)\]/g;

function kickColor(value: string | undefined): string {
  if (!value || !/^#[0-9a-fA-F]{6}$/.test(value)) return "";
  const r = parseInt(value.slice(1, 3), 16);
  const g = parseInt(value.slice(3, 5), 16);
  const b = parseInt(value.slice(5, 7), 16);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum <= 0.62) return value;
  const scale = 0.55 / lum;
  const hex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n * scale)))
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function renderKickContent(text: string | undefined): ReactNode[] {
  const source = String(text || "");
  EMOTE_RE.lastIndex = 0;
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = EMOTE_RE.exec(source))) {
    if (match.index > last) {
      parts.push(source.slice(last, match.index));
    }
    parts.push(
      <img
        key={`emote-${key++}`}
        className="kick-chat__emote"
        alt={match[2]}
        src={`https://files.kick.com/emotes/${match[1]}/fullsize`}
        width={28}
        height={28}
      />,
    );
    last = match.index + match[0].length;
  }
  if (last < source.length) {
    parts.push(source.slice(last));
  }
  return parts;
}

const CHAT_SKEL_ROWS = [
  { nameW: "62px", msgW: "72%" },
  { nameW: "50px", msgW: "86%" },
  { nameW: "74px", msgW: "54%" },
  { nameW: "56px", msgW: "80%" },
  { nameW: "68px", msgW: "60%" },
  { nameW: "48px", msgW: "84%" },
  { nameW: "64px", msgW: "56%" },
] as const;

function KickChat({ channel }: { channel: string }) {
  const { chatOpen, setChat } = useUi();
  const { account, accountRev } = useSession();
  const chatEntered = useEntranceReady();
  const logRef = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState<KickMessage[]>([]);
  const [chatAvatars, setChatAvatars] = useState<Record<string, string>>({});
  const [initialLoading, setInitialLoading] = useState<boolean>(Boolean(channel));
  const [statusText, setStatusText] = useState<string>("");

  const seenRef = useRef<Set<string | number>>(new Set());
  const msgBatchIdxRef = useRef<Map<string | number, number>>(new Map());
  const checkedNamesRef = useRef<Set<string>>(new Set());
  const lastAccountRevRef = useRef<number>(accountRev);
  const channelIdRef = useRef(0);
  const loadingRef = useRef(false);
  const pinnedRef = useRef(true);

  const stick = useCallback(() => {
    const log = logRef.current;
    if (!log || !pinnedRef.current) return;
    log.scrollTop = log.scrollHeight;
  }, []);

  const refresh = useCallback(
    async ({ reset = false }: { reset?: boolean } = {}) => {
      if (loadingRef.current || !channel) return;
      loadingRef.current = true;
      try {
        if (!channelIdRef.current) {
          const res = await fetch(
            `https://kick.com/api/v2/channels/${encodeURIComponent(channel)}`,
            { headers: { Accept: "application/json" } },
          );
          if (!res.ok) throw new Error(String(res.status));
          const chData = (await res.json()) as { id?: number };
          channelIdRef.current = Number(chData.id) || 0;
          if (!channelIdRef.current) throw new Error("channel");
        }

        const fetchPage = async (cursor?: string) => {
          const url = new URL(
            `https://kick.com/api/v2/channels/${channelIdRef.current}/messages`,
          );
          if (cursor) url.searchParams.set("cursor", cursor);
          const res = await fetch(url, { headers: { Accept: "application/json" } });
          if (!res.ok) throw new Error(String(res.status));
          const body = (await res.json()) as {
            data?: { messages?: KickMessage[]; cursor?: string };
          };
          return body.data || {};
        };

        let page = await fetchPage();
        if (reset && (!page.messages || !page.messages.length) && page.cursor) {
          page = await fetchPage(page.cursor);
        }
        const batch = (page.messages || []).slice().reverse();
        const fresh: KickMessage[] = [];
        for (const msg of batch) {
          if (!msg || msg.id == null || seenRef.current.has(msg.id)) continue;
          if (!msg.content) continue;
          seenRef.current.add(msg.id);
          fresh.push(msg);
        }

        if (fresh.length > 0) {
          if (reset || msgBatchIdxRef.current.size > 400) {
            msgBatchIdxRef.current.clear();
          }
          fresh.forEach((m, idx) => {
            if (m.id != null) msgBatchIdxRef.current.set(m.id, idx);
          });
          setStatusText("");
          setInitialLoading(false);
          setMessages((prev) => (reset ? fresh : [...prev, ...fresh]));
        } else if (reset && seenRef.current.size === 0) {
          setStatusText("No messages yet.");
        }
      } catch {
        if (reset && seenRef.current.size === 0) {
          setStatusText("Couldn't load chat.");
        }
      } finally {
        loadingRef.current = false;
        if (reset) setInitialLoading(false);
      }
    },
    [channel],
  );

  useEffect(() => {
    stick();
  }, [messages, stick]);

  useEffect(() => {
    const revChanged = lastAccountRevRef.current !== accountRev;
    if (revChanged) {
      lastAccountRevRef.current = accountRev;
      checkedNamesRef.current.clear();
    }

    const toCheck: string[] = [];
    const seenBatch = new Set<string>();
    for (let i = messages.length - 1; i >= 0; i--) {
      const uname = String(messages[i]?.sender?.username || "").trim().toLowerCase();
      if (!uname || uname.length > 80 || seenBatch.has(uname)) continue;
      if (!revChanged && checkedNamesRef.current.has(uname)) continue;
      seenBatch.add(uname);
      toCheck.push(uname);
      if (toCheck.length >= 150) break;
    }

    if (toCheck.length === 0) {
      if (revChanged) setChatAvatars({});
      return;
    }

    const ctrl = new AbortController();
    getJson<{ avatars?: Record<string, string> }>(
      `/api/kick/avatars?names=${encodeURIComponent(toCheck.join(","))}`,
      { signal: ctrl.signal },
    )
      .then((res) => {
        if (ctrl.signal.aborted) return;
        for (const name of toCheck) {
          checkedNamesRef.current.add(name);
        }
        const incoming: Record<string, string> = {};
        if (res.avatars && typeof res.avatars === "object") {
          for (const [k, v] of Object.entries(res.avatars)) {
            const safe = safeAvatar(v);
            if (safe) incoming[k.trim().toLowerCase()] = safe;
          }
        }
        setChatAvatars((prev) => (revChanged ? incoming : { ...prev, ...incoming }));
      })
      .catch(() => {
        /* retry on next update if aborted or transient network error */
      });

    return () => ctrl.abort();
  }, [messages, accountRev]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => document.body.classList.add("chat-ready"));
    void refresh({ reset: true });
    return () => cancelAnimationFrame(raf);
  }, [refresh]);

  useEffect(() => {
    if (!chatOpen) return;
    void refresh();
    const arm = () => {
      if (document.hidden || !chatOpen) return 0;
      return window.setInterval(() => {
        void refresh();
      }, CHAT_POLL_MS);
    };
    let timer = arm();
    const onVis = () => {
      window.clearInterval(timer);
      timer = arm();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [chatOpen, refresh]);

  useEffect(() => {
    if (!chatOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (window.matchMedia("(min-width: 1041px)").matches) return;
      if (
        document.body.classList.contains("drawer-open") ||
        document.body.classList.contains("admin-modal-open")
      ) {
        return;
      }
      setChat(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [chatOpen, setChat]);

  const onScroll = () => {
    const log = logRef.current;
    if (!log) return;
    pinnedRef.current = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  };

  return (
    <>
      <aside
        className={`kick-chat${chatEntered ? " is-chat-in" : ""}`}
        id="kick-chat"
        data-kick-channel={channel}
        aria-label="Kick chat"
        aria-hidden={!chatOpen || undefined}
      >
        <header className="kick-chat__bar">
          <button
            type="button"
            className="kick-chat__hide"
            data-kick-chat-toggle
            aria-expanded={chatOpen}
            aria-controls="kick-chat-log"
            aria-label="Hide chat"
            tabIndex={chatOpen ? 0 : -1}
            onClick={() => setChat(!chatOpen)}
          >
            <span className="kick-chat__chev" aria-hidden="true" />
          </button>
        </header>
        <div
          ref={logRef}
          className="kick-chat__log"
          id="kick-chat-log"
          data-kick-chat-log
          tabIndex={chatOpen ? 0 : -1}
          onScroll={onScroll}
        >
          {messages.length === 0 ? (
            initialLoading ? (
              <div className="kick-chat__skeletons" role="status" aria-label="Loading chat">
                {CHAT_SKEL_ROWS.map((row, idx) => (
                  <div key={idx} className="kick-chat__skel-row" aria-hidden="true">
                    <span className="kick-chat__skel-name skel" style={{ width: row.nameW }} />
                    <span className="kick-chat__skel-msg skel" style={{ width: row.msgW }} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="kick-chat__status">{statusText || "No messages yet."}</p>
            )
          ) : (
            messages.map((msg) => {
              const color = kickColor(msg.sender?.identity?.color);
              const username = msg.sender?.username || "viewer";
              const unameKey = msg.sender?.username ? msg.sender.username.trim().toLowerCase() : "";
              const ownAvatar =
                unameKey && account?.linked && account.name.trim().toLowerCase() === unameKey
                  ? safeAvatar(account.avatarUrl)
                  : "";
              const avatarUrl = (unameKey && chatAvatars[unameKey]) || ownAvatar;
              const batchIdx = (msg.id != null ? msgBatchIdxRef.current.get(msg.id) : undefined) ?? 0;
              return (
                <p
                  key={String(msg.id)}
                  className="kick-chat__msg"
                  data-id={msg.id ?? undefined}
                  style={{ "--msg-i": batchIdx } as CSSProperties}
                >
                  {avatarUrl && (
                    <img
                      className="kick-chat__avatar"
                      src={avatarUrl}
                      alt=""
                      width={20}
                      height={20}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  <span
                    className="kick-chat__name"
                    style={color ? { color } : undefined}
                  >
                    {username}
                  </span>
                  {renderKickContent(msg.content)}
                </p>
              );
            })
          )}
        </div>
      </aside>
      <button
        type="button"
        className={`kick-chat__show${chatEntered ? " is-chat-in" : ""}`}
        data-kick-chat-toggle
        aria-expanded={chatOpen}
        aria-controls="kick-chat-log"
        aria-label="Show chat"
        tabIndex={chatOpen ? -1 : 0}
        onClick={() => setChat(!chatOpen)}
      >
        <img src="/img/brand/kick-logo-k.svg" alt="" width={24} height={24} />
      </button>
    </>
  );
}

/* ───────────── Local dev account switcher ───────────── */

const LOCAL_DEMO_EMAIL = "local@kdeenoff.test";
const LOCAL_DEMO_NAME = "kdeenoff";

interface DevPreview extends Account {
  raffles?: number;
  demoEntrants?: number;
}

function isLocalDevHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function broadcastDevRevision(): void {
  try {
    localStorage.setItem("kdeenoff-data-rev", String(Date.now()));
  } catch {
    /* ignore */
  }
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel("kdeenoff-admin");
      bc.postMessage({ at: Date.now(), url: "/api/dev/account", method: "POST" });
      bc.close();
    }
  } catch {
    /* ignore */
  }
}

function LocalAdmin() {
  const location = useLocation();
  const { account, applyAccount } = useSession();
  const { loaderRun, playLoader, raffleModal, openRaffleModal, closeRaffleModal } = useUi();
  const [raffles, setRaffles] = useState<number | null>(null);
  const [devRole, setDevRole] = useState<UserRole>("admin");
  const [demoEntrants, setDemoEntrants] = useState<number>(0);
  const req = useRef(0);
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("kdeenoff-local-admin");
      if (stored === "0" || stored === "1") return stored === "1";
    } catch {
      /* ignore */
    }
    return true;
  });
  const [busy, setBusy] = useState(false);

  const demoEmail = Boolean(
    account && account.emailVerified && account.email === LOCAL_DEMO_EMAIL,
  );
  const demoKick = Boolean(
    account &&
    account.linked &&
    account.name === LOCAL_DEMO_NAME &&
    (!account.email || account.email === LOCAL_DEMO_EMAIL),
  );

  useEffect(() => {
    if (account?.role === "player" || account?.role === "streamer" || account?.role === "admin") {
      setDevRole(account.role);
    }
  }, [account?.role]);

  const currentRaffleId = (() => {
    const m = /^\/raffles\/(\d+)\/?$/.exec(location.pathname);
    return m ? Number(m[1]) || null : null;
  })();

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem("kdeenoff-local-admin", next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const raffleLabel = raffles == null ? "—" : String(raffles);

  useEffect(() => {
    const id = ++req.current;
    const ctrl = new AbortController();
    getJson<{ raffles?: number; role?: UserRole; demoEntrants?: number }>("/api/dev/account", {
      signal: ctrl.signal,
    })
      .then((data) => {
        if (id !== req.current) return;
        const n = Number(data.raffles);
        setRaffles(Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
        if (data.role === "player" || data.role === "streamer" || data.role === "admin") {
          setDevRole(data.role);
        }
        const bots = Number(data.demoEntrants);
        setDemoEntrants(Number.isFinite(bots) && bots > 0 ? Math.floor(bots) : 0);
      })
      .catch(() => {
        if (id !== req.current || ctrl.signal.aborted) return;
        setRaffles(0);
      });
    return () => ctrl.abort();
  }, []);

  const pushPreview = async (
    nextAccount: boolean,
    nextKick: boolean,
    extra?: {
      raffleStep?: 1 | -1;
      role?: UserRole;
      demoEntrantsStep?: number;
      raffleId?: number | null;
    },
  ) => {
    const id = ++req.current;
    setBusy(true);
    try {
      const updated = await postJson<DevPreview>("/api/dev/account", {
        account: nextAccount,
        kick: nextKick,
        role: extra?.role ?? devRole,
        ...extra,
      });
      if (id !== req.current) return;
      const n = Number(updated.raffles);
      if (Number.isFinite(n) && n >= 0) setRaffles(Math.floor(n));
      if (typeof updated.demoEntrants === "number" && updated.demoEntrants >= 0) {
        setDemoEntrants(updated.demoEntrants);
      }
      if (updated.role) {
        setDevRole(updated.role);
      }
      applyAccount(updated);
      if (extra?.raffleStep || extra?.demoEntrantsStep) {
        broadcastDevRevision();
      }
    } catch {
      /* keep current state */
    } finally {
      if (id === req.current) setBusy(false);
    }
  };

  return (
    <aside
      className={`local-admin${!open ? " is-collapsed" : ""}`}
      data-local-admin=""
      aria-label="Local admin"
    >
      <button
        type="button"
        className="local-admin__toggle"
        aria-controls="local-admin-body"
        aria-expanded={open}
        aria-label={open ? "Collapse local admin" : "Expand local admin"}
        onClick={toggleOpen}
      >
        <span className="local-admin__title">Local</span>
        <span className="local-admin__chev" aria-hidden="true" />
      </button>
      <div className="local-admin__body" id="local-admin-body" hidden={!open}>
        <label className="local-admin__account">
          <span>Account</span>
          <span className="local-admin__switch">
            <input
              type="checkbox"
              className="local-admin__input"
              data-local-account=""
              role="switch"
              aria-label="Local account"
              checked={demoEmail}
              disabled={busy}
              onChange={(e) => void pushPreview(e.target.checked, demoKick)}
            />
          </span>
        </label>
        <label className="local-admin__account">
          <span>Kick</span>
          <span className="local-admin__switch">
            <input
              type="checkbox"
              className="local-admin__input"
              data-local-kick=""
              role="switch"
              aria-label="Local Kick login"
              checked={demoKick}
              disabled={busy}
              onChange={(e) => void pushPreview(demoEmail, e.target.checked)}
            />
          </span>
        </label>
        <div className="local-admin__account local-admin__account--rank">
          <span>Role</span>
          <span className="local-admin__steps" role="radiogroup" aria-label="Local demo role">
            {(
              [
                ["player", "Player"],
                ["streamer", "Stream"],
                ["admin", "Admin"],
              ] as const
            ).map(([roleKey, label]) => {
              const active = (demoEmail || demoKick) && devRole === roleKey;
              return (
                <button
                  key={roleKey}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-local-role={roleKey}
                  className={`local-admin__action${active ? " is-active" : ""}`}
                  disabled={busy}
                  onClick={() =>
                    void pushPreview(
                      demoEmail || !demoKick ? true : demoEmail,
                      demoKick || !demoEmail ? true : demoKick,
                      { role: roleKey },
                    )
                  }
                >
                  {label}
                </button>
              );
            })}
          </span>
        </div>
        <div
          className="local-admin__account local-admin__account--rank"
          title="Weekly $500 · live for 7 days"
        >
          <span>Raffle</span>
          <span className="local-admin__rank">
            <span className="local-admin__rank-name" data-local-raffles="">
              {raffleLabel}
            </span>
            <span className="local-admin__steps">
              <button
                type="button"
                className="local-admin__step"
                aria-label="Remove a raffle"
                disabled={busy || !raffles}
                onClick={() => void pushPreview(demoEmail, demoKick, { raffleStep: -1 })}
              >
                −
              </button>
              <button
                type="button"
                className="local-admin__step"
                aria-label="Add a raffle"
                disabled={busy}
                onClick={() => void pushPreview(demoEmail, demoKick, { raffleStep: 1 })}
              >
                +
              </button>
            </span>
          </span>
        </div>
        <div
          className="local-admin__account local-admin__account--rank"
          title="Add or remove 5 mock entrants on the active raffle"
        >
          <span>Bots</span>
          <span className="local-admin__rank">
            <span className="local-admin__rank-name" data-local-bots="">
              {demoEntrants}
            </span>
            <span className="local-admin__steps">
              <button
                type="button"
                className="local-admin__action"
                aria-label="Remove 5 demo entrants"
                disabled={busy}
                onClick={() =>
                  void pushPreview(demoEmail, demoKick, {
                    demoEntrantsStep: -5,
                    raffleId: currentRaffleId,
                  })
                }
              >
                −5
              </button>
              <button
                type="button"
                className="local-admin__action"
                aria-label="Add 5 demo entrants"
                disabled={busy}
                onClick={() =>
                  void pushPreview(demoEmail, demoKick, {
                    demoEntrantsStep: 5,
                    raffleId: currentRaffleId,
                  })
                }
              >
                +5
              </button>
            </span>
          </span>
        </div>
        <div className="local-admin__account local-admin__account--rank">
          <span>Loading</span>
          <button
            type="button"
            className="local-admin__action"
            data-local-play-loader=""
            aria-label="Play loading screen"
            disabled={loaderRun > 0}
            onClick={playLoader}
          >
            Play
          </button>
        </div>
        <div className="local-admin__account local-admin__account--rank">
          <span>Joined modal</span>
          <button
            type="button"
            className="local-admin__action"
            data-local-modal-joined=""
            aria-label="Open raffle joined modal preview"
            onClick={() => {
              if (raffleModal?.kind === "joined") {
                closeRaffleModal();
              } else {
                openRaffleModal({
                  kind: "joined",
                  raffleTitle: "Weekly $500 Raffle",
                  rafflePrize: "$500",
                });
              }
            }}
          >
            {raffleModal?.kind === "joined" ? "Close" : "Open"}
          </button>
        </div>
        <div className="local-admin__account local-admin__account--rank">
          <span>Kick modal</span>
          <button
            type="button"
            className="local-admin__action"
            data-local-modal-kick=""
            aria-label="Open authorize Kick modal preview"
            onClick={() => {
              if (raffleModal?.kind === "kick-required") {
                closeRaffleModal();
              } else {
                openRaffleModal({
                  kind: "kick-required",
                  raffleTitle: "Weekly $500 Raffle",
                  rafflePrize: "$500",
                });
              }
            }}
          >
            {raffleModal?.kind === "kick-required" ? "Close" : "Open"}
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ───────────── Layout ───────────── */

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { status: sessionStatus, account, signedIn, applyAccount } = useSession();
  const { drawerOpen, drawerTouched, setDrawer, adminOpen, openAdmin, closeAdmin, openAuthModal } =
    useUi();
  const shellReady = useEntranceReady();

  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountMenuRendered, setAccountMenuRendered] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [miniAvatarFailed, setMiniAvatarFailed] = useState(false);

  const miniProfileRef = useRef<HTMLDivElement | null>(null);
  const accountToggleRef = useRef<HTMLButtonElement | null>(null);
  const accountMenuTimerRef = useRef(0);

  const isHome = location.pathname === "/";
  const signedAccount = signedIn ? account : null;
  const canOpenAdmin = Boolean(signedAccount?.isAdmin);
  const isStreamerOnly = Boolean(signedAccount?.isStreamer && !signedAccount?.isAdmin);
  const miniAvatar = signedAccount ? safeAvatar(signedAccount.avatarUrl) : "";
  const showMiniAvatar = Boolean(miniAvatar && !miniAvatarFailed);
  const miniAvatarImg = useImgReady(showMiniAvatar ? miniAvatar : undefined);

  useEffect(() => {
    setMiniAvatarFailed(false);
  }, [signedAccount?.avatarUrl]);

  // Close account menu when signed out, and close admin overlay if admin privileges end
  useEffect(() => {
    if (!signedIn) setAccountMenuOpen(false);
  }, [signedIn]);

  useEffect(() => {
    window.clearTimeout(accountMenuTimerRef.current);
    if (accountMenuOpen) {
      setAccountMenuRendered(true);
      return;
    }
    if (!accountMenuRendered) return;
    if (reduceMotion) {
      setAccountMenuRendered(false);
      return;
    }
    accountMenuTimerRef.current = window.setTimeout(() => {
      setAccountMenuRendered(false);
    }, 180);
    return () => window.clearTimeout(accountMenuTimerRef.current);
  }, [accountMenuOpen, accountMenuRendered]);

  useEffect(() => () => window.clearTimeout(accountMenuTimerRef.current), []);

  useEffect(() => {
    if (!canOpenAdmin && adminOpen) closeAdmin();
  }, [canOpenAdmin, adminOpen, closeAdmin]);

  // Click outside & Escape for account menu
  useEffect(() => {
    if (!accountMenuOpen) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && miniProfileRef.current?.contains(target)) return;
      setAccountMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setAccountMenuOpen(false);
      accountToggleRef.current?.focus();
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [accountMenuOpen]);

  // Scroll to hash or top on navigation
  useEffect(() => {
    if (location.hash) {
      const id = decodeURIComponent(location.hash.slice(1));
      const tryScroll = () => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView();
          return true;
        }
        return false;
      };
      if (!tryScroll()) {
        const t = window.setTimeout(tryScroll, 80);
        return () => window.clearTimeout(t);
      }
      return;
    }
    window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await postJson("/api/account/logout", {});
      applyAccount(null);
      setAccountMenuOpen(false);
      navigate("/account/");
    } catch {
      /* keep menu open */
    } finally {
      setSigningOut(false);
    }
  };

  const nameLabel = displayName(signedAccount);
  const showAccountMenu = accountMenuOpen || accountMenuRendered;
  const isAccountMenuClosing = !accountMenuOpen && accountMenuRendered;
  const drawerLabel = drawerTouched
    ? drawerOpen
      ? "Collapse menu"
      : "Expand menu"
    : "Open menu";

  return (
    <>
      {isHome && <HomeGround />}
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="topbar">
        <div className="topbar__start">
          <button
            type="button"
            className="topbar__menu"
            data-drawer-toggle
            aria-controls="drawer"
            aria-expanded={drawerOpen}
            aria-label={drawerLabel}
            onClick={() => setDrawer(!drawerOpen)}
          >
            <img src="/img/icons/nav-menu.webp" alt="" width={16} height={16} />
          </button>
          <Link className="topbar__mark" to="/" aria-label="KDeenOff home">
            <img src="/img/brand/mark-muzzle.png" alt="" width={37} height={26} />
            <span className="topbar__word">KDEENOFF</span>
          </Link>
        </div>

        <div className={`topbar__auth${shellReady ? " is-auth-in" : ""}`}>
          {sessionStatus === "loading" && (
            <div className="topbar__auth-skel" aria-hidden="true">
              <span className="topbar__skel-btn skel" />
              <span className="topbar__skel-btn topbar__skel-btn--wide skel" />
            </div>
          )}
          <button
            type="button"
            className="topbar__login"
            data-auth-open="login"
            hidden={sessionStatus === "loading" || signedIn}
            onClick={() => openAuthModal("login")}
          >
            Login
          </button>
          <button
            type="button"
            className="topbar__register"
            data-auth-open="register"
            hidden={sessionStatus === "loading" || signedIn}
            onClick={() => openAuthModal("register")}
          >
            Register
          </button>
          <div
            ref={miniProfileRef}
            className="mini-profile"
            data-mini-profile
            hidden={sessionStatus === "loading" || !signedIn}
          >
            <button
              ref={accountToggleRef}
              type="button"
              className={`mini-profile__head${accountMenuOpen ? " is-open" : ""}`}
              data-account-menu-toggle
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
              aria-controls="account-menu"
              aria-label={`Account menu, ${nameLabel}`}
              onClick={(e) => {
                e.stopPropagation();
                setAccountMenuOpen((v) => !v);
              }}
            >
              <span
                className={`mp-hex${showMiniAvatar ? " mp-hex--logo" : ""}${showMiniAvatar && !miniAvatarImg.ready ? " skel" : ""}`}
                data-mini-level
                aria-hidden="true"
              >
                {showMiniAvatar ? (
                  <img
                    ref={miniAvatarImg.ref}
                    className={!miniAvatarImg.ready ? "is-media-pending" : undefined}
                    src={miniAvatar}
                    alt=""
                    width={22}
                    height={22}
                    style={{ borderRadius: "50%", objectFit: "cover" }}
                    onLoad={miniAvatarImg.onLoad}
                    onError={() => {
                      miniAvatarImg.onError();
                      setMiniAvatarFailed(true);
                    }}
                  />
                ) : (
                  accountInitial(nameLabel)
                )}
              </span>
              <span className="mini-profile__id">
                <span className="mini-profile__name" data-mini-name>
                  {nameLabel}
                </span>
              </span>
              <span
                className={`mini-profile__toggle${accountMenuOpen ? " is-open" : ""}`}
                aria-hidden="true"
              >
                <span className="mini-profile__chev" />
              </span>
            </button>
            <div
              className={`mini-profile__menu${accountMenuOpen ? " is-open" : ""}${isAccountMenuClosing ? " is-closing" : ""}`}
              id="account-menu"
              data-account-menu
              hidden={!showAccountMenu}
              aria-hidden={!accountMenuOpen || undefined}
              role="menu"
              aria-label="Account"
            >
              <Link
                className="mini-profile__menu-item"
                role="menuitem"
                to="/account/"
                style={{ "--menu-i": 0 } as CSSProperties}
                onClick={() => setAccountMenuOpen(false)}
              >
                Settings
              </Link>
              {isStreamerOnly && (
                <Link
                  className="mini-profile__menu-item mini-profile__menu-item--admin"
                  role="menuitem"
                  data-mini-streamer
                  to="/raffles/"
                  style={{ "--menu-i": 1 } as CSSProperties}
                  onClick={() => setAccountMenuOpen(false)}
                >
                  Streamer raffles
                </Link>
              )}
              {canOpenAdmin && (
                <button
                  type="button"
                  className="mini-profile__menu-item mini-profile__menu-item--admin"
                  role="menuitem"
                  data-mini-admin
                  style={{ "--menu-i": 1 } as CSSProperties}
                  onClick={() => {
                    setAccountMenuOpen(false);
                    openAdmin();
                  }}
                >
                  Admin panel
                </button>
              )}
              <button
                type="button"
                className={`mini-profile__menu-item${signingOut ? " is-loading-shimmer" : ""}`}
                role="menuitem"
                data-mini-signout
                disabled={signingOut}
                style={{ "--menu-i": canOpenAdmin || isStreamerOnly ? 2 : 1 } as CSSProperties}
                onClick={() => void handleSignOut()}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <Drawer />

      <main id="main" className="main">
        <Outlet />
      </main>

      <Footer />

      {site.kickChannel && <KickChat channel={site.kickChannel} />}

      {isLocalDevHost() && <LocalAdmin />}

      {adminOpen && canOpenAdmin && (
        <Suspense fallback={null}>
          <AdminDashboardModal />
        </Suspense>
      )}

      <AuthDialog />

      <RaffleModals />

      <LoadingScreen />
    </>
  );
}
