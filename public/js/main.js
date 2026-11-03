/**
 * KDeenOff — left menu, leaderboards drawer, drawer leaderboard cards, copy buttons,
 * partner tabs, nav highlight, scroll reveals, hero parallax and the raffle steps animation.
 */
import {
  countdown,
  escapeHtml,
  fetchBoards,
  moneyShort,
  onTick,
  partnerLabel,
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

function sideBoardHtml(b, current) {
  const theme = partnerTheme(b.partner);
  const active = b.slug === current ? " is-active" : "";
  return `
    <a class="side-board${active}" data-partner="${theme}" href="/leaderboards/${encodeURIComponent(b.slug)}/" data-ends="${Number(b.ends_at) || 0}">
      <span class="side-board__top">
        <span class="side-board__partner">${escapeHtml(partnerLabel(b.partner))}</span>
        <span class="side-board__live">Live</span>
      </span>
      <span class="side-board__pool">${moneyShort(b.prize_pool_cents)}</span>
      <span class="side-board__title">${escapeHtml(b.title || "Leaderboard")}</span>
      <span class="side-board__timer">
        <img src="/img/icons/nav-timer.webp" alt="" width="18" height="18">
        <time data-side-timer>—</time>
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
  onTick(() => {
    const now = Date.now();
    cards.forEach((card) => {
      const left = countdown(Number(card.dataset.ends) - now);
      const t = card.querySelector("[data-side-timer]");
      if (t) t.textContent = left || "Ended";
      card.classList.toggle("is-ended", !left);
    });
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
  if (path.startsWith("/leaderboards")) return set("leaderboards");
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

/* ───────────── Boot ───────────── */

function boot() {
  initCopyButtons();
  initDrawer();
  initSideBoards();
  initPartnerTabs();
  initNav();
  initReveal();
  initParallax();
  initSteps();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
