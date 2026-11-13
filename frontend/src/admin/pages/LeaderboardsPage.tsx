import { BoardsTable } from "../components/boards/BoardsTable";
import { CreateBoardModal } from "../components/boards/CreateBoardModal";
import { useAdminPage } from "../hooks/useAdminPage";
import { useBoards } from "../hooks/useBoards";
import { useModal } from "../hooks/useModal";

/** `/admin/leaderboards/` — all races (active, ended, archived) + create race modal. */
export function LeaderboardsPage() {
  useAdminPage("boards-list");
  const { boards, error, toggleArchive, duplicateBoard, deleteBoard } = useBoards();
  const createModal = useModal();

  return (
    <>
      <main className="admin-main">
        <div className="admin-page-head">
          <div>
            <h1 className="admin-page-title">All races &amp; leaderboards</h1>
            <p className="admin-page-sub">Active, ended and archived leaderboards</p>
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

        <div className="admin-card">
          <BoardsTable
            boards={boards}
            error={error}
            loadingText="Loading…"
            onToggleArchive={toggleArchive}
            onDuplicate={duplicateBoard}
            onDelete={deleteBoard}
          />
        </div>
      </main>

      <CreateBoardModal open={createModal.open} nonce={createModal.nonce} onClose={createModal.close} />
    </>
  );
}
