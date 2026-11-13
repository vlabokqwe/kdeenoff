import { useCallback, useEffect, useState } from "react";
import { AdminLink } from "../components/AdminLink";
import { BoardsTable } from "../components/boards/BoardsTable";
import { CreateBoardModal } from "../components/boards/CreateBoardModal";
import { useAdminPage } from "../hooks/useAdminPage";
import { useBoards } from "../hooks/useBoards";
import { useModal } from "../hooks/useModal";
import { api, errorMessage } from "../lib/api";
import { money } from "../lib/format";
import type { Board, DemoSummary } from "../lib/types";

/** `/admin/` — quick stats + demo data cleanup + races table + create race modal. */
export function OverviewPage() {
  useAdminPage("home");
  const { boards, error, reload, toggleArchive, duplicateBoard, deleteBoard } = useBoards();
  const createModal = useModal();
  const [demo, setDemo] = useState<DemoSummary | null>(null);
  const [purgingDemo, setPurgingDemo] = useState(false);

  const loadDemo = useCallback(async () => {
    try {
      const res = await api<DemoSummary>("/api/admin/demo");
      setDemo(res);
    } catch {
      setDemo(null);
    }
  }, []);

  useEffect(() => {
    void loadDemo();
  }, [loadDemo]);

  const handleDuplicate = async (board: Board) => {
    await duplicateBoard(board);
    void loadDemo();
  };

  const handleDelete = async (board: Board) => {
    await deleteBoard(board);
    void loadDemo();
  };

  const handlePurgeDemo = async () => {
    if (!demo || demo.counts.total === 0) return;
    if (
      !confirm(
        `Delete all demo test data (${demo.counts.boards} demo leaderboards and ${demo.counts.raffles} demo raffles)?`,
      )
    ) {
      return;
    }
    setPurgingDemo(true);
    try {
      await api("/api/admin/demo", { method: "DELETE" });
      await Promise.all([reload(), loadDemo()]);
    } catch (err) {
      alert(`Failed to delete demo data: ${errorMessage(err)}`);
    } finally {
      setPurgingDemo(false);
    }
  };

  const activeBoards = boards ? boards.filter((b) => !b.archived).length : "—";
  const totalPlayers = boards ? boards.reduce((acc, b) => acc + (b.player_count || 0), 0) : "—";
  const totalPot = boards
    ? money(boards.filter((b) => !b.archived).reduce((acc, b) => acc + (b.prize_pool_cents || 0), 0))
    : "—";

  return (
    <>
      <main className="admin-main">
        <div className="admin-page-head">
          <div>
            <h1 className="admin-page-title">KDeenOff Control Panel</h1>
            <p className="admin-page-sub">Manage races, players, wagers and prize spots</p>
          </div>

          <div className="admin-page-actions">
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              data-open-create-board-modal=""
              onClick={() => createModal.show()}
            >
              + Create leaderboard
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="admin-form-grid">
          <div className="admin-card">
            <div className="admin-form-label">ACTIVE RACES</div>
            <div data-stat-active-boards="">{activeBoards}</div>
          </div>
          <div className="admin-card">
            <div className="admin-form-label">TOTAL PLAYERS</div>
            <div data-stat-total-players="">{totalPlayers}</div>
          </div>
          <div className="admin-card">
            <div className="admin-form-label">TOTAL PRIZE POOL</div>
            <div data-stat-total-pot="">{totalPot}</div>
          </div>
        </div>

        {/* Demo Data Cleanup Card */}
        {demo && demo.counts.total > 0 ? (
          <div className="admin-card" data-demo-cleanup-card="">
            <div className="admin-card__head">
              <div>
                <h2 className="admin-card__title">Demo / Test Data Active</h2>
                <p className="admin-page-sub">
                  {demo.counts.boards} demo {demo.counts.boards === 1 ? "leaderboard" : "leaderboards"} and{" "}
                  {demo.counts.raffles} demo {demo.counts.raffles === 1 ? "raffle" : "raffles"} are currently seeded.
                </p>
              </div>
              <button
                type="button"
                className="adm-btn adm-btn--danger"
                disabled={purgingDemo}
                onClick={() => void handlePurgeDemo()}
              >
                {purgingDemo ? "Deleting…" : "Delete all demo data"}
              </button>
            </div>
            <ul>
              {demo.demoBoards.map((b) => (
                <li key={`board-${b.id}`}>
                  Leaderboard: <strong>{b.title}</strong> (<code>{b.slug}</code>) — {money(b.prize_pool_cents)}
                </li>
              ))}
              {demo.demoRaffles.map((r) => (
                <li key={`raffle-${r.id}`}>
                  Raffle: <strong>{r.title}</strong> {r.prize ? `— ${r.prize}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Leaderboards List Card */}
        <div className="admin-card">
          <div className="admin-card__head">
            <h2 className="admin-card__title">Races &amp; Leaderboards</h2>
            <AdminLink to="/leaderboards/" className="adm-btn adm-btn--secondary adm-btn--sm">
              All races →
            </AdminLink>
          </div>

          <BoardsTable
            boards={boards}
            error={error}
            loadingText="Loading leaderboards…"
            onToggleArchive={toggleArchive}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
          />
        </div>
      </main>

      <CreateBoardModal open={createModal.open} nonce={createModal.nonce} onClose={createModal.close} />
    </>
  );
}
