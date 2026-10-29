/**
 * KDeenOff Admin SPA Controller
 * Ported and tailored from Spicy Stakes admin.
 */
import {
  buildWagerGrowthSchedule,
  formatGrowthCountdown,
  parseWagerGrowthSchedule,
} from "/js/wager-growth-schedule.js";

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

const moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (cents) => moneyFmt.format((Number(cents) || 0) / 100);
const fmtDate = (ms) => (ms ? new Date(Number(ms)).toLocaleString("ru-RU") : "—");

const localISO = (ms) => {
  if (!ms) return "";
  const d = new Date(Number(ms));
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalISO = (s) => (s ? Date.parse(s) || null : null);

function getCsrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)kdeenoff_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

async function api(path, opts = {}) {
  const method = (opts.method || "GET").toUpperCase();
  const headers = new Headers(opts.headers || {});
  headers.set("accept", "application/json");

  if (method !== "GET" && method !== "HEAD") {
    const csrf = getCsrfToken();
    if (csrf) headers.set("x-csrf", csrf);
    if (!headers.has("content-type") && opts.body && typeof opts.body === "string") {
      headers.set("content-type", "application/json");
    }
  }

  const res = await fetch(path, { ...opts, headers, credentials: "same-origin" });
  if (!res.ok) {
    let errData;
    try {
      errData = await res.json();
    } catch {
      errData = { error: `HTTP ${res.status}` };
    }
    const err = new Error(errData.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function showStatus(boxEl, text, type = "success") {
  if (!boxEl) return;
  boxEl.className = `adm-status adm-status--${type}`;
  boxEl.textContent = text;
  boxEl.hidden = false;
  setTimeout(() => {
    boxEl.hidden = true;
  }, 4000);
}

// Modal management
function wireModals() {
  document.querySelectorAll("[data-close-modal]").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".admin-modal").forEach((m) => (m.hidden = true));
    });
  });

  document.querySelectorAll("[data-open-create-board-modal]").forEach((b) => {
    b.addEventListener("click", () => {
      const modal = document.getElementById("modal-create-board");
      if (!modal) return;
      const form = modal.querySelector("form");
      if (form) {
        form.reset();
        const dateInput = form.querySelector('[name="ends_at_local"]');
        if (dateInput) {
          dateInput.value = localISO(Date.now() + 30 * 24 * 3600 * 1000);
        }
      }
      modal.hidden = false;
    });
  });

  const createForm = document.querySelector("[data-form-create-board]");
  if (createForm) {
    createForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(createForm);
      const endsAt = fromLocalISO(fd.get("ends_at_local"));
      const payload = {
        title: fd.get("title"),
        slug: fd.get("slug"),
        subtitle: fd.get("subtitle"),
        prize_pool_cents: Math.round(Number(fd.get("prize_pool_usd") || 0) * 100),
        partner: fd.get("partner"),
        partner_signup_url: fd.get("partner_signup_url"),
        ends_at: endsAt,
        avatar_style: fd.get("avatar_style"),
      };

      try {
        const res = await api("/api/admin/leaderboards", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        document.getElementById("modal-create-board").hidden = true;
        location.href = `/admin/leaderboards/${res.slug}/`;
      } catch (err) {
        alert(`Ошибка создания: ${err.message}`);
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: Home & Boards List
// ─────────────────────────────────────────────────────────────────────────────

async function initBoardsTable() {
  const tbody = document.querySelector("[data-admin-boards-tbody]");
  if (!tbody) return;

  try {
    const data = await api("/api/admin/leaderboards");
    const boards = data.boards || [];

    // Stats
    const activeStat = document.querySelector("[data-stat-active-boards]");
    const playersStat = document.querySelector("[data-stat-total-players]");
    const potStat = document.querySelector("[data-stat-total-pot]");

    if (activeStat) {
      activeStat.textContent = boards.filter((b) => !b.archived).length;
    }
    if (playersStat) {
      const sum = boards.reduce((acc, b) => acc + (b.player_count || 0), 0);
      playersStat.textContent = sum;
    }
    if (potStat) {
      const sum = boards.filter((b) => !b.archived).reduce((acc, b) => acc + (b.prize_pool_cents || 0), 0);
      potStat.textContent = money(sum);
    }

    if (boards.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="admin-status">Лидербордов пока нет. Создайте первый!</td></tr>`;
      return;
    }

    tbody.innerHTML = boards
      .map((b) => {
        const isArchived = b.archived === 1;
        const isEnded = Number(b.ends_at) < Date.now();
        const statusBadge = isArchived
          ? `<span style="color:var(--adm-muted);">Архив</span>`
          : isEnded
            ? `<span style="color:var(--adm-red);">Завершён</span>`
            : `<span style="color:var(--adm-green); font-weight:700;">● Активен</span>`;

        return `
          <tr>
            <td>
              <strong>${escapeHtml(b.title)}</strong><br>
              <code>${escapeHtml(b.slug)}</code>
            </td>
            <td>${escapeHtml((b.partner || "stake").toUpperCase())}</td>
            <td><strong>${money(b.prize_pool_cents)}</strong></td>
            <td>${b.player_count || 0}</td>
            <td>${fmtDate(b.ends_at)}</td>
            <td>${statusBadge}</td>
            <td>
              <div style="display:flex; gap:0.4rem;">
                <a href="/admin/leaderboards/${escapeHtml(b.slug)}/" class="adm-btn adm-btn--secondary adm-btn--sm">
                  Редактировать
                </a>
                <button type="button" class="adm-btn adm-btn--secondary adm-btn--sm" data-action="toggle-archive" data-slug="${escapeHtml(b.slug)}" data-archived="${b.archived}">
                  ${isArchived ? "Восстановить" : "В архив"}
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    tbody.querySelectorAll('[data-action="toggle-archive"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        const slug = btn.getAttribute("data-slug");
        const archived = btn.getAttribute("data-archived") === "1";
        const endpoint = archived ? `/api/admin/leaderboards/${slug}/unarchive` : `/api/admin/leaderboards/${slug}/archive`;
        try {
          await api(endpoint, { method: "POST" });
          initBoardsTable();
        } catch (err) {
          alert(`Ошибка: ${err.message}`);
        }
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="admin-status is-error">Ошибка: ${escapeHtml(err.message)}</td></tr>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: Deep Board Editor
// ─────────────────────────────────────────────────────────────────────────────

function detectEditorSlug() {
  const m = location.pathname.match(/\/admin\/leaderboards\/([a-z0-9-]+)\/?/);
  if (m) return m[1];
  const q = new URLSearchParams(location.search).get("slug");
  return q || "kdeenoff-monthly";
}

async function initBoardEditor() {
  const form = document.querySelector("[data-form-board-settings]");
  if (!form) return;

  const slug = detectEditorSlug();
  const titleEl = document.querySelector("[data-board-edit-title]");
  const slugIndicator = document.querySelector("[data-board-slug-indicator]");
  const publicViewBtn = document.querySelector("[data-btn-view-public]");
  const statusBox = document.getElementById("admin-status-box");

  if (slugIndicator) slugIndicator.textContent = `Slug: ${slug}`;
  if (publicViewBtn) publicViewBtn.href = `/leaderboards/${slug}/`;

  let currentBoard = null;
  let currentPlayers = [];
  let currentSpots = [];

  const loadAll = async () => {
    try {
      const data = await api(`/api/admin/leaderboards/${encodeURIComponent(slug)}`);
      currentBoard = data.board;
      currentPlayers = data.players || [];
      currentSpots = data.spots || [];

      if (titleEl) titleEl.textContent = `Редактор: ${currentBoard.title}`;

      // Populate Settings Form
      form.querySelector('[name="title"]').value = currentBoard.title || "";
      form.querySelector('[name="prize_pool_usd"]').value = (currentBoard.prize_pool_cents || 0) / 100;
      form.querySelector('[name="partner"]').value = currentBoard.partner || "";
      form.querySelector('[name="partner_signup_url"]').value = currentBoard.partner_signup_url || "";
      form.querySelector('[name="ends_at_local"]').value = localISO(currentBoard.ends_at);
      form.querySelector('[name="avatar_style"]').value = currentBoard.avatar_style || "fun-emoji";
      form.querySelector('[name="auto_hidden_above_rank"]').value = currentBoard.auto_hidden_above_rank || 0;
      form.querySelector('[name="auto_rank_by_wagered"]').checked = currentBoard.auto_rank_by_wagered === 1;
      form.querySelector('[name="auto_wager_growth_enabled"]').checked = currentBoard.auto_wager_growth_enabled === 1;
      form.querySelector('[name="auto_wager_growth_pct"]').value = currentBoard.auto_wager_growth_pct || 3;
      form.querySelector('[name="auto_wager_growth_hours"]').value =
        (currentBoard.auto_wager_growth_interval_ms || 43200000) / 3600000;

      renderPlayers();
      renderSpots();
    } catch (err) {
      showStatus(statusBox, `Ошибка загрузки: ${err.message}`, "error");
    }
  };

  const renderPlayers = () => {
    const tbody = document.querySelector("[data-admin-players-tbody]");
    const countEl = document.querySelector("[data-players-count]");
    if (!tbody) return;

    if (countEl) countEl.textContent = `${currentPlayers.length} участников`;

    if (currentPlayers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="admin-status">В этой гонке пока нет игроков. Нажмите "+ Добавить игрока" или "Импорт CSV".</td></tr>`;
      return;
    }

    tbody.innerHTML = currentPlayers
      .map((p) => {
        const avatar = p.avatar_url || `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${encodeURIComponent(p.avatar_sid || p.username)}`;
        return `
          <tr data-player-id="${p.id}">
            <td><strong>#${p.rank || "—"}</strong></td>
            <td>
              <img src="${escapeHtml(avatar)}" alt="" width="32" height="32" style="border-radius:4px; vertical-align:middle;">
            </td>
            <td>
              <input type="text" class="admin-input" style="width:140px;" data-field="username" value="${escapeHtml(p.username)}">
            </td>
            <td>
              <div style="display:flex; align-items:center; gap:0.25rem;">
                <span>$</span>
                <input type="number" class="admin-input" style="width:110px;" step="0.01" data-field="wagered_usd" value="${(p.wagered_cents / 100).toFixed(2)}">
              </div>
            </td>
            <td>
              <div style="display:flex; align-items:center; gap:0.25rem;">
                <span>$</span>
                <input type="number" class="admin-input" style="width:100px;" step="0.01" data-field="prize_usd" value="${(p.prize_cents / 100).toFixed(2)}">
              </div>
            </td>
            <td>
              <label style="display:flex; align-items:center; gap:0.35rem; font-size:0.8rem; cursor:pointer;">
                <input type="checkbox" data-field="wag_growth_enabled" ${p.wag_growth_enabled === 1 ? "checked" : ""}>
                <span>Рост</span>
              </label>
            </td>
            <td>
              <button type="button" class="adm-btn adm-btn--secondary adm-btn--sm" data-action="preview-schedule" data-player-id="${p.id}">
                72h
              </button>
            </td>
            <td style="text-align: right;">
              <div style="display:inline-flex; gap:0.3rem;">
                <button type="button" class="adm-btn adm-btn--primary adm-btn--sm" data-action="save-player" data-player-id="${p.id}">
                  Сохранить
                </button>
                <button type="button" class="adm-btn adm-btn--danger adm-btn--sm" data-action="delete-player" data-player-id="${p.id}">
                  ✕
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    // Wire player action buttons
    tbody.querySelectorAll('[data-action="save-player"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-player-id");
        const tr = tbody.querySelector(`tr[data-player-id="${id}"]`);
        if (!tr) return;

        const payload = {
          username: tr.querySelector('[data-field="username"]').value,
          wagered_cents: Math.round(Number(tr.querySelector('[data-field="wagered_usd"]').value || 0) * 100),
          prize_cents: Math.round(Number(tr.querySelector('[data-field="prize_usd"]').value || 0) * 100),
          wag_growth_enabled: tr.querySelector('[data-field="wag_growth_enabled"]').checked ? 1 : 0,
        };

        try {
          await api(`/api/admin/leaderboards/${slug}/players/${id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
          showStatus(statusBox, "Игрок сохранён ✓");
          loadAll();
        } catch (err) {
          alert(`Ошибка сохранения: ${err.message}`);
        }
      });
    });

    tbody.querySelectorAll('[data-action="delete-player"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Удалить этого игрока из гонки?")) return;
        const id = btn.getAttribute("data-player-id");
        try {
          await api(`/api/admin/leaderboards/${slug}/players/${id}`, { method: "DELETE" });
          showStatus(statusBox, "Игрок удалён");
          loadAll();
        } catch (err) {
          alert(`Ошибка удаления: ${err.message}`);
        }
      });
    });

    tbody.querySelectorAll('[data-action="preview-schedule"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-player-id"));
        const p = currentPlayers.find((x) => x.id === id);
        if (!p) return;
        openScheduleModal(p);
      });
    });
  };

  const renderSpots = () => {
    const tbody = document.querySelector("[data-admin-spots-tbody]");
    if (!tbody) return;

    const spotsMap = new Map();
    for (const sp of currentSpots) spotsMap.set(Number(sp.rank), sp);

    let html = "";
    for (let rank = 1; rank <= 10; rank++) {
      const sp = spotsMap.get(rank);
      const prizeUsd = sp ? (sp.prize_cents / 100).toFixed(2) : "0.00";
      const hidden = sp ? sp.hidden === 1 : false;

      html += `
        <tr data-spot-rank="${rank}">
          <td><strong>#${rank}</strong></td>
          <td>
            <div style="display:flex; align-items:center; gap:0.25rem;">
              <span>$</span>
              <input type="number" class="admin-input" style="width:120px;" step="0.01" data-spot-prize value="${prizeUsd}">
            </div>
          </td>
          <td>
            <label style="display:flex; align-items:center; gap:0.35rem; cursor:pointer;">
              <input type="checkbox" data-spot-hidden ${hidden ? "checked" : ""}>
              <span>Скрыть</span>
            </label>
          </td>
          <td>
            <button type="button" class="adm-btn adm-btn--secondary adm-btn--sm" data-action="save-spot" data-spot-rank="${rank}">
              Сохранить
            </button>
          </td>
        </tr>
      `;
    }
    tbody.innerHTML = html;

    tbody.querySelectorAll('[data-action="save-spot"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        const rank = btn.getAttribute("data-spot-rank");
        const tr = tbody.querySelector(`tr[data-spot-rank="${rank}"]`);
        if (!tr) return;

        const prizeUsd = Number(tr.querySelector("[data-spot-prize]").value || 0);
        const hidden = tr.querySelector("[data-spot-hidden]").checked ? 1 : 0;

        try {
          await api(`/api/admin/leaderboards/${slug}/spots/${rank}`, {
            method: "PATCH",
            body: JSON.stringify({ prize_cents: Math.round(prizeUsd * 100), hidden }),
          });
          showStatus(statusBox, `Место #${rank} сохранено ✓`);
        } catch (err) {
          alert(`Ошибка сохранения spot: ${err.message}`);
        }
      });
    });
  };

  const openScheduleModal = (player) => {
    const modal = document.getElementById("modal-growth-schedule");
    if (!modal) return;
    const titleEl = modal.querySelector("[data-wager-schedule-title]");
    const subEl = modal.querySelector("[data-wager-schedule-subtitle]");
    const listEl = modal.querySelector("[data-wager-schedule-list]");

    if (titleEl) titleEl.textContent = `План роста (72ч) · ${player.username}`;
    if (subEl) subEl.textContent = `Текущий вагер: ${money(player.wagered_cents)}`;

    const interval = (player.wag_growth_hours ? player.wag_growth_hours * 3600000 : currentBoard.auto_wager_growth_interval_ms) || 43200000;
    const pct = player.wag_growth_pct || currentBoard.auto_wager_growth_pct || 3;

    const items = buildWagerGrowthSchedule({
      playerId: player.id,
      boardId: currentBoard.id,
      startWageredCents: player.wagered_cents,
      anchorMs: Date.now(),
      intervalMs: interval,
      targetPct: pct,
    });

    if (listEl) {
      listEl.innerHTML = items.length
        ? items
            .map(
              (it, i) => `
              <li class="growth-timeline__item">
                <span>Тик #${i + 1} (${new Date(it.at_ms).toLocaleString("ru-RU")})</span>
                <strong>+${it.pct}% → ${money(it.wagered_cents)}</strong>
              </li>`,
            )
            .join("")
        : `<li class="growth-timeline__item">Авто-рост выключен или интервал не задан.</li>`;
    }
    modal.hidden = false;
  };

  // Header quick buttons
  document.querySelector("[data-btn-save-board]")?.addEventListener("click", async () => {
    const fd = new FormData(form);
    const endsAt = fromLocalISO(fd.get("ends_at_local"));
    const payload = {
      title: fd.get("title"),
      subtitle: fd.get("subtitle"),
      prize_pool_cents: Math.round(Number(fd.get("prize_pool_usd") || 0) * 100),
      partner: fd.get("partner"),
      partner_signup_url: fd.get("partner_signup_url"),
      ends_at: endsAt,
      avatar_style: fd.get("avatar_style"),
      auto_hidden_above_rank: Number(fd.get("auto_hidden_above_rank") || 0),
      auto_rank_by_wagered: form.querySelector('[name="auto_rank_by_wagered"]').checked ? 1 : 0,
      auto_wager_growth_enabled: form.querySelector('[name="auto_wager_growth_enabled"]').checked ? 1 : 0,
      auto_wager_growth_pct: Number(fd.get("auto_wager_growth_pct") || 3),
      auto_wager_growth_interval_ms: Math.round(Number(fd.get("auto_wager_growth_hours") || 12) * 3600000),
    };

    try {
      await api(`/api/admin/leaderboards/${slug}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      showStatus(statusBox, "Параметры гонки успешно сохранены ✓");
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    }
  });

  document.querySelector("[data-btn-auto-rank]")?.addEventListener("click", async () => {
    try {
      const res = await api(`/api/admin/leaderboards/${slug}/players/auto-rank`, { method: "POST" });
      showStatus(statusBox, `Пересчитано ${res.count} игроков по обороту ✓`);
      loadAll();
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    }
  });

  document.querySelector("[data-btn-apply-growth]")?.addEventListener("click", async () => {
    try {
      const res = await api(`/api/admin/leaderboards/${slug}/players/apply-wager-growth`, { method: "POST" });
      showStatus(statusBox, `Применён рост: ${res.players.length} игроков обновлено (${res.tickCount} тиков) ✓`);
      loadAll();
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    }
  });

  // Add Player Modal
  document.querySelector("[data-btn-add-player]")?.addEventListener("click", () => {
    const modal = document.getElementById("modal-add-player");
    if (!modal) return;
    modal.querySelector("form").reset();
    modal.hidden = false;
  });

  document.querySelector("[data-form-add-player]")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      username: fd.get("username"),
      wagered_cents: Math.round(Number(fd.get("wagered_usd") || 0) * 100),
      prize_cents: Math.round(Number(fd.get("prize_usd") || 0) * 100),
      avatar_url: fd.get("avatar_url"),
      wag_growth_enabled: fd.get("wag_growth_enabled") ? 1 : 0,
    };
    try {
      await api(`/api/admin/leaderboards/${slug}/players`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      document.getElementById("modal-add-player").hidden = true;
      showStatus(statusBox, "Игрок добавлен ✓");
      loadAll();
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    }
  });

  // CSV Import Modal
  document.querySelector("[data-btn-import-csv]")?.addEventListener("click", () => {
    const modal = document.getElementById("modal-import-csv");
    if (modal) modal.hidden = false;
  });

  document.querySelector("[data-form-import-csv]")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const res = await api(`/api/admin/leaderboards/${slug}/players/import-csv`, {
        method: "POST",
        body: JSON.stringify({ csv: fd.get("csv_text") }),
      });
      document.getElementById("modal-import-csv").hidden = true;
      showStatus(statusBox, `Импортировано ${res.imported} игроков ✓`);
      loadAll();
    } catch (err) {
      alert(`Ошибка импорта: ${err.message}`);
    }
  });

  loadAll();
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: Site Settings
// ─────────────────────────────────────────────────────────────────────────────

async function initSiteSettings() {
  const form = document.querySelector("[data-form-site-settings]");
  if (!form) return;
  const statusBox = document.getElementById("site-status-box");

  try {
    const data = await api("/api/admin/site");
    const s = data.settings || {};

    if (s.promo_code) form.querySelector('[name="promo_code"]').value = s.promo_code;
    if (s.headline_prize) form.querySelector('[name="headline_prize"]').value = s.headline_prize;
    if (s.partner_name) form.querySelector('[name="partner_name"]').value = s.partner_name;
    if (s.partner_signup_url) form.querySelector('[name="partner_signup_url"]').value = s.partner_signup_url;
    if (s.kick_channel) form.querySelector('[name="kick_channel"]').value = s.kick_channel;
    if (s.kick_url) form.querySelector('[name="kick_url"]').value = s.kick_url;
    if (s.telegram_url) form.querySelector('[name="telegram_url"]').value = s.telegram_url;
  } catch (err) {
    showStatus(statusBox, `Ошибка загрузки: ${err.message}`, "error");
  }

  document.querySelector("[data-btn-save-site]")?.addEventListener("click", async () => {
    const fd = new FormData(form);
    try {
      for (const [k, v] of fd.entries()) {
        await api("/api/admin/site", {
          method: "POST",
          body: JSON.stringify({ key: k, value: String(v) }),
        });
      }
      showStatus(statusBox, "Настройки сайта успешно сохранены ✓");
    } catch (err) {
      showStatus(statusBox, `Ошибка: ${err.message}`, "error");
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: Audit Log
// ─────────────────────────────────────────────────────────────────────────────

async function initAuditLog() {
  const tbody = document.querySelector("[data-admin-audit-tbody]");
  if (!tbody) return;

  const load = async () => {
    try {
      const data = await api("/api/admin/audit");
      const rows = data.entries || [];
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="admin-status">Записей в журнале пока нет.</td></tr>`;
        return;
      }
      tbody.innerHTML = rows
        .map(
          (e) => `
          <tr>
            <td>${fmtDate(e.at)}</td>
            <td>${escapeHtml(e.actor_email || "admin")}</td>
            <td><code>${escapeHtml(e.action)}</code></td>
            <td>${escapeHtml(e.target || "—")}</td>
            <td><code style="font-size:0.75rem;">${escapeHtml(e.meta_json || "")}</code></td>
          </tr>
        `,
        )
        .join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="admin-status is-error">Ошибка: ${escapeHtml(err.message)}</td></tr>`;
    }
  };

  document.querySelector("[data-btn-refresh-audit]")?.addEventListener("click", load);
  load();
}

// ─────────────────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  wireModals();
  const page = document.body.dataset.adminPage;

  if (page === "home" || page === "boards-list") {
    initBoardsTable();
  } else if (page === "board-editor") {
    initBoardEditor();
  } else if (page === "site-settings") {
    initSiteSettings();
  } else if (page === "audit") {
    initAuditLog();
  }
});
