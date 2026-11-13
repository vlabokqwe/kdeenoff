import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { partnerCode, site, type Partner } from "../../shared/site";
import { copyText } from "../hooks/useCopy";
import { useImgReady } from "../hooks/useMediaReady";
import { useNow } from "../hooks/useNow";
import { useEntranceReady } from "../hooks/useReveal";
import {
  boardBadge,
  boardHref,
  fetchBoards,
  fetchSiteSettings,
  moneyK,
  pad2,
  partnerTheme,
  slugFromPath,
} from "../lib/boards";
import { accountInitial, reduceMotion, safeAvatar } from "../lib/format";
import type { Board, SiteSettings } from "../lib/types";
import { useSession } from "../state/session";
import { useUi } from "../state/ui";

const REFER_KEY = "kdeenoff-refer-partner";
const FLOW_KINDS = ["spark", "star", "glint", "coin", "shell"] as const;

interface FlowBit {
  kind: string;
  style: CSSProperties;
}

function makeFlowBits(): FlowBit[] {
  const count = 11 + Math.floor(Math.random() * 5);
  const bits: FlowBit[] = [];
  for (let i = 0; i < count; i += 1) {
    const kind = FLOW_KINDS[Math.floor(Math.random() * FLOW_KINDS.length)];
    const y = (8 + Math.random() * 84).toFixed(1);
    const dur = (6.4 + Math.random() * 6.2).toFixed(2);
    const delay = (-Math.random() * 12).toFixed(2);
    const bulky = kind === "shell" || kind === "coin";
    const size = (bulky ? 12 : 8) + Math.random() * (bulky ? 12 : 8);
    const o = (0.6 + Math.random() * 0.35).toFixed(2);
    const bob = ((Math.random() * 2 - 1) * 9).toFixed(1);
    bits.push({
      kind,
      style: {
        "--y": `${y}%`,
        "--dur": `${dur}s`,
        "--delay": `${delay}s`,
        "--size": `${size.toFixed(0)}px`,
        "--o": o,
        "--bob": `${bob}px`,
      } as CSSProperties,
    });
  }
  return bits;
}

function sideClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const clock = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  return d > 0 ? `${d}d ${clock}` : clock;
}

function SideBoardCard({
  board,
  active,
  now,
  railIndex,
  leaveIndex,
}: {
  board: Board;
  active: boolean;
  now: number;
  railIndex: number;
  leaveIndex: number;
}) {
  const cardRef = useRef<HTMLAnchorElement | null>(null);
  const bits = useMemo(() => (reduceMotion ? [] : makeFlowBits()), []);
  const ends = Number(board.ends_at) || 0;
  const left = ends - now;
  const ended = left <= 0;
  const theme = partnerTheme(board.partner);
  const kind = boardBadge(board);

  const setPace = useCallback((rate: number) => {
    const card = cardRef.current;
    if (!card) return;
    const anims = Array.from(card.querySelectorAll(".side-board__flow i")).flatMap((el) =>
      el.getAnimations(),
    );
    anims.forEach((a) => a.updatePlaybackRate(rate));
  }, []);

  return (
    <Link
      ref={cardRef}
      className={`side-board${active ? " is-active" : ""}${ended ? " is-ended" : ""}`}
      data-partner={theme}
      to={boardHref(board.slug)}
      data-ends={ends}
      style={{ "--rail-i": railIndex, "--leave-i": leaveIndex } as CSSProperties}
      onPointerEnter={() => setPace(3.6)}
      onPointerLeave={() => setPace(1)}
      onFocus={() => setPace(3.6)}
      onBlur={() => setPace(1)}
    >
      <span className="side-board__well">
        {!reduceMotion && (
          <span className="side-board__flow" aria-hidden="true">
            {bits.map((b, i) => (
              <i key={i} data-kind={b.kind} style={b.style} />
            ))}
          </span>
        )}
        <span className="side-board__prize">
          <img className="side-board__cup" src="/img/icons/nav-trophy.webp" alt="" width={18} height={18} />
          <span className="side-board__pool">{moneyK(board.prize_pool_cents)}</span>
          {kind && <span className="side-board__kind">{kind}</span>}
        </span>
        <span className="side-board__timer">
          <img src="/img/icons/nav-timer.webp" alt="" width={18} height={18} />
          <time data-side-timer>{ended ? "Ended" : sideClock(left)}</time>
        </span>
        <img className="side-board__art" src="/img/deco/side-board.webp?v=slot3" alt="" />
      </span>
    </Link>
  );
}

export function Drawer() {
  const location = useLocation();
  const now = useNow();
  const { account, signedIn } = useSession();
  const { drawerOpen, scrimVisible, setDrawer, homeSection, dataRev } = useUi();
  const shellReady = useEntranceReady();

  const [boards, setBoards] = useState<Board[] | null>(null);
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [referOpen, setReferOpen] = useState(false);
  const [referRendered, setReferRendered] = useState(false);
  const [referPlacement, setReferPlacement] = useState<"above" | "below">("above");
  const [rewardsOpen, setRewardsOpen] = useState(true);
  const [copiedPartnerId, setCopiedPartnerId] = useState("");
  const [referStyle, setReferStyle] = useState<CSSProperties>({});
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>(() => {
    try {
      return localStorage.getItem(REFER_KEY) || "";
    } catch {
      return "";
    }
  });

  const referSectionRef = useRef<HTMLElement | null>(null);
  const referRowRef = useRef<HTMLDivElement | null>(null);
  const referToggleRef = useRef<HTMLButtonElement | null>(null);
  const referListRef = useRef<HTMLUListElement | null>(null);
  const copiedPartnerTimer = useRef(0);
  const referCloseTimer = useRef(0);

  useEffect(() => {
    setAvatarFailed(false);
  }, [account?.avatarUrl]);

  useEffect(() => {
    let alive = true;
    fetchBoards().then((list) => {
      if (alive) setBoards(list);
    });
    fetchSiteSettings().then((settings) => {
      if (alive) setSiteSettings(settings);
    });
    return () => {
      alive = false;
    };
  }, [dataRev]);

  // Close menus when drawer closes
  useEffect(() => {
    if (!drawerOpen) {
      setReferOpen(false);
    }
  }, [drawerOpen]);

  // Position Refer partner list
  const placeReferList = useCallback(() => {
    const anchor = referRowRef.current || referToggleRef.current;
    if (!anchor || !referOpen) return;
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const width = Math.min(rect.width, window.innerWidth - margin * 2);
    let left = rect.left;
    if (left + width > window.innerWidth - margin) left = window.innerWidth - margin - width;
    if (left < margin) left = margin;
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const openBelow = spaceAbove < 120 && spaceBelow > spaceAbove;
    const maxHeight = Math.max(120, Math.floor(openBelow ? spaceBelow : spaceAbove));

    const nextStyle: CSSProperties = {
      left: `${Math.round(left)}px`,
      width: `${Math.round(width)}px`,
      maxHeight: `${maxHeight}px`,
    };
    if (openBelow) nextStyle.top = `${Math.round(rect.bottom + gap)}px`;
    else nextStyle.bottom = `${Math.round(window.innerHeight - rect.top + gap)}px`;
    setReferPlacement(openBelow ? "below" : "above");
    setReferStyle(nextStyle);
  }, [referOpen]);

  useLayoutEffect(() => {
    if (referOpen) {
      placeReferList();
    }
  }, [referOpen, placeReferList]);

  useEffect(() => {
    window.clearTimeout(referCloseTimer.current);
    if (referOpen) {
      setReferRendered(true);
      return;
    }
    if (!referRendered) {
      setReferStyle({});
      return;
    }
    if (reduceMotion) {
      setReferRendered(false);
      setReferStyle({});
      return;
    }
    referCloseTimer.current = window.setTimeout(() => {
      setReferRendered(false);
      setReferStyle({});
    }, 180);
    return () => window.clearTimeout(referCloseTimer.current);
  }, [referOpen, referRendered]);

  useEffect(() => {
    if (!referOpen) return;
    window.addEventListener("resize", placeReferList);

    const onDocClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (referSectionRef.current?.contains(target) || referListRef.current?.contains(target)) return;
      setReferOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setReferOpen(false);
      referToggleRef.current?.focus();
    };

    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("resize", placeReferList);
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [referOpen, placeReferList]);

  // Nav active state
  const path = location.pathname;
  let activeNav = "";
  if (path.startsWith("/raffles")) activeNav = "raffles";
  else if (path.startsWith("/bonuses")) activeNav = "bonus";
  else if (path.startsWith("/leaderboards")) activeNav = "leaderboards";
  else if (path.startsWith("/account")) activeNav = "kick";
  else if (path === "/") activeNav = homeSection;

  // Account drawer fields
  const kickName = account?.linked && account?.name ? account.name : "";
  const email = account?.emailVerified && account?.email ? account.email : "";
  const name = kickName || email || "Account";
  const rawAvatar = account ? safeAvatar(account.avatarUrl) : "";
  const showAvatar = Boolean(rawAvatar && !avatarFailed);
  const avatarImg = useImgReady(showAvatar ? rawAvatar : undefined);
  const subText = kickName && email ? email : "Signed in";

  // Partner referral
  const partners = site.partners || [];
  const resolvePartnerCode = useCallback(
    (partner: Partner): string => {
      if (partner.id === "500" || partner.id === partners[0]?.id) {
        return siteSettings?.promo_code?.trim() || partnerCode(partner);
      }
      return partnerCode(partner);
    },
    [partners, siteSettings?.promo_code],
  );
  const activePartner: Partner | undefined =
    partners.find((p) => p.id === selectedPartnerId) || partners[0];
  const referLogo = activePartner?.logo || "";
  const activeCode = activePartner ? resolvePartnerCode(activePartner) : "";
  const activeCopied = Boolean(activePartner && copiedPartnerId === activePartner.id);
  const currentBoardSlug = slugFromPath(location.pathname);
  const isBoardsIndex =
    location.pathname === "/leaderboards/" || location.pathname === "/leaderboards";
  const drawerBoards = useMemo(
    () => (boards === null ? null : boards.filter((b) => b.show_in_drawer !== 0)),
    [boards],
  );

  useEffect(
    () => () => {
      window.clearTimeout(copiedPartnerTimer.current);
      window.clearTimeout(referCloseTimer.current);
    },
    [],
  );

  const showReferList = referOpen || referRendered;
  const isReferClosing = !referOpen && referRendered;

  const selectPartner = (partner: Partner) => {
    setSelectedPartnerId(partner.id);
    try {
      localStorage.setItem(REFER_KEY, partner.id);
    } catch {
      /* private mode */
    }
    setReferOpen(false);
    referToggleRef.current?.focus();
  };

  const copyPartnerCode = (partner: Partner) => {
    const code = resolvePartnerCode(partner);
    void copyText(code);
    setCopiedPartnerId(partner.id);
    window.clearTimeout(copiedPartnerTimer.current);
    copiedPartnerTimer.current = window.setTimeout(() => setCopiedPartnerId(""), 1800);
  };

  return (
    <>
      <div
        className="drawer-scrim"
        data-drawer-scrim
        hidden={!scrimVisible}
        onClick={() => setDrawer(false)}
      />
      <aside className="drawer" id="drawer" aria-label="Menu and leaderboards">
        <div className="drawer__scroll">
          <section
            className="drawer__group drawer__account"
            data-drawer-account
            hidden={!signedIn}
            aria-label="Account"
            style={{ "--leave-i": 0 } as CSSProperties}
          >
            <div className="drawer-account" data-drawer-profile>
              {showAvatar && !avatarImg.ready && (
                <span className="drawer-account__avatar-skel skel" aria-hidden="true" />
              )}
              <img
                ref={avatarImg.ref}
                className={`drawer-account__avatar${showAvatar && !avatarImg.ready ? " is-media-pending" : ""}`}
                data-drawer-avatar
                src={showAvatar ? rawAvatar : undefined}
                alt=""
                width={36}
                height={36}
                hidden={!showAvatar}
                onLoad={avatarImg.onLoad}
                onError={() => {
                  avatarImg.onError();
                  setAvatarFailed(true);
                }}
              />
              <span
                className="drawer-account__mark"
                data-drawer-mark
                hidden={showAvatar}
                aria-hidden="true"
              >
                {accountInitial(name)}
              </span>
              <span className="drawer-account__text">
                <span className="drawer-account__name" data-drawer-name>
                  {name}
                </span>
                <span className="drawer-account__sub" data-drawer-sub>
                  {subText}
                </span>
              </span>
            </div>
            <Link
              className="drawer-kick"
              to="/account/"
              data-kick-account
              aria-label="Authorize Kick"
              hidden={Boolean(account?.linked)}
            >
              <img src="/img/brand/kick-logo-k.svg" alt="" width={14} height={14} />
              <span data-kick-account-label>Authorize</span>
            </Link>
          </section>

          <div
            className={`drawer__group${rewardsOpen ? "" : " is-collapsed"}`}
            style={{ "--group-i": 0, "--leave-i": signedIn ? 1 : 0 } as CSSProperties}
          >
            <button
              type="button"
              className="drawer__fold"
              aria-expanded={rewardsOpen}
              aria-controls="drawer-rewards"
              onClick={() => setRewardsOpen((open) => !open)}
            >
              <span className="drawer__label">Rewards</span>
              <span className="drawer__fold-chev" aria-hidden="true" />
            </button>
            <nav id="drawer-rewards" className="drawer__nav" aria-label="Rewards">
              <Link
                to="/raffles/"
                className={`drawer-link${activeNav === "raffles" ? " is-active" : ""}`}
                data-nav-link="raffles"
                style={{ "--rail-i": 0 } as CSSProperties}
              >
                <img src="/img/icons/nav-raffle.webp" alt="" width={18} height={18} />
                <span>Raffles</span>
              </Link>
              <Link
                to="/bonuses/"
                className={`drawer-link${activeNav === "bonus" ? " is-active" : ""}`}
                data-nav-link="bonus"
                style={{ "--rail-i": 1 } as CSSProperties}
              >
                <img src="/img/icons/nav-gift.webp" alt="" width={18} height={18} />
                <span>Bonuses</span>
              </Link>
            </nav>
          </div>

          <section
            className="drawer__group drawer__boards"
            data-side-boards-wrap
            aria-label="Leaderboard"
            style={{ "--group-i": 2 } as CSSProperties}
          >
            <div className="drawer__boards-list" data-side-boards>
              {drawerBoards === null ? (
                [0, 1].map((i) => (
                  <span
                    key={i}
                    className="side-board side-board--skeleton"
                    aria-hidden="true"
                    style={
                      {
                        "--rail-i": 2 + i,
                        "--leave-i": (signedIn ? 2 : 1) + i,
                      } as CSSProperties
                    }
                  >
                    <span className="side-board__well">
                      <span className="side-board__skel-line side-board__skel-line--lg skel" />
                      <span className="side-board__skel-line side-board__skel-line--sm skel" />
                    </span>
                    <span className="side-board__skel-rail skel" />
                  </span>
                ))
              ) : drawerBoards.length === 0 ? (
                <p
                  className="drawer__empty"
                  style={{ "--leave-i": signedIn ? 2 : 1 } as CSSProperties}
                >
                  New races are coming soon.
                </p>
              ) : (
                drawerBoards.map((b, i) => (
                  <SideBoardCard
                    key={b.slug}
                    board={b}
                    active={b.slug === currentBoardSlug || (isBoardsIndex && i === 0)}
                    now={now}
                    railIndex={2 + i}
                    leaveIndex={(signedIn ? 2 : 1) + i}
                  />
                ))
              )}
            </div>
          </section>

          <div
            className="drawer__group"
            style={
              {
                "--group-i": 2 + (drawerBoards === null ? 2 : drawerBoards.length),
                "--leave-i":
                  (signedIn ? 2 : 1) +
                  Math.max(1, drawerBoards === null ? 2 : drawerBoards.length),
              } as CSSProperties
            }
          >
            <Link
              to="/#contacts"
              className={`drawer-link${activeNav === "contacts" ? " is-active" : ""}`}
              data-nav-link="contacts"
              style={
                {
                  "--rail-i": 2 + (drawerBoards === null ? 2 : drawerBoards.length),
                } as CSSProperties
              }
            >
              <img src="/img/icons/nav-chat.webp" alt="" width={18} height={18} />
              <span>Contacts</span>
            </Link>
          </div>
        </div>

        <div className="drawer__foot">
          {partners.length > 0 && activePartner && (
            <section
              ref={referSectionRef}
              className={`drawer__group drawer__refer${drawerOpen && shellReady ? " is-refer-in" : ""}`}
              aria-label="Referral"
              data-refer
              style={{ "--leave-i": (signedIn ? 2 : 1) + 1 } as CSSProperties}
            >
              <p className="drawer-refer__kicker">Referral</p>
              <div
                ref={referRowRef}
                className={`drawer-refer__box${referOpen ? " is-open" : ""}${activeCopied ? " is-copied" : ""}`}
              >
                {referLogo && (
                  <img
                    key={activePartner.id}
                    className="drawer-refer__logo"
                    data-refer-logo
                    src={referLogo}
                    alt=""
                    width={20}
                    height={20}
                  />
                )}
                <button
                  type="button"
                  className={`drawer-refer__copy${activeCopied ? " is-copied" : ""}`}
                  aria-label={activeCopied ? `Copied ${activeCode}` : `Copy code ${activeCode}`}
                  onClick={() => copyPartnerCode(activePartner)}
                >
                  <span key={activeCode} className="drawer-refer__value">
                    {activeCode}
                  </span>
                  <span className="drawer-refer__glyph" aria-hidden="true" />
                  <span className="sr-only" aria-live="polite">
                    {activeCopied ? "Copied" : ""}
                  </span>
                </button>
                <button
                  ref={referToggleRef}
                  type="button"
                  className="drawer-refer__toggle"
                  data-refer-toggle
                  aria-expanded={referOpen}
                  aria-haspopup="listbox"
                  aria-controls="drawer-refer-list"
                  aria-label={`Choose partner, ${activePartner.name}`}
                  onClick={() => setReferOpen((open) => !open)}
                >
                  <span className="drawer-refer__chev" aria-hidden="true" />
                </button>
              </div>
            </section>
          )}
        </div>
      </aside>

      {partners.length > 0 &&
        createPortal(
          <ul
            ref={referListRef}
            className={`drawer-refer__list${referOpen ? " is-open" : ""}${isReferClosing ? " is-closing" : ""}`}
            id="drawer-refer-list"
            data-refer-list
            data-placement={referPlacement}
            hidden={!showReferList}
            aria-hidden={!referOpen || undefined}
            role="listbox"
            aria-label="Partners"
            style={referStyle}
          >
            {partners.map((p, idx) => {
              const code = resolvePartnerCode(p);
              const selected = p.id === activePartner?.id;
              const copied = copiedPartnerId === p.id;
              return (
                <li
                  key={p.id}
                  className={selected ? "is-selected" : undefined}
                  style={{ "--opt-i": idx } as CSSProperties}
                >
                  <button
                    type="button"
                    className="drawer-refer__option"
                    role="option"
                    data-refer-option
                    data-id={p.id}
                    data-code={code}
                    data-logo={p.logo || ""}
                    data-name={p.name}
                    aria-selected={selected}
                    onClick={() => selectPartner(p)}
                  >
                    {p.logo && <img src={p.logo} alt="" width={64} height={16} />}
                    <span className="drawer-refer__name">{p.name}</span>
                  </button>
                  <button
                    type="button"
                    className={`drawer-refer__code${copied ? " is-copied" : ""}`}
                    aria-label={copied ? `Copied ${code}` : `Copy code ${code}`}
                    onClick={() => copyPartnerCode(p)}
                  >
                    {copied ? "Copied" : code}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
