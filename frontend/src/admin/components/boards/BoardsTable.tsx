import { fmtDate, money } from "../../lib/format";
import type { Board } from "../../lib/types";
import { AdminLink } from "../AdminLink";

interface BoardsTableProps {
  boards: Board[] | null;
  error: string | null;
  loadingText: string;
  onToggleArchive: (board: Board) => void;
  onDuplicate: (board: Board) => void;
  onDelete: (board: Board) => void;
}

function BoardStatus({ board }: { board: Board }) {
  if (board.archived === 1) return <span>Archived</span>;
  if (board.hidden === 1) return <span>[Hidden]</span>;
  if (Number(board.ends_at) < Date.now()) return <span>Ended</span>;
  return <span>● Active</span>;
}

/** "Title / Slug · Partner · Pool · Players · Ends · Status · Actions" table. */
export function BoardsTable({
  boards,
  error,
  loadingText,
  onToggleArchive,
  onDuplicate,
  onDelete,
}: BoardsTableProps) {
  let body;
  if (error) {
    body = (
      <tr>
        <td colSpan={7} className="admin-status is-error">
          Error: {error}
        </td>
      </tr>
    );
  } else if (!boards) {
    body = (
      <tr>
        <td colSpan={7} className="admin-status">
          {loadingText}
        </td>
      </tr>
    );
  } else if (boards.length === 0) {
    body = (
      <tr>
        <td colSpan={7} className="admin-status">
          No leaderboards yet. Create the first one!
        </td>
      </tr>
    );
  } else {
    body = boards.map((b) => {
      const isArchived = b.archived === 1;
      const placements: string[] = [];
      if (b.show_in_drawer !== 0) placements.push("Sidebar");
      if (b.show_on_home !== 0) placements.push("Home");
      return (
        <tr key={b.slug}>
          <td>
            <strong>{b.title}</strong>
            {b.is_demo === 1 ? <> <span>[DEMO]</span></> : null}
            {b.hidden === 1 ? <> <span>[Hidden]</span></> : null}
            {b.badge?.trim() ? <> <span>[{b.badge.trim().toUpperCase()}]</span></> : null}
            <br />
            <code>{b.slug}</code>
            {placements.length > 0 ? (
              <>
                {" · "}
                <span>{placements.join(", ")}</span>
              </>
            ) : (
              <>
                {" · "}
                <span>Direct URL only</span>
              </>
            )}
          </td>
          <td>{(b.partner || "stake").toUpperCase()}</td>
          <td>
            <strong>{money(b.prize_pool_cents)}</strong>
          </td>
          <td>{b.player_count || 0}</td>
          <td>{fmtDate(b.ends_at)}</td>
          <td>
            <BoardStatus board={b} />
          </td>
          <td>
            <div>
              <AdminLink to={`/leaderboards/${b.slug}/`} className="adm-btn adm-btn--secondary adm-btn--sm">
                Edit
              </AdminLink>{" "}
              <button
                type="button"
                className="adm-btn adm-btn--secondary adm-btn--sm"
                data-action="duplicate-board"
                data-slug={b.slug}
                onClick={() => onDuplicate(b)}
              >
                Duplicate
              </button>{" "}
              <button
                type="button"
                className="adm-btn adm-btn--secondary adm-btn--sm"
                data-action="toggle-archive"
                data-slug={b.slug}
                data-archived={String(b.archived)}
                onClick={() => onToggleArchive(b)}
              >
                {isArchived ? "Restore" : "Archive"}
              </button>{" "}
              <button
                type="button"
                className="adm-btn adm-btn--danger adm-btn--sm"
                data-action="delete-board"
                data-slug={b.slug}
                onClick={() => onDelete(b)}
              >
                Delete
              </button>
            </div>
          </td>
        </tr>
      );
    });
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Title / Slug</th>
            <th>Partner</th>
            <th>Pool ($)</th>
            <th>Players</th>
            <th>Ends</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody data-admin-boards-tbody="">{body}</tbody>
      </table>
    </div>
  );
}
