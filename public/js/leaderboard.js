/**
 * Fills every leaderboard shell from /api/leaderboards.
 * Homepage and board pages share this script; each page keeps its own markup.
 */
import {
  boardCadence,
  dhms,
  escapeHtml,
  fetchBoards,
  money,
  moneyShort,
  onTick,
  partnerLabel,
  partnerTheme,
  slugFromPath,
} from "./boards-api.js";

const EMPTY_COPY = "No players yet — be the first on the board!";
const ERROR_COPY = "Could not load this leaderboard. Refresh the page.";

function paintCountdown(shell, endsAt) {
  const box = shell.querySelector("[data-lb-countdown]");
  if (!box) return;
  const parts = dhms(Number(endsAt) - Date.now());
  box.classList.toggle("is-ended", !parts);
  const values = parts || { d: "00", h: "00", m: "00", s: "00" };
  for (const key of ["d", "h", "m", "s"]) {
    const el = box.querySelector(`[data-cd="${key}"]`);
    if (el) el.textContent = values[key];
  }
}

function rowHtml(player, index) {
  const empty = !!player.empty_spot;
  const name = empty ? "—" : player.display_name || player.username || "—";
  const wager = empty ? "—" : money(player.wagered_cents);
  const prize = Number(player.prize_cents) > 0 ? money(player.prize_cents) : "—";
  const avatar = !empty && player.avatar_url
    ? `<img class="lb-row__avatar" src="${escapeHtml(player.avatar_url)}" alt="" width="36" height="36" loading="lazy">`
    : "";
  const rank = player.rank || index + 1;
  return `<li class="lb-row" style="--i:${index}">
    <span class="lb-row__rank">${escapeHtml(rank)}</span>
    <span class="lb-row__user">${avatar}<span class="lb-row__name">${escapeHtml(name)}</span></span>
    <span class="lb-row__wager">${wager}</span>
    <span class="lb-row__prize">${prize}</span>
  </li>`;
}

function fillPodium(shell, players) {
  for (const rank of [1, 2, 3]) {
    const card = shell.querySelector(`[data-podium-rank="${rank}"]`);
    if (!card) continue;
    const spot = players.find((player) => Number(player.rank) === rank);
    const player = spot && !spot.empty_spot ? spot : null;
    const nameEl = card.querySelector("[data-podium-username]");
    const prizeEl = card.querySelector("[data-podium-prize]");
    const wagerEl = card.querySelector("[data-podium-wager]");
    const avatarEl = card.querySelector("[data-podium-avatar]");
    const prize = Number(spot?.prize_cents) > 0 ? money(spot.prize_cents) : "—";

    if (!player) {
      card.classList.add("is-empty");
      card.classList.remove("is-in");
      if (nameEl) nameEl.textContent = "—";
      if (prizeEl) prizeEl.textContent = prize;
      if (wagerEl) wagerEl.textContent = "—";
      if (avatarEl) avatarEl.removeAttribute("src");
      continue;
    }

    card.classList.remove("is-empty");
    card.classList.add("is-in");
    if (nameEl) nameEl.textContent = player.display_name || player.username || "—";
    if (prizeEl) prizeEl.textContent = Number(player.prize_cents) > 0 ? money(player.prize_cents) : "—";
    if (wagerEl) wagerEl.textContent = money(player.wagered_cents);
    if (avatarEl) {
      if (player.avatar_url) avatarEl.src = player.avatar_url;
      else avatarEl.removeAttribute("src");
    }
  }
}

function renderTabs(shell, boards, activeSlug, onPick) {
  const tabs = shell.querySelector("[data-lb-tabs]");
  if (!tabs || !shell.hasAttribute("data-lb-switcher")) return;
  if (boards.length < 2) {
    tabs.hidden = true;
    tabs.replaceChildren();
    return;
  }
  tabs.hidden = false;
  tabs.innerHTML = boards
    .map((board) => {
      const selected = board.slug === activeSlug ? "true" : "false";
      const label = board.title || boardCadence(board);
      return `<button type="button" class="seg__btn" role="tab" id="lb-tab-${escapeHtml(board.slug)}" aria-selected="${selected}" data-lb-tab="${escapeHtml(board.slug)}">${escapeHtml(label)}</button>`;
    })
    .join("");
  if (tabs.dataset.bound === "1") return;
  tabs.dataset.bound = "1";
  tabs.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-lb-tab]");
    if (!btn || btn.getAttribute("aria-selected") === "true") return;
    onPick(btn.getAttribute("data-lb-tab"));
  });
}

function setMessage(shell, text, show) {
  const empty = shell.querySelector("[data-lb-empty]");
  if (!empty) return;
  empty.textContent = text;
  empty.hidden = !show;
}

async function loadBoard(shell, slug) {
  const mine = (shell._lbToken = (shell._lbToken || 0) + 1);
  shell.classList.add("is-loading");
  const rowsEl = shell.querySelector("[data-lb-rows]");
  try {
    const res = await fetch(`/api/leaderboards/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (mine !== shell._lbToken) return;
    const board = data.board;
    const players = [...(data.players || [])].sort(
      (a, b) => (Number(a.rank) || 0) - (Number(b.rank) || 0),
    );
    const listed = players.filter((player) => !player.empty_spot);
    if (!board) throw new Error("missing");

    shell.dataset.partner = partnerTheme(board.partner);
    const partnerName = shell.querySelector("[data-lb-partner-name]");
    if (partnerName) partnerName.textContent = partnerLabel(board.partner);
    const pool = shell.querySelector("[data-lb-pool-short]");
    if (pool) pool.textContent = moneyShort(board.prize_pool_cents);
    const subtitle = shell.querySelector("[data-lb-subtitle]");
    if (subtitle && board.subtitle) subtitle.textContent = board.subtitle;
    const label = shell.querySelector("[data-lb-partner-label]");
    if (label) label.textContent = partnerLabel(board.partner);
    const cta = shell.querySelector("[data-lb-partner-cta]");
    if (cta) {
      if (board.partner_signup_url) {
        cta.hidden = false;
        cta.href = board.partner_signup_url;
      } else {
        cta.hidden = true;
      }
    }
    if (shell._lbStop) shell._lbStop();
    shell._lbStop = onTick(() => paintCountdown(shell, board.ends_at));
    fillPodium(shell, players);

    if (rowsEl) {
      if (!listed.length) {
        rowsEl.replaceChildren();
        shell.classList.remove("has-rows");
        setMessage(shell, EMPTY_COPY, !players.length);
      } else {
        rowsEl.innerHTML = listed.map(rowHtml).join("");
        shell.classList.add("has-rows");
        setMessage(shell, EMPTY_COPY, false);
      }
    }
    if (shell.hasAttribute("data-lb-collapse")) shell.classList.add("is-collapsed");
  } catch (err) {
    if (mine !== shell._lbToken) return;
    if (rowsEl) rowsEl.replaceChildren();
    shell.classList.remove("has-rows");
    setMessage(shell, ERROR_COPY, true);
  } finally {
    if (mine === shell._lbToken) shell.classList.remove("is-loading");
  }
}

async function initShell(shell) {
  if (shell.hasAttribute("data-lb-collapse")) shell.classList.add("is-collapsed");
  const boards = await fetchBoards();
  const explicit = (shell.getAttribute("data-lb-slug") || "").trim();
  const fromPath = slugFromPath();
  let slug = explicit || fromPath || boards[0]?.slug || "";

  const pick = (next) => {
    slug = next;
    renderTabs(shell, boards, slug, pick);
    loadBoard(shell, slug);
  };

  if (!slug) {
    const rowsEl = shell.querySelector("[data-lb-rows]");
    if (rowsEl) rowsEl.replaceChildren();
    shell.classList.remove("has-rows");
    setMessage(shell, EMPTY_COPY, true);
    return;
  }

  renderTabs(shell, boards, slug, pick);
  loadBoard(shell, slug);
}

document.querySelectorAll("[data-leaderboard-shell]").forEach((shell) => {
  initShell(shell);
});
