/**
 * Public raffles page. Lists come from /api/raffles.
 */
import { countdown, escapeHtml, onTick } from "./boards-api.js";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatWhen(row) {
  const start = Number(row.starts_at);
  const end = Number(row.ends_at);
  const startLabel = Number.isFinite(start) && start > 0 ? dateFmt.format(start) : "";
  const endLabel = Number.isFinite(end) && end > 0 ? dateFmt.format(end) : "";
  if (startLabel && endLabel && startLabel !== endLabel) return `${startLabel} — ${endLabel}`;
  return endLabel || startLabel || "";
}

function card(row, live) {
  const when = formatWhen(row);
  const art = live ? "/img/deco/mode-raffle.webp" : "/img/deco/mode-boards.webp";
  return `
    <article class="raffle-card${live ? " raffle-card--live" : ""}" data-reveal>
      <div class="raffle-card__art">
        <img class="raffle-card__icon" src="${art}" alt="" width="420" height="420" loading="lazy">
      </div>
      <div class="raffle-card__copy">
        <div class="raffle-card__body">
          <h3 class="raffle-card__title">${escapeHtml(row.title)}</h3>
          ${row.prize ? `<p class="raffle-card__prize">${escapeHtml(row.prize)}</p>` : ""}
          ${when ? `<p class="raffle-card__when">${escapeHtml(when)}</p>` : ""}
          ${row.note ? `<p class="raffle-card__note">${escapeHtml(row.note)}</p>` : ""}
        </div>
        <div class="raffle-card__side">
          ${live
      ? `<span class="tag tag--live">Live</span><time class="raffle-card__timer" data-raffle-ends="${Number(row.ends_at) || 0}">—</time>`
      : row.winner
        ? `<span class="tag tag--gold">Winner</span><strong class="raffle-card__winner">${escapeHtml(row.winner)}</strong>`
        : `<span class="tag">Ended</span>`}
        </div>
      </div>
    </article>`;
}

function paint(list, rows, live) {
  if (!list) return;
  list.innerHTML = rows.length
    ? rows.map((row) => card(row, live)).join("")
    : `<p class="raffle-group__empty">${live ? "No active raffles right now — keep an eye on the stream." : "Nothing here yet."}</p>`;
  requestAnimationFrame(() => list.querySelectorAll("[data-reveal]").forEach((el, i) => {
    el.style.setProperty("--i", i);
    el.classList.add("is-in");
  }));
}

async function loadRaffles() {
  const ongoing = document.querySelector('[data-raffles-list="ongoing"]');
  const past = document.querySelector('[data-raffles-list="past"]');
  if (!ongoing && !past) return;

  try {
    const res = await fetch("/api/raffles", { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    paint(ongoing, data.ongoing || [], true);
    paint(past, data.past || [], false);
    const timers = [...document.querySelectorAll("[data-raffle-ends]")];
    if (timers.length) {
      onTick(() => timers.forEach((t) => {
        t.textContent = countdown(Number(t.dataset.raffleEnds) - Date.now()) || "Ended";
      }));
    }
  } catch {
    const fail = `<p class="raffle-group__empty">Couldn't load raffles.</p>`;
    if (ongoing) ongoing.innerHTML = fail;
    if (past) past.innerHTML = fail;
  }
}

loadRaffles();
