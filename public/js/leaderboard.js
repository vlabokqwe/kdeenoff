/**
 * KDeenOff Leaderboard Hydration Controller
 * Fetches /api/leaderboards/<slug> and renders the slot-styled leaderboard.
 */

const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const money = (cents) => moneyFmt.format((Number(cents) || 0) / 100);

const numberFmt = new Intl.NumberFormat("en-US");
const fmtNum = (n) => numberFmt.format(n || 0);

function detectSlug(shell) {
  const explicit = shell.getAttribute("data-lb-slug");
  if (explicit) return explicit;
  const m = location.pathname.match(/^\/leaderboards\/([a-z0-9][a-z0-9-]{0,38}[a-z0-9])\/?$/);
  return m ? m[1] : "kdeenoff-monthly";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCountdown(ms) {
  if (ms <= 0) return "Гонка завершена!";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const pad = (n) => String(n).padStart(2, "0");
  if (days > 0) {
    return `${days}д ${pad(hours)}ч ${pad(mins)}м ${pad(secs)}с`;
  }
  return `${pad(hours)}ч ${pad(mins)}м ${pad(secs)}с`;
}

function rankBadgeHtml(rank) {
  if (rank === 1) return `<span class="rank-badge rank-badge--1" title="1-е место">👑 1</span>`;
  if (rank === 2) return `<span class="rank-badge rank-badge--2" title="2-е место">🥈 2</span>`;
  if (rank === 3) return `<span class="rank-badge rank-badge--3" title="3-е место">🥉 3</span>`;
  
  // Poker rank badges for slot theme
  if (rank === 4) return `<span class="rank-badge rank-badge--poker rank-badge--a">A</span>`;
  if (rank === 5) return `<span class="rank-badge rank-badge--poker rank-badge--k">K</span>`;
  if (rank === 6) return `<span class="rank-badge rank-badge--poker rank-badge--q">Q</span>`;
  if (rank === 7) return `<span class="rank-badge rank-badge--poker rank-badge--j">J</span>`;
  if (rank === 8) return `<span class="rank-badge rank-badge--poker rank-badge--10">10</span>`;
  
  return `<span class="rank-badge rank-badge--num">#${rank}</span>`;
}

function renderPlayerRow(player, rankIndex) {
  const rank = player.rank || rankIndex + 1;
  const username = player.display_name || player.username || "—";
  const wager = money(player.wagered_cents);
  const prize = player.prize_cents > 0 ? money(player.prize_cents) : "—";
  const avatar = player.avatar_url || `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${encodeURIComponent(username)}`;
  const isPodium = rank <= 3;

  return `
    <li class="slot-row ${isPodium ? `slot-row--top slot-row--top-${rank}` : ""}" data-player-row data-username="${escapeHtml(username.toLowerCase())}">
      <div class="slot-cell cell-rank">
        ${rankBadgeHtml(rank)}
      </div>

      <div class="slot-cell cell-player">
        <div class="player-avatar-shell">
          <img src="${escapeHtml(avatar)}" alt="" class="player-avatar-img" width="36" height="36" loading="lazy">
        </div>
        <span class="player-username" title="${escapeHtml(player.username || username)}">
          ${escapeHtml(username)}
        </span>
      </div>

      <div class="slot-cell cell-wager">
        <span class="wager-val">${wager}</span>
      </div>

      <div class="slot-cell cell-prize">
        ${player.prize_cents > 0 ? `<span class="prize-pill">${prize}</span>` : `<span class="prize-none">—</span>`}
      </div>
    </li>
  `;
}

function updatePodium(shell, players) {
  const top1 = players.find((p) => p.rank === 1);
  const top2 = players.find((p) => p.rank === 2);
  const top3 = players.find((p) => p.rank === 3);

  const fillCard = (rank, p) => {
    const card = shell.querySelector(`[data-podium-rank="${rank}"]`);
    if (!card) return;
    if (!p) {
      card.classList.add("is-empty");
      return;
    }
    card.classList.remove("is-empty");
    const nameEl = card.querySelector(`[data-podium-username="${rank}"]`);
    const prizeEl = card.querySelector(`[data-podium-prize="${rank}"]`);
    const wagerEl = card.querySelector(`[data-podium-wager="${rank}"]`);
    const avatarEl = card.querySelector(`[data-podium-avatar="${rank}"]`);

    if (nameEl) nameEl.textContent = p.display_name || p.username;
    if (prizeEl) prizeEl.textContent = money(p.prize_cents);
    if (wagerEl) wagerEl.textContent = `Оборот: ${money(p.wagered_cents)}`;
    if (avatarEl && p.avatar_url) avatarEl.src = p.avatar_url;
  };

  fillCard(1, top1);
  fillCard(2, top2);
  fillCard(3, top3);
}

function startTimer(shell, endsAt) {
  const timerVal = shell.querySelector("[data-lb-timer-value]");
  const timerLabel = shell.querySelector("[data-lb-timer-label]");
  if (!timerVal || !endsAt) return;

  const update = () => {
    const diff = Number(endsAt) - Date.now();
    timerVal.textContent = formatCountdown(diff);
    if (diff <= 0 && timerLabel) {
      timerLabel.textContent = "РАУНД ОКОНЧЕН";
    }
  };

  update();
  setInterval(update, 1000);
}

function wireSearch(shell) {
  const searchInput = shell.querySelector("[data-lb-search]");
  if (!searchInput) return;

  searchInput.addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    const rows = shell.querySelectorAll("[data-player-row]");
    let visibleCount = 0;

    rows.forEach((r) => {
      const u = r.getAttribute("data-username") || "";
      const match = !q || u.includes(q);
      r.style.display = match ? "" : "none";
      if (match) visibleCount++;
    });

    const emptyMsg = shell.querySelector("[data-lb-empty]");
    if (emptyMsg) {
      emptyMsg.hidden = visibleCount > 0 || rows.length === 0;
      if (visibleCount === 0 && q) {
        emptyMsg.textContent = `Игрок с ником "${q}" не найден в списке.`;
      }
    }
  });
}

async function hydrateBoard(shell) {
  const slug = detectSlug(shell);
  if (!slug) return;

  const titleEl = shell.querySelector("[data-lb-title]");
  const subtitleEl = shell.querySelector("[data-lb-subtitle]");
  const potEl = shell.querySelector("[data-lb-prize-pool-value]");
  const rowsEl = shell.querySelector("[data-lb-rows]");
  const partnerNameEl = shell.querySelector("[data-lb-partner-name]");
  const partnerCtaEl = shell.querySelector("[data-lb-partner-cta]");

  try {
    const res = await fetch(`/api/leaderboards/${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const board = data.board;
    const players = data.players || [];

    if (!board) return;

    if (titleEl && board.title) {
      titleEl.innerHTML = `<span class="slot-cabinet__title-text">${escapeHtml(board.title.toUpperCase())}</span>`;
    }
    if (subtitleEl && board.subtitle) {
      subtitleEl.textContent = board.subtitle;
    }
    if (potEl && board.prize_pool_cents != null) {
      potEl.textContent = money(board.prize_pool_cents);
    }
    if (partnerNameEl && board.partner) {
      partnerNameEl.textContent = board.partner.toUpperCase();
    }
    if (partnerCtaEl && board.partner_signup_url) {
      partnerCtaEl.href = board.partner_signup_url;
    }

    // Timer
    if (board.ends_at) {
      startTimer(shell, board.ends_at);
    }

    // Podium (Top 3)
    updatePodium(shell, players);

    // Render table rows
    if (rowsEl) {
      if (players.length === 0) {
        rowsEl.innerHTML = "";
        const emptyEl = shell.querySelector("[data-lb-empty]");
        if (emptyEl) emptyEl.hidden = false;
      } else {
        rowsEl.innerHTML = players.map((p, idx) => renderPlayerRow(p, idx)).join("");
      }
    }

    wireSearch(shell);
  } catch (err) {
    console.error("Failed to load leaderboard:", err);
    if (rowsEl) {
      rowsEl.innerHTML = `<li class="slot-board__error">Не удалось загрузить данные гонки. Попробуйте обновить страницу.</li>`;
    }
  }
}

export function initLeaderboards() {
  document.querySelectorAll("[data-leaderboard-shell]").forEach(hydrateBoard);
}

// Auto-run if DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLeaderboards);
} else {
  initLeaderboards();
}
