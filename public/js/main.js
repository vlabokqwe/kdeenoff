/**
 * KDeenOff — left menu, leaderboards drawer, drawer leaderboard cards, copy buttons,
 * partner tabs, nav highlight, scroll reveals, hero parallax and the raffle step reels.
 */
import {
  escapeHtml,
  fetchBoards,
  boardCadence,
  moneyK,
  moneyShort,
  onTick,
  partnerTheme,
  slugFromPath,
} from "./boards-api.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ───────────── Copy buttons ───────────── */

async function copyText(text) {
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

function initCopyButtons() {
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    const status = btn.querySelector("[data-copy-status]");
    const idle = status ? status.textContent : "";
    let timer = 0;
    btn.addEventListener("click", async () => {
      const code = btn.getAttribute("data-copy");
      if (!code) return;
      await copyText(code);
      btn.classList.add("is-copied");
      if (status) status.textContent = "Copied!";
      clearTimeout(timer);
      timer = setTimeout(() => {
        btn.classList.remove("is-copied");
        if (status) status.textContent = idle;
      }, 1800);
    });
  });
}

/* ───────────── Drawer (menu + leaderboards) ───────────── */

const menuKey = "kdeenoff-menu";

function setDrawer(open) {
  const drawer = document.getElementById("drawer");
  const scrim = document.querySelector("[data-drawer-scrim]");
  if (!drawer) return;
  document.body.classList.toggle("drawer-open", open);
  try { sessionStorage.setItem(menuKey, open ? "1" : "0"); } catch { /* private mode */ }
  const narrow = window.matchMedia("(max-width: 800px)").matches;
  if (scrim) scrim.hidden = !(open && narrow);
  document.querySelectorAll("[data-drawer-toggle]").forEach((b) => {
    b.setAttribute("aria-expanded", String(open));
    b.setAttribute("aria-label", open ? "Collapse menu" : "Expand menu");
  });
}

function highlightBoards() {
  const wrap = document.querySelector("[data-side-boards-wrap]");
  if (!wrap) return;
  wrap.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  wrap.classList.remove("is-highlight");
  void wrap.offsetWidth; // restart the animation
  wrap.classList.add("is-highlight");
  setTimeout(() => wrap.classList.remove("is-highlight"), 3200);
  wrap.querySelector(".side-board")?.focus({ preventScroll: true });
}

function initDrawer() {
  try {
    if (sessionStorage.getItem(menuKey) === "1") setDrawer(true);
  } catch { /* private mode */ }
  requestAnimationFrame(() => document.body.classList.add("drawer-ready"));
  document.querySelectorAll("[data-drawer-toggle]").forEach((b) =>
    b.addEventListener("click", () => setDrawer(!document.body.classList.contains("drawer-open"))),
  );
  document.querySelector("[data-drawer-scrim]")?.addEventListener("click", () => setDrawer(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("drawer-open")) setDrawer(false);
  });

  document.querySelectorAll("[data-open-boards]").forEach((btn) =>
    btn.addEventListener("click", () => {
      setDrawer(true);
      // wait for the slide-in before pulsing the cards
      setTimeout(highlightBoards, reduceMotion ? 0 : 320);
    }),
  );
}

/* ───────────── Drawer leaderboard cards ───────────── */

function raceLabel(board) {
  const kind = boardCadence(board);
  return kind === "RACE" ? "" : kind;
}

function sideClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  const clock = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return d > 0 ? `${d}d ${clock}` : clock;
}

const FLOW_KINDS = ["spark", "star", "glint", "coin", "shell"];

function flowBits() {
  const count = 11 + Math.floor(Math.random() * 5);
  const bits = [];
  for (let i = 0; i < count; i += 1) {
    const kind = FLOW_KINDS[Math.floor(Math.random() * FLOW_KINDS.length)];
    const y = (8 + Math.random() * 84).toFixed(1);
    const dur = (6.4 + Math.random() * 6.2).toFixed(2);
    const delay = (-Math.random() * 12).toFixed(2);
    const bulky = kind === "shell" || kind === "coin";
    const size = (bulky ? 12 : 8) + Math.random() * (bulky ? 12 : 8);
    const o = (0.6 + Math.random() * 0.35).toFixed(2);
    const bob = ((Math.random() * 2 - 1) * 9).toFixed(1);
    bits.push(
      `<i data-kind="${kind}" style="--y:${y}%;--dur:${dur}s;--delay:${delay}s;--size:${size.toFixed(0)}px;--o:${o};--bob:${bob}px"></i>`,
    );
  }
  return bits.join("");
}

function bindFlowPace(card) {
  const anims = [...card.querySelectorAll(".side-board__flow i")].flatMap((el) => el.getAnimations());
  if (!anims.length) return;
  const setRate = (rate) => anims.forEach((a) => a.updatePlaybackRate(rate));
  card.addEventListener("pointerenter", () => setRate(3.6));
  card.addEventListener("pointerleave", () => setRate(1));
  card.addEventListener("focus", () => setRate(3.6));
  card.addEventListener("blur", () => setRate(1));
}

function sideDecorHtml() {
  if (reduceMotion) return "";
  return `<span class="side-board__flow" aria-hidden="true">${flowBits()}</span>`;
}

function sideBoardHtml(b, current) {
  const theme = partnerTheme(b.partner);
  const active = b.slug === current ? " is-active" : "";
  return `
    <a class="side-board${active}" data-partner="${theme}" href="/leaderboards/${encodeURIComponent(b.slug)}/" data-ends="${Number(b.ends_at) || 0}">
      <span class="side-board__well">
        ${sideDecorHtml()}
        <span class="side-board__prize">
          <img class="side-board__cup" src="/img/icons/nav-trophy.webp" alt="" width="18" height="18">
          <span class="side-board__pool">${moneyK(b.prize_pool_cents)}</span>
          ${raceLabel(b) ? `<span class="side-board__kind">${escapeHtml(raceLabel(b))}</span>` : ""}
        </span>
        <span class="side-board__timer">
          <img src="/img/icons/nav-timer.webp" alt="" width="18" height="18">
          <time data-side-timer>00:00:00</time>
        </span>
        <img class="side-board__art" src="/img/deco/side-board.webp?v=slot" alt="">
      </span>
    </a>`;
}

async function initSideBoards() {
  const list = document.querySelector("[data-side-boards]");
  const boards = await fetchBoards();

  document.querySelectorAll("[data-boards-count]").forEach((el) => {
    el.textContent = String(boards.length);
    el.hidden = boards.length === 0;
  });

  if (!list) return;
  if (!boards.length) {
    list.innerHTML = `<p class="drawer__empty">New races are coming soon.</p>`;
    return;
  }
  list.innerHTML = boards.map((b) => sideBoardHtml(b, slugFromPath())).join("");
  const cards = [...list.querySelectorAll(".side-board")];
  cards.forEach(bindFlowPace);
  onTick(() => {
    const now = Date.now();
    cards.forEach((card) => {
      const left = Number(card.dataset.ends) - now;
      const t = card.querySelector("[data-side-timer]");
      if (t) t.textContent = sideClock(left);
      card.classList.toggle("is-ended", left <= 0);
    });
  });
}

/* ───────────── Hero leaderboard dashboard ───────────── */

function dashTitle(board) {
  const cents = Number(board.prize_pool_cents) || 0;
  const word = { WEEKLY: "Weekly", MONTHLY: "Monthly", DAILY: "Daily" }[boardCadence(board)];
  if (cents > 0 && word) return `${moneyShort(cents)} ${word}`;
  if (cents > 0) return `${moneyShort(cents)} Race`;
  return board.title || "Leaderboard";
}

function paintDashCard(card, now) {
  const end = Number(card.dataset.ends) || 0;
  const left = end - now;
  const ended = !(left > 0);
  card.classList.toggle("is-ended", ended);
  const clock = card.querySelector(".lb-dash__clock");
  const time = card.querySelector("[data-dash-time]");
  const sec = card.querySelector("[data-dash-sec]");
  const kicker = card.querySelector("[data-dash-kicker]");
  if (time) time.dateTime = end ? new Date(end).toISOString() : "";
  if (ended) {
    if (clock) clock.hidden = true;
    if (time) time.hidden = true;
    if (sec) sec.hidden = true;
    if (kicker) kicker.hidden = true;
    return;
  }
  if (clock) clock.hidden = false;
  if (time) time.hidden = false;
  const total = Math.floor(left / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (kicker) kicker.hidden = false;
  if (d > 0) {
    if (time) time.textContent = `${d}d ${pad(h)}h`;
    if (sec) {
      sec.hidden = false;
      sec.textContent = `${pad(m)}:${pad(s)}`;
    }
  } else if (h > 0) {
    if (time) time.textContent = `${h}h ${pad(m)}m`;
    if (sec) {
      sec.hidden = false;
      sec.textContent = `${pad(s)}s`;
    }
  } else {
    if (time) time.textContent = `${m}m ${pad(s)}s`;
    if (sec) sec.hidden = true;
  }
}

function dashCardHtml(board) {
  const title = dashTitle(board);
  const href = `/leaderboards/${encodeURIComponent(board.slug)}/`;
  return `
    <a class="lb-dash__card" data-partner="${escapeHtml(partnerTheme(board.partner))}" href="${href}" data-ends="${Number(board.ends_at) || 0}">
      <span class="lb-dash__copy">
        <span class="lb-dash__title">
          <span class="lb-dash__mark"><img src="/img/icons/nav-trophy.webp" alt="" width="14" height="14"></span>
          <span>${escapeHtml(title)}</span>
        </span>
        <span class="lb-dash__go">View board</span>
      </span>
      <span class="lb-dash__clock">
        <span class="lb-dash__face">
          <span class="lb-dash__kicker" data-dash-kicker>Ends in</span>
          <time data-dash-time>00h 00m</time>
          <span class="lb-dash__sec" data-dash-sec hidden>00s</span>
        </span>
      </span>
    </a>`;
}

async function initBoardDash() {
  const list = document.querySelector("[data-lb-dash]");
  if (!list) return;
  const boards = await fetchBoards();
  if (!boards.length) {
    list.innerHTML = `<p class="lb-dash__empty">New races are coming soon.</p>`;
    return;
  }
  list.innerHTML = boards.map(dashCardHtml).join("");
  onTick(() => {
    const now = Date.now();
    list.querySelectorAll(".lb-dash__card").forEach((card) => paintDashCard(card, now));
  });
}

/* ───────────── Partner tabs (bonus section) ───────────── */

function initPartnerTabs() {
  const tabs = [...document.querySelectorAll("[data-partner-tab]")];
  if (!tabs.length) return;
  tabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      const id = tab.dataset.partnerTab;
      tabs.forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
      document.querySelectorAll("[data-partner-panel]").forEach((p) => {
        const on = p.dataset.partnerPanel === id;
        p.hidden = !on;
        if (on) {
          p.classList.remove("is-in");
          requestAnimationFrame(() => p.classList.add("is-in"));
        }
      });
    }),
  );
}

/* ───────────── Nav highlight + scrollspy ───────────── */

function initNav() {
  const path = location.pathname;
  const links = [...document.querySelectorAll("[data-nav-link]")];
  const set = (name) => links.forEach((l) => l.classList.toggle("is-active", l.dataset.navLink === name));

  if (path.startsWith("/raffles")) return set("raffles");
  if (path.startsWith("/bonuses")) return set("bonus");
  if (path.startsWith("/leaderboards")) return set("leaderboards");
  if (path.startsWith("/account")) return set("kick");
  if (path !== "/") return set("");

  set("home");
  const sections = ["bonus", "contacts"].map((id) => document.getElementById(id)).filter(Boolean);
  if (!sections.length) return;
  const visible = new Map();
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => visible.set(e.target.id, e.isIntersecting));
      const hit = sections.find((s) => visible.get(s.id));
      set(hit ? hit.id : "home");
    },
    { rootMargin: "-45% 0px -45% 0px" },
  );
  sections.forEach((s) => io.observe(s));
}

/* ───────────── Scroll reveals ───────────── */

function initReveal() {
  const items = document.querySelectorAll("[data-reveal]");
  if (reduceMotion) {
    items.forEach((el) => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      });
    },
    { threshold: 0.18 },
  );
  items.forEach((el) => io.observe(el));
}

/* ───────────── Hero parallax ───────────── */

function initParallax() {
  if (reduceMotion) return;
  document.querySelectorAll("[data-parallax]").forEach((root) => {
    const items = [...root.querySelectorAll("[data-depth]")];
    if (!items.length) return;
    let px = 0, py = 0, sy = 0, raf = 0;
    const paint = () => {
      raf = 0;
      items.forEach((el) => {
        const d = Number(el.dataset.depth) || 0;
        el.style.setProperty("--px", `${(px * d * 50).toFixed(1)}px`);
        el.style.setProperty("--py", `${(py * d * 50 - sy * d * 0.4).toFixed(1)}px`);
      });
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const host = root.closest("section") || root;
    host.addEventListener("pointermove", (e) => {
      const r = host.getBoundingClientRect();
      px = (e.clientX - r.left) / r.width - 0.5;
      py = (e.clientY - r.top) / r.height - 0.5;
      queue();
    });
    window.addEventListener("scroll", () => {
      const r = host.getBoundingClientRect();
      if (r.bottom < 0) return;
      sy = Math.max(0, -r.top);
      queue();
    }, { passive: true });
  });
}

/* ───────────── Raffle steps: line drawn from step to step ───────────── */

function initSteps() {
  document.querySelectorAll("[data-steps]").forEach((root) => {
    const track = root.querySelector("[data-steps-track]");
    const svg = root.querySelector("[data-steps-svg]");
    const path = root.querySelector("[data-steps-path]");
    const guide = root.querySelector("[data-steps-shadow]");
    const runner = root.querySelector("[data-steps-runner]");
    const steps = [...root.querySelectorAll("[data-step]")];
    if (!track || !svg || !path || steps.length < 2) return;

    let stops = [0]; // path length at each step anchor
    let total = 0;
    let drawn = 0;
    let state = "idle"; // idle | running | done

    const build = () => {
      const tr = track.getBoundingClientRect();
      const pts = steps.map((s) => {
        const r = s.querySelector("[data-step-anchor]").getBoundingClientRect();
        return { x: r.left - tr.left + r.width / 2, y: r.top - tr.top + r.height / 2 };
      });
      svg.setAttribute("viewBox", `0 0 ${tr.width} ${tr.height}`);
      svg.setAttribute("width", tr.width);
      svg.setAttribute("height", tr.height);

      const horizontal = Math.abs(pts[1].y - pts[0].y) < Math.abs(pts[1].x - pts[0].x);
      let d = `M ${pts[0].x} ${pts[0].y}`;
      const segs = [];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const flip = i % 2 ? 1 : -1;
        let c;
        if (horizontal) {
          const amp = Math.min(80, (b.x - a.x) * 0.25) * flip;
          c = `C ${a.x + (b.x - a.x) * 0.35} ${a.y - amp}, ${b.x - (b.x - a.x) * 0.35} ${b.y + amp}, ${b.x} ${b.y}`;
        } else {
          const amp = Math.min(70, tr.width * 0.22) * flip;
          c = `C ${a.x + amp} ${a.y + (b.y - a.y) * 0.35}, ${b.x - amp} ${b.y - (b.y - a.y) * 0.35}, ${b.x} ${b.y}`;
        }
        segs.push(`M ${a.x} ${a.y} ${c}`);
        d += ` ${c}`;
      }
      path.setAttribute("d", d);
      guide?.setAttribute("d", d);

      const probe = document.createElementNS("http://www.w3.org/2000/svg", "path");
      svg.appendChild(probe);
      stops = [0];
      segs.forEach((s) => {
        probe.setAttribute("d", s);
        stops.push(stops[stops.length - 1] + probe.getTotalLength());
      });
      probe.remove();
      total = path.getTotalLength();
      path.style.strokeDasharray = `${total}`;
      if (state === "done") drawn = total;
      paint();
    };

    const paint = () => {
      path.style.strokeDashoffset = `${total - drawn}`;
      if (runner) {
        const p = path.getPointAtLength(Math.min(drawn, total));
        runner.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${drawn * 0.9}deg)`;
      }
    };

    const showStep = (i) => steps[i]?.classList.add("is-in");
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

    const drawTo = (target, ms) =>
      new Promise((resolve) => {
        const from = drawn;
        const t0 = performance.now();
        const frame = (now) => {
          const k = Math.min(1, (now - t0) / ms);
          drawn = from + (target - from) * ease(k);
          paint();
          if (k < 1) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });

    const run = async () => {
      state = "running";
      root.classList.add("is-running");
      showStep(0);
      await wait(600);
      for (let i = 1; i < steps.length; i++) {
        await drawTo(stops[i], 1100);
        showStep(i);
        await wait(500);
      }
      state = "done";
      root.classList.remove("is-running");
      root.classList.add("is-done");
    };

    build();
    window.addEventListener("resize", () => requestAnimationFrame(build));
    steps.forEach((s) => s.querySelector("img")?.addEventListener("load", build, { once: true }));
    document.fonts?.ready.then(build);

    if (reduceMotion) {
      state = "done";
      steps.forEach((_, i) => showStep(i));
      root.classList.add("is-done");
      build();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && state === "idle") {
          io.disconnect();
          run();
        }
      },
      // Tall (mobile) tracks can never be mostly visible, so trigger on the
      // track's top reaching the middle part of the viewport instead.
      { threshold: 0, rootMargin: "0px 0px -35% 0px" },
    );
    io.observe(track);
  });
}

/* ───────────── Kick chat column ───────────── */

const chatKey = "kdeenoff-chat";
const chatPollMs = 12000;
const emotePattern = /\[emote:(\d+):([^\]]+)\]/g;
let onChatToggle = () => { };

function setChat(open) {
  const was = document.body.classList.contains("chat-open");
  document.body.classList.toggle("chat-open", open);
  document.querySelectorAll("[data-kick-chat-toggle]").forEach((btn) => {
    btn.setAttribute("aria-expanded", String(open));
  });
  try { localStorage.setItem(chatKey, open ? "1" : "0"); } catch { /* private mode */ }
  window.dispatchEvent(new Event("resize"));
  if (open !== was) onChatToggle(open);
}

function kickColor(value) {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return "";
  const r = parseInt(value.slice(1, 3), 16);
  const g = parseInt(value.slice(3, 5), 16);
  const b = parseInt(value.slice(5, 7), 16);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum <= 0.62) return value;
  const scale = 0.55 / lum;
  const hex = (n) => Math.max(0, Math.min(255, Math.round(n * scale))).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function appendKickContent(parent, text) {
  const source = String(text || "");
  emotePattern.lastIndex = 0;
  let last = 0;
  let match;
  while ((match = emotePattern.exec(source))) {
    if (match.index > last) parent.append(document.createTextNode(source.slice(last, match.index)));
    const img = document.createElement("img");
    img.className = "kick-chat__emote";
    img.alt = match[2];
    img.src = `https://files.kick.com/emotes/${match[1]}/fullsize`;
    img.width = 28;
    img.height = 28;
    parent.append(img);
    last = match.index + match[0].length;
  }
  if (last < source.length) parent.append(document.createTextNode(source.slice(last)));
}

function kickMessageNode(message) {
  const row = document.createElement("p");
  row.className = "kick-chat__msg";
  row.dataset.id = message.id;
  const name = document.createElement("span");
  name.className = "kick-chat__name";
  name.textContent = message.sender?.username || "viewer";
  const color = kickColor(message.sender?.identity?.color);
  if (color) name.style.color = color;
  row.append(name);
  appendKickContent(row, message.content);
  return row;
}

function initKickChat() {
  const root = document.getElementById("kick-chat");
  if (!root) return;
  const slug = root.getAttribute("data-kick-channel");
  const log = root.querySelector("[data-kick-chat-log]");
  const seen = new Set();
  let channelId = 0;
  let timer = 0;
  let pinned = true;
  let loading = false;

  const status = (text) => {
    log.replaceChildren();
    const note = document.createElement("p");
    note.className = "kick-chat__status";
    note.textContent = text;
    log.append(note);
  };

  const stick = () => {
    if (!pinned) return;
    log.scrollTop = log.scrollHeight;
  };

  const appendMessages = (messages, { reset = false } = {}) => {
    const fresh = [];
    for (const message of messages) {
      if (!message || message.id == null || seen.has(message.id)) continue;
      if (!message.content) continue;
      seen.add(message.id);
      fresh.push(message);
    }
    if (!fresh.length && !reset) return;
    if (reset) log.replaceChildren();
    else log.querySelector(".kick-chat__status")?.remove();
    for (const message of fresh) log.append(kickMessageNode(message));
    if (!log.children.length) status("No messages yet.");
    stick();
  };

  async function kickJson(url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  async function messagePage(cursor) {
    const url = new URL(`https://kick.com/api/v2/channels/${channelId}/messages`);
    if (cursor) url.searchParams.set("cursor", cursor);
    const body = await kickJson(url);
    return body.data || {};
  }

  async function refresh({ reset = false } = {}) {
    if (loading || !slug) return;
    loading = true;
    try {
      if (!channelId) {
        const channel = await kickJson(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`);
        channelId = Number(channel.id) || 0;
        if (!channelId) throw new Error("channel");
      }
      let page = await messagePage();
      if (reset && (!page.messages || !page.messages.length) && page.cursor) {
        page = await messagePage(page.cursor);
      }
      const messages = (page.messages || []).slice().reverse();
      appendMessages(messages, { reset });
    } catch {
      if (reset && !seen.size) status("Couldn't load chat.");
    } finally {
      loading = false;
    }
  }

  const arm = () => {
    clearInterval(timer);
    timer = 0;
    const open = document.body.classList.contains("chat-open");
    if (!open || document.hidden) return;
    timer = setInterval(() => refresh(), chatPollMs);
  };

  onChatToggle = (open) => {
    arm();
    if (open) refresh();
  };

  log.addEventListener("scroll", () => {
    pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  }, { passive: true });

  root.querySelectorAll("[data-kick-chat-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => setChat(!document.body.classList.contains("chat-open")));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !document.body.classList.contains("chat-open")) return;
    if (window.matchMedia("(min-width: 1041px)").matches) return;
    if (document.body.classList.contains("drawer-open")) return;
    setChat(false);
  });
  document.addEventListener("visibilitychange", arm);

  requestAnimationFrame(() => document.body.classList.add("chat-ready"));
  refresh({ reset: true }).finally(arm);
}

function initDashLive() {
  const video = document.querySelector(".lb-dash__live");
  if (!video) return;
  if (reduceMotion) {
    video.removeAttribute("autoplay");
    video.pause();
    return;
  }
  video.muted = true;
  video.loop = true;
  const start = () => video.play().catch(() => { });
  if (video.readyState >= 2) start();
  else video.addEventListener("loadeddata", start, { once: true });
}

function initJoinReel() {
  if (reduceMotion) return;
  document.querySelectorAll("[data-join-reel]").forEach((reel) => {
    const clips = [...reel.querySelectorAll(".join-clip")];
    if (clips.length < 2) return;

    let pending = false;
    let lock = false;

    const go = () => {
      if (lock) return;
      const current = clips.find((clip) => clip.classList.contains("is-on"));
      if (!current) return;
      lock = true;
      const next = clips[(clips.indexOf(current) + 1) % clips.length];
      next.classList.add("is-on");
      current.classList.remove("is-on");
      requestAnimationFrame(() => { lock = false; });
    };

    clips.forEach((clip) => {
      const cursor = clip.querySelector(".join-cursor");
      if (!cursor) return;
      cursor.addEventListener("animationend", (event) => {
        if (event.target !== cursor || !clip.classList.contains("is-on")) return;
        if (reel.classList.contains("is-paused")) {
          pending = true;
          return;
        }
        go();
      });
    });

    reel.addEventListener("joinresume", () => {
      if (!pending) return;
      pending = false;
      go();
    });
  });
}

function initStepReels() {
  document.querySelectorAll(".steps").forEach((section) => {
    const videos = [...section.querySelectorAll(".step video")];
    const reels = [...section.querySelectorAll("[data-join-reel]")];
    if ((!videos.length && !reels.length) || reduceMotion) return;

    let onScreen = false;

    const start = (video) => {
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      const play = () => {
        if (!onScreen) return;
        video.play().then(() => {
          video.closest(".step")?.classList.add("is-live");
        }).catch(() => { });
      };
      if (video.readyState >= 2) play();
      else {
        video.addEventListener("loadeddata", play, { once: true });
        video.load();
      }
    };

    const playAll = () => {
      onScreen = true;
      videos.forEach(start);
      reels.forEach((reel) => {
        reel.classList.remove("is-paused");
        reel.closest(".step")?.classList.add("is-live");
        reel.dispatchEvent(new Event("joinresume"));
      });
    };

    const stopAll = () => {
      onScreen = false;
      videos.forEach((video) => {
        video.pause();
        video.closest(".step")?.classList.remove("is-live");
      });
      reels.forEach((reel) => {
        reel.classList.add("is-paused");
        reel.closest(".step")?.classList.remove("is-live");
      });
    };

    if (!("IntersectionObserver" in window)) {
      playAll();
    } else {
      const watch = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) playAll();
          else stopAll();
        });
      }, { threshold: 0.2 });
      watch.observe(section);
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopAll();
      else if (section.getBoundingClientRect().bottom > 0 && section.getBoundingClientRect().top < window.innerHeight) playAll();
    });
  });
}

function initCardMotion() {
  if (reduceMotion) return;
  document.querySelectorAll(".mode").forEach((card) => {
    const video = card.querySelector("video");
    if (!video) return;
    video.loop = false;
    video.muted = true;
    let dir = 0;
    let gen = 0;
    let scrubRaf = 0;
    let onSeeked = null;

    const clearSeek = () => {
      if (!onSeeked) return;
      video.removeEventListener("seeked", onSeeked);
      onSeeked = null;
    };

    const live = (on) => {
      card.classList.toggle("is-live", on);
      card.dataset.want = on ? "1" : "0";
    };

    const ready = () => {
      if (video.readyState >= 1) return Promise.resolve();
      video.preload = "auto";
      return new Promise((resolve) => {
        video.addEventListener("loadeddata", resolve, { once: true });
        video.load();
      });
    };

    const halt = () => {
      dir = 0;
      gen += 1;
      cancelAnimationFrame(scrubRaf);
      clearSeek();
      video.pause();
      try {
        video.playbackRate = 1;
        video.currentTime = 0;
      } catch { /* not ready */ }
      live(false);
    };

    const scrubBack = (id) => {
      cancelAnimationFrame(scrubRaf);
      clearSeek();
      video.pause();
      try { video.playbackRate = 1; } catch { /* unsupported */ }
      live(true);
      const frameMs = 1000 / 24;
      let cursor = video.currentTime;
      let last = performance.now();
      let acc = frameMs;

      const step = (now) => {
        if (id !== gen || dir !== -1) return;
        acc += now - last;
        last = now;
        if (acc < frameMs) {
          scrubRaf = requestAnimationFrame(step);
          return;
        }
        const frames = Math.min(2, Math.floor(acc / frameMs));
        acc -= frames * frameMs;
        cursor -= frames / 24;
        if (cursor <= 0.03) {
          halt();
          return;
        }
        const finish = () => {
          if (onSeeked !== finish) return;
          clearSeek();
          if (id !== gen || dir !== -1) return;
          scrubRaf = requestAnimationFrame(step);
        };
        onSeeked = finish;
        video.addEventListener("seeked", finish);
        try {
          video.currentTime = cursor;
        } catch {
          halt();
          return;
        }
        if (!video.seeking) finish();
      };
      scrubRaf = requestAnimationFrame(step);
    };

    const playForward = () => {
      const id = ++gen;
      dir = 1;
      cancelAnimationFrame(scrubRaf);
      clearSeek();
      ready().then(() => {
        if (id !== gen) return;
        const dur = video.duration;
        if (Number.isFinite(dur) && video.currentTime >= dur - 0.05) {
          try { video.currentTime = 0; } catch { /* ignore */ }
        }
        video.playbackRate = 1;
        return video.play();
      }).then(() => {
        if (id === gen && dir === 1) live(true);
      }).catch(() => {
        if (id === gen) live(false);
      });
    };

    const playBackward = () => {
      const id = ++gen;
      dir = -1;
      cancelAnimationFrame(scrubRaf);
      clearSeek();
      ready().then(() => {
        if (id !== gen) return;
        if (video.currentTime <= 0.04) {
          halt();
          return;
        }
        const dur = video.duration;
        if (Number.isFinite(dur) && video.currentTime >= dur - 0.02) {
          try { video.currentTime = Math.max(0, dur - 0.08); } catch { /* ignore */ }
        }
        let reverseNative = false;
        try {
          video.playbackRate = -1;
          reverseNative = video.playbackRate < 0;
        } catch { /* this browser cannot play backwards */ }
        if (!reverseNative) {
          try { video.playbackRate = 1; } catch { /* ignore */ }
          scrubBack(id);
          return;
        }
        return video.play().then(() => {
          if (id !== gen) return;
          if (video.playbackRate < 0) live(true);
          else scrubBack(id);
        });
      }).catch(() => {
        if (id === gen) scrubBack(id);
      });
    };

    video.addEventListener("ended", () => {
      if (dir > 0) playBackward();
      else if (dir < 0) halt();
    });
    video.addEventListener("pause", () => {
      if (dir < 0 && video.currentTime <= 0.06) halt();
    });

    card.addEventListener("pointerenter", playForward);
    card.addEventListener("focus", () => {
      if (card.classList.contains("step")) return;
      if (card.matches(":hover")) return;
      playForward();
    });

    if (!card.classList.contains("step")) return;

    const settle = () => {
      if (dir === 0 && video.currentTime <= 0.04) return;
      playBackward();
    };

    card.addEventListener("pointerleave", settle);
    card.addEventListener("focusin", playForward);
    card.addEventListener("focusout", (event) => {
      if (card.contains(event.relatedTarget)) return;
      settle();
    });
  });
}

function initPartnerMascot() {
  document.querySelectorAll(".partner-card__mascot video").forEach((video) => {
    if (reduceMotion) {
      video.removeAttribute("autoplay");
      video.pause();
      return;
    }
    const root = video.parentElement;
    const mark = () => root.classList.add("is-playing");
    video.muted = true;
    video.preload = "auto";
    video.addEventListener("playing", mark);
    const start = () => video.play().then(mark).catch(() => { });
    if (video.readyState >= 2) start();
    else video.addEventListener("loadeddata", start, { once: true });
    video.load();
  });
}

function initClaimFlow() {
  if (reduceMotion) return;
  const quick = 2.6;
  document.querySelectorAll(".partner-card__go").forEach((link) => {
    const rate = (value) => {
      link.getAnimations({ subtree: true }).forEach((anim) => {
        anim.playbackRate = value;
      });
    };
    link.addEventListener("pointerenter", () => rate(quick));
    link.addEventListener("pointerleave", () => rate(1));
    link.addEventListener("focus", () => rate(quick));
    link.addEventListener("blur", () => rate(1));
  });
}

/* ───────────── Boot ───────────── */

/* Dark is the default. The key changed from "kdeenoff-theme" because the old
   code saved "light" on every visit, so stored values were not real choices. */
const themeKey = "kdeenoff-theme-v2";

function applyTheme(theme, save) {
  const next = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", next === "dark" ? "#0c1218" : "#f7f7f7");
  document.querySelectorAll("[data-theme-choice]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.getAttribute("data-theme-choice") === next));
  });
  if (save) {
    try { localStorage.setItem(themeKey, next); } catch { /* private mode */ }
  }
  document.dispatchEvent(new CustomEvent("themechange", { detail: next }));
}

function initTheme() {
  const current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  applyTheme(current, false);
  document.querySelectorAll("[data-theme-choice]").forEach((btn) => {
    btn.addEventListener("click", () => applyTheme(btn.getAttribute("data-theme-choice"), true));
  });
}

function syncFooterLogo() {
  const art = document.querySelector(".footer__art");
  const text = document.querySelector(".footer__lead p");
  if (!art || !text || art.dataset.fitting === "1") return;
  art.dataset.fitting = "1";
  const ratio = 632 / 714;
  let width = art.getBoundingClientRect().width;
  for (let i = 0; i < 4; i += 1) {
    const next = Math.round(text.getBoundingClientRect().height * ratio * 100) / 100;
    if (Math.abs(next - width) < 0.6) break;
    width = next;
    art.style.width = `${width}px`;
  }
  art.dataset.fitting = "";
}

function initFooterLogo() {
  const footer = document.querySelector(".footer");
  const text = document.querySelector(".footer__lead p");
  if (!footer || !text) return;
  syncFooterLogo();
  const observer = new ResizeObserver(() => syncFooterLogo());
  observer.observe(footer);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncFooterLogo);
}

function initSlotHost() {
  document.querySelectorAll("video.slot-clock__host").forEach((video) => {
    if (!reduceMotion) return;
    video.removeAttribute("autoplay");
    video.pause();
    try { video.currentTime = 0; } catch { /* not seekable yet */ }
  });
}

/* ───────────── Home scale ground ───────────── */

/* Honeycomb across the whole home page: large pointy-top hexagons on an indigo
   ground, with the hexagonal facets only softly hinted via directional
   gradients and darkening, and a recessed site glyph in each cell. */
const heroBlock = { hexH: 300, gap: 16 };
const heroAngles = [145, 215, 325, 35];
const heroEmblems = [
  "gift", "trophy", "ticket", "coin", "dice", "diamond", "medal", "star",
].map((name) => `/img/bg/glyph-${name}.webp`);
/* Boxes (player, cards, rows) pull nearby banners darker.
   Text anchors keep a pale pool so dark headings stay readable. */
const heroBoxAnchors = [
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
const heroTextAnchors = [
  ".hero__copy",
  ".hero__scroll",
  ".section-head",
  ".footer__brand",
  ".footer__col",
  ".footer__bottom",
].join(",");
/* The ground stays quiet so the cards stand out: a narrow lightness range.
   Hue / saturation / lightness come from --ground-h/s/l on .home-ground. */
const heroTone = {
  boxDrop: 7, // how much darker a banner gets right next to a box
  textLift: 4, // how much lighter under a heading
  boxReach: 320,
  textReach: 90,
};

function heroHash(a, b, salt) {
  let x = (a * 374761393 + b * 668265263 + salt * 2147483647) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function heroSmooth(edge, d) {
  const t = Math.min(1, Math.max(0, d / edge));
  return 1 - t * t * (3 - 2 * t);
}

function heroRectDist(x, y, box) {
  const dx = Math.max(box.left - x, 0, x - box.right);
  const dy = Math.max(box.top - y, 0, y - box.bottom);
  return Math.hypot(dx, dy);
}

/* Cell tone on the indigo honeycomb. Instead of flat fills, each hexagon is
   only softly hinted by an angled darkening/lightening gradient that fades to
   transparent on the opposite facet, plus a gentle radial shadow. */
function heroBlockTone(ground, boxK, textK, yFrac, col, row) {
  const dark = ground.l < 40;
  const variant = (((col + row * 2) % 3) + 3) % 3;
  const calm = 1 - textK * 0.2;
  const baseL = ground.l
    - ground.boxDrop * 0.18 * Math.pow(boxK, 1.2)
    + ground.textLift * 0.1 * textK;
  const h = ground.h + (heroHash(col, row, 7) - 0.5) * 4;
  const s = ground.s;

  const hsl = (hh, sat, lit, a = 1) => `hsl(${hh.toFixed(1)} ${sat.toFixed(1)}% ${lit.toFixed(1)}% / ${a.toFixed(3)})`;

  /* Variant 0: ghost cell — soft edge darkening around the perimeter + one-sided shadow fade.
     Variant 1: bevelled shade — deep darkening on one side grading into a soft indigo lift, with darkened rim.
     Variant 2: recessed well — darkened center & shadow facet fading smoothly into the ground on the far edge. */
  let a;
  let mid;
  let b;
  let core;
  let rim;
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
    inkTop: hsl(h, Math.min(80, s + 8), Math.max(3, baseL - (dark ? 9.5 : 14)), dark ? 0.72 : 0.38),
    ink: hsl(h, Math.min(80, s + 6), Math.max(4, baseL - (dark ? 6 : 9)), dark ? 0.44 : 0.24),
    hi: hsl(h, s, Math.min(97, baseL + (dark ? 4.5 : 5)), dark ? 0.08 : 0.28),
  };
}

function initHeroBlocks() {
  const page = document.querySelector(".site--home");
  const field = page?.querySelector("[data-hero-blocks]");
  if (!page || !field) return;

  let placed = "";
  let frame = 0;

  const boxesOf = (selector) => {
    const boxes = [];
    page.querySelectorAll(selector).forEach((el) => {
      const box = el.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) return;
      boxes.push(box);
    });
    return boxes;
  };

  const paint = () => {
    const boxes = boxesOf(heroBoxAnchors);
    const texts = boxesOf(heroTextAnchors);
    const fieldBox = field.getBoundingClientRect();
    const fieldH = Math.max(fieldBox.height, 1);
    const css = getComputedStyle(field);
    const num = (name, fallback) => {
      const v = parseFloat(css.getPropertyValue(name));
      return Number.isFinite(v) ? v : fallback;
    };
    /* The dark theme flips the text pool (darker under headings) via CSS. */
    const ground = {
      h: num("--ground-h", 40),
      s: num("--ground-s", 20),
      l: num("--ground-l", 86),
      boxDrop: num("--ground-box-drop", heroTone.boxDrop),
      textLift: num("--ground-text-lift", heroTone.textLift),
    };
    for (const cell of field.children) {
      const rect = cell.getBoundingClientRect();
      const x = (rect.left + rect.right) / 2;
      const y = rect.top + Number(cell.dataset.vc);
      let boxD = Infinity;
      for (const box of boxes) boxD = Math.min(boxD, heroRectDist(x, y, box));
      let textD = Infinity;
      for (const box of texts) textD = Math.min(textD, heroRectDist(x, y, box));
      const boxK = Number.isFinite(boxD) ? heroSmooth(heroTone.boxReach, boxD) : 0;
      const textK = Number.isFinite(textD) ? heroSmooth(heroTone.textReach, textD) : 0;
      const yFrac = Math.min(1, Math.max(0, (y - fieldBox.top) / fieldH));
      const tone = heroBlockTone(ground, boxK, textK, yFrac, Number(cell.dataset.col), Number(cell.dataset.row));
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
    if (key !== placed) {
      placed = key;
      const { hexH, gap } = heroBlock;
      const hexW = Math.round(hexH * Math.sqrt(3) / 2);
      const pitchX = hexW + gap;
      const pitchY = Math.round(hexH * 0.75 + gap * Math.sqrt(3) / 2);
      const cols = Math.min(80, Math.ceil(width / pitchX) + 2);
      const rows = Math.min(500, Math.ceil(height / pitchY) + 2);
      /* Center the comb so both edges cut cells evenly. */
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
          cell.style.setProperty("--angle", `${heroAngles[(col + row * 2) % heroAngles.length]}deg`);

          /* Every cell carries a glyph; the set steps diagonally so
             neighbours never repeat. */
          const mark = (((col + row * 3) % heroEmblems.length) + heroEmblems.length) % heroEmblems.length;
          cell.dataset.mark = "1";
          cell.style.setProperty("--mark", `url("${heroEmblems[mark]}")`);
          cell.style.setProperty("--mark-size", markSize);

          const tile = document.createElement("div");
          tile.className = "hero__tile";
          cell.appendChild(tile);
          frag.appendChild(cell);
        }
      }
      field.replaceChildren(frag);
    }
    paint();
  };

  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(layout);
  };

  schedule();
  const observer = new ResizeObserver(schedule);
  observer.observe(field);
  const main = document.getElementById("main");
  if (main) {
    observer.observe(main);
    new MutationObserver(schedule).observe(main, { childList: true, subtree: true });
  }
  const footer = page.querySelector(".footer");
  if (footer) observer.observe(footer);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  document.addEventListener("themechange", () => requestAnimationFrame(paint));
}

/* ───────────── Kick account link ───────────── */

function initKickAccount() {
  const headerLink = document.querySelector("[data-kick-account]");
  const label = document.querySelector("[data-kick-account-label]");
  const card = document.querySelector("[data-kick-card]");
  if (!headerLink && !card) return;

  const errors = {
    config: "Kick linking is not turned on for this site yet.",
    denied: "Kick did not grant access. Nothing was linked.",
    state: "That connection expired. Start it again.",
    token: "Kick did not finish the login. Try again.",
    profile: "Kick did not return an account. Try again.",
    store: "The site could not save the Kick account. Try again.",
    taken: "That Kick account is already linked to a confirmed email.",
  };
  const emailErrors = {
    config: "Email confirmation is not turned on yet.",
    email: "Enter a valid email address.",
    wait: "Wait a minute before asking for another code.",
    limit: "Too many codes were sent. Try again later.",
    taken: "That email is already confirmed.",
    send: "The email could not be sent. Try again.",
    bad: "That code is wrong.",
    expired: "That code expired. Ask for a new one.",
    store: "The site could not save the email. Try again.",
  };

  const errorEl = document.querySelector("[data-kick-error]");
  const code = new URLSearchParams(location.search).get("error");
  if (errorEl && code && errors[code]) {
    errorEl.hidden = false;
    errorEl.textContent = errors[code];
  }

  const statusEl = document.querySelector("[data-kick-status]");
  const whoEl = document.querySelector("[data-kick-who]");
  const nameEl = document.querySelector("[data-kick-name]");
  const avatarEl = document.querySelector("[data-kick-avatar]");
  const connectEl = document.querySelector("[data-kick-connect]");
  const disconnectEl = document.querySelector("[data-kick-disconnect]");

  const readCsrf = () => {
    const match = document.cookie.match(/(?:^|;\s*)kdeenoff_csrf=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  };

  const safeAvatar = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  };

  const emailStatusEl = document.querySelector("[data-email-status]");
  const emailErrorEl = document.querySelector("[data-email-error]");
  const emailDoneEl = document.querySelector("[data-email-done]");
  const emailForm = document.querySelector("[data-email-form]");
  const codeForm = document.querySelector("[data-code-form]");
  const emailInput = document.querySelector("[data-email-input]");
  const signOutEl = document.querySelector("[data-account-signout]");

  const showEmailError = (key) => {
    if (!emailErrorEl) return;
    emailErrorEl.hidden = false;
    emailErrorEl.textContent = emailErrors[key] || "Something went wrong. Try again.";
  };

  const postAccount = async (path, payload) => {
    const res = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-csrf": readCsrf(),
      },
      body: JSON.stringify(payload || {}),
    });
    let body = {};
    try { body = await res.json(); } catch { /* empty */ }
    if (!res.ok) throw new Error(body.error || "store");
    return body;
  };

  const showLoggedOut = () => {
    if (headerLink) {
      headerLink.classList.remove("is-linked");
      headerLink.setAttribute("aria-label", "Account");
    }
    if (label) label.textContent = "Kick";
    if (whoEl) whoEl.hidden = true;
    if (connectEl) connectEl.hidden = false;
    if (disconnectEl) disconnectEl.hidden = true;
    if (statusEl) statusEl.textContent = "Not connected.";
  };

  const showLinked = (account) => {
    const name = account.name || "Kick";
    if (label) label.textContent = name;
    if (headerLink) {
      headerLink.classList.add("is-linked");
      headerLink.setAttribute("aria-label", `Kick account, ${name}`);
    }
    if (statusEl) statusEl.textContent = "Connected.";
    if (nameEl) nameEl.textContent = name;
    if (whoEl) whoEl.hidden = false;
    if (avatarEl) {
      const avatar = safeAvatar(account.avatarUrl);
      if (avatar) {
        avatarEl.hidden = false;
        avatarEl.src = avatar;
      } else {
        avatarEl.hidden = true;
        avatarEl.removeAttribute("src");
      }
    }
    if (connectEl) connectEl.hidden = true;
    if (disconnectEl) disconnectEl.hidden = false;
  };

  const showEmail = (account) => {
    const verified = Boolean(account && account.emailVerified && account.email);
    if (emailErrorEl && !emailErrorEl.dataset.hold) emailErrorEl.hidden = true;
    if (emailDoneEl) {
      emailDoneEl.hidden = !verified;
      if (verified) emailDoneEl.textContent = `Confirmed as ${account.email}`;
    }
    if (emailForm) emailForm.hidden = verified;
    if (emailStatusEl) emailStatusEl.textContent = verified ? "Email confirmed." : "Email is not confirmed.";
    if (signOutEl) signOutEl.hidden = !(verified || (account && account.linked));
  };

  if (disconnectEl) {
    disconnectEl.addEventListener("click", async () => {
      disconnectEl.disabled = true;
      try {
        const res = await fetch("/api/kick/logout", {
          method: "POST",
          credentials: "same-origin",
          headers: { accept: "application/json", "x-csrf": readCsrf() },
        });
        if (!res.ok) throw new Error("logout");
        location.assign("/account/");
      } catch {
        disconnectEl.disabled = false;
        if (errorEl) {
          errorEl.hidden = false;
          errorEl.textContent = "The disconnect did not go through. Refresh the page and try again.";
        }
      }
    });
  }

  if (emailForm) {
    emailForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const sendBtn = emailForm.querySelector("[data-email-send]");
      if (sendBtn) sendBtn.disabled = true;
      if (emailErrorEl) emailErrorEl.dataset.hold = "";
      try {
        await postAccount("/api/account/email", { email: emailInput ? emailInput.value : "" });
        if (codeForm) codeForm.hidden = false;
        if (emailStatusEl) emailStatusEl.textContent = "Code sent. Check your inbox.";
        if (emailErrorEl) emailErrorEl.hidden = true;
        if (signOutEl) signOutEl.hidden = false;
      } catch (err) {
        showEmailError(err && err.message);
      } finally {
        if (sendBtn) sendBtn.disabled = false;
      }
    });
  }

  if (codeForm) {
    codeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const codeInput = codeForm.querySelector("[data-code-input]");
      const confirmBtn = codeForm.querySelector("[data-code-confirm]");
      if (confirmBtn) confirmBtn.disabled = true;
      try {
        const body = await postAccount("/api/account/email/confirm", {
          code: codeInput ? codeInput.value : "",
        });
        showEmail({ emailVerified: true, email: body.email, linked: disconnectEl && !disconnectEl.hidden });
        if (codeForm) codeForm.hidden = true;
      } catch (err) {
        showEmailError(err && err.message);
      } finally {
        if (confirmBtn) confirmBtn.disabled = false;
      }
    });
  }

  if (signOutEl) {
    signOutEl.addEventListener("click", async () => {
      signOutEl.disabled = true;
      try {
        await postAccount("/api/account/logout", {});
        location.assign("/account/");
      } catch {
        signOutEl.disabled = false;
        showEmailError("store");
      }
    });
  }

  fetch("/api/kick/me", { credentials: "same-origin", headers: { accept: "application/json" } })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error("me"))))
    .then((account) => {
      if (account && account.linked) showLinked(account);
      else showLoggedOut();
      showEmail(account);
    })
    .catch(() => {
      showLoggedOut();
      showEmail(null);
      if (statusEl) statusEl.textContent = "Could not check the Kick account.";
      if (emailStatusEl) emailStatusEl.textContent = "Could not check the email.";
    });
}

function boot() {
  initSlotHost();
  initCopyButtons();
  initTheme();
  initDrawer();
  initSideBoards();
  initBoardDash();
  initPartnerTabs();
  initNav();
  initReveal();
  initParallax();
  initSteps();
  initKickChat();
  initKickAccount();
  initClaimFlow();
  initPartnerMascot();
  initDashLive();
  initJoinReel();
  initStepReels();
  initCardMotion();
  initFooterLogo();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
