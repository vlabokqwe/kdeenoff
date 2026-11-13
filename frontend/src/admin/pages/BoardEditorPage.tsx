import { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ADMIN_BASE, AdminLink } from "../components/AdminLink";
import { StatusBox } from "../components/StatusBox";
import { AddPlayerModal } from "../components/board/AddPlayerModal";
import { BoardSettingsForm } from "../components/board/BoardSettingsForm";
import { buildPlayerSchedule, GrowthScheduleModal, type GrowthSchedule } from "../components/board/GrowthScheduleModal";
import { ImportCsvModal } from "../components/board/ImportCsvModal";
import { PlayersTable } from "../components/board/PlayersTable";
import { SpotsTable } from "../components/board/SpotsTable";
import { useAdminPage } from "../hooks/useAdminPage";
import { detectEditorSlug, useBoardEditor } from "../hooks/useBoardEditor";
import { useModal } from "../hooks/useModal";
import { useStatus } from "../hooks/useStatus";
import { api, errorMessage } from "../lib/api";
import { fromLocalISO } from "../lib/format";
import type { Player } from "../lib/types";

/** `/admin/leaderboards/:slug/` — one editor instance per slug. */
export function BoardEditorRoute() {
  const location = useLocation();
  const slug = detectEditorSlug(`${ADMIN_BASE}${location.pathname}`, location.search);
  return <BoardEditorPage key={slug} slug={slug} />;
}

function BoardEditorPage({ slug }: { slug: string }) {
  useAdminPage("board-editor");
  const navigate = useNavigate();
  const [status, showStatus] = useStatus();
  const { board, players, spots, version, loadAll } = useBoardEditor(slug, showStatus);
  const formRef = useRef<HTMLFormElement>(null);

  const addModal = useModal();
  const csvModal = useModal();
  const scheduleModal = useModal<GrowthSchedule>();

  // `data-close-modal` buttons close every modal of the page.
  const closeAllModals = () => {
    addModal.close();
    csvModal.close();
    scheduleModal.close();
  };

  const saveBoard = async () => {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const startsAt = fromLocalISO(fd.get("starts_at_local"));
    const endsAt = fromLocalISO(fd.get("ends_at_local"));
    const checked = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | null)?.checked;
    const rawNewSlug = String(fd.get("new_slug") || "").trim();
    const payload = {
      title: fd.get("title"),
      new_slug: rawNewSlug && rawNewSlug !== slug ? rawNewSlug : undefined,
      subtitle: fd.get("subtitle"),
      prize_pool_cents: Math.round(Number(fd.get("prize_pool_usd") || 0) * 100),
      partner: fd.get("partner"),
      partner_signup_url: fd.get("partner_signup_url"),
      badge: fd.get("badge"),
      promo_code: fd.get("promo_code"),
      sort_order: Math.floor(Number(fd.get("sort_order") || 0)),
      starts_at: startsAt ?? undefined,
      ends_at: endsAt,
      avatar_style: fd.get("avatar_style"),
      show_in_drawer: checked("show_in_drawer") ? 1 : 0,
      show_on_home: checked("show_on_home") ? 1 : 0,
      hidden: checked("hidden") ? 1 : 0,
      is_demo: checked("is_demo") ? 1 : 0,
      auto_hidden_above_rank: Number(fd.get("auto_hidden_above_rank") || 0),
      auto_rank_by_wagered: checked("auto_rank_by_wagered") ? 1 : 0,
      auto_wager_growth_enabled: checked("auto_wager_growth_enabled") ? 1 : 0,
      auto_wager_growth_pct: Number(fd.get("auto_wager_growth_pct") || 3),
      auto_wager_growth_interval_ms: Math.round(Number(fd.get("auto_wager_growth_hours") || 12) * 3600000),
    };

    try {
      const res = await api<{ slug?: string }>(`/api/admin/leaderboards/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      if (res.slug && res.slug !== slug) {
        navigate(`/leaderboards/${res.slug}/`);
      } else {
        showStatus("Race settings saved ✓");
        void loadAll();
      }
    } catch (err) {
      alert(`Error: ${errorMessage(err)}`);
    }
  };

  const duplicateBoard = async () => {
    try {
      const res = await api<{ slug: string }>(`/api/admin/leaderboards/${encodeURIComponent(slug)}/duplicate`, {
        method: "POST",
      });
      navigate(`/leaderboards/${res.slug}/`);
    } catch (err) {
      alert(`Duplicate failed: ${errorMessage(err)}`);
    }
  };

  const deleteBoard = async () => {
    const label = board ? `"${board.title}" (${slug})` : slug;
    if (!confirm(`Permanently delete leaderboard ${label} and all its players?`)) return;
    try {
      await api(`/api/admin/leaderboards/${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      navigate("/leaderboards/");
    } catch (err) {
      alert(`Delete failed: ${errorMessage(err)}`);
    }
  };

  const autoRank = async () => {
    try {
      const res = await api<{ count: number }>(`/api/admin/leaderboards/${slug}/players/auto-rank`, {
        method: "POST",
      });
      showStatus(`Re-ranked ${res.count} players by wager ✓`);
      void loadAll();
    } catch (err) {
      alert(`Error: ${errorMessage(err)}`);
    }
  };

  const applyGrowth = async () => {
    try {
      const res = await api<{ players: unknown[]; tickCount: number }>(
        `/api/admin/leaderboards/${slug}/players/apply-wager-growth`,
        { method: "POST" },
      );
      showStatus(`Growth applied: ${res.players.length} players updated (${res.tickCount} ticks) ✓`);
      void loadAll();
    } catch (err) {
      alert(`Error: ${errorMessage(err)}`);
    }
  };

  const openSchedule = (player: Player) => {
    if (!board) return;
    scheduleModal.show(buildPlayerSchedule(player, board));
  };

  return (
    <>
      <main className="admin-main">
        <div className="admin-page-head">
          <div>
            <div>
              <AdminLink to="/leaderboards/">← All leaderboards</AdminLink>
            </div>
            <h1 className="admin-page-title" data-board-edit-title="">
              {board ? `Editor: ${board.title}` : "Edit leaderboard"}
            </h1>
          </div>

          <div className="admin-page-actions">
            <a href={`/leaderboards/${slug}/`} className="adm-btn adm-btn--secondary" data-btn-view-public="" target="_blank">
              Public view ↗
            </a>{" "}
            <button type="button" className="adm-btn adm-btn--secondary" data-btn-duplicate-board="" onClick={duplicateBoard}>
              Duplicate
            </button>{" "}
            <button type="button" className="adm-btn adm-btn--danger" data-btn-delete-board="" onClick={deleteBoard}>
              Delete
            </button>{" "}
            <button type="button" className="adm-btn adm-btn--secondary" data-btn-apply-growth="" onClick={applyGrowth}>
              ⚡ Apply growth tick
            </button>{" "}
            <button type="button" className="adm-btn adm-btn--secondary" data-btn-auto-rank="" onClick={autoRank}>
              ⇅ Auto-rank by wager
            </button>{" "}
            <button type="button" className="adm-btn adm-btn--primary" data-btn-save-board="" onClick={saveBoard}>
              Save settings
            </button>
          </div>
        </div>

        {/* Status message */}
        <StatusBox id="admin-status-box" status={status} />

        {/* 1. Board Settings Card */}
        <div className="admin-card">
          <div className="admin-card__head">
            <h2 className="admin-card__title">Race settings</h2>
            <span data-board-slug-indicator="">Slug: {slug}</span>
          </div>

          <BoardSettingsForm key={version} board={board} formRef={formRef} />
        </div>

        {/* 2. Players Management Card */}
        <div className="admin-card">
          <div className="admin-card__head">
            <div>
              <h2 className="admin-card__title">Race players</h2>
              <span data-players-count="">{players ? players.length : 0} players</span>
            </div>

            <div>
              <button
                type="button"
                className="adm-btn adm-btn--secondary adm-btn--sm"
                data-btn-import-csv=""
                onClick={() => csvModal.show()}
              >
                📥 Import CSV
              </button>{" "}
              <button
                type="button"
                className="adm-btn adm-btn--primary adm-btn--sm"
                data-btn-add-player=""
                onClick={() => addModal.show()}
              >
                + Add player
              </button>
            </div>
          </div>

          <PlayersTable
            slug={slug}
            players={players}
            version={version}
            showStatus={showStatus}
            onChanged={() => void loadAll()}
            onPreview={openSchedule}
          />
        </div>

        {/* 3. Spot Prizes Card */}
        <div className="admin-card">
          <div className="admin-card__head">
            <div>
              <h2 className="admin-card__title">Fixed prizes per spot (Spot Prizes)</h2>
              <p>
                Prize for each rank (1..10+). If a spot prize is set, it overrides the individual prize of the player in
                that spot.
              </p>
            </div>
          </div>

          <SpotsTable
            slug={slug}
            spots={spots}
            version={version}
            prizePoolCents={board?.prize_pool_cents || 0}
            showStatus={showStatus}
            onSaved={() => void loadAll()}
          />
        </div>
      </main>

      <AddPlayerModal
        slug={slug}
        open={addModal.open}
        nonce={addModal.nonce}
        onClose={closeAllModals}
        showStatus={showStatus}
        onAdded={() => {
          addModal.close();
          void loadAll();
        }}
      />

      <ImportCsvModal
        slug={slug}
        open={csvModal.open}
        onClose={closeAllModals}
        showStatus={showStatus}
        onImported={() => {
          csvModal.close();
          void loadAll();
        }}
      />

      <GrowthScheduleModal open={scheduleModal.open} schedule={scheduleModal.data} onClose={closeAllModals} />
    </>
  );
}
