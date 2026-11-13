import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";
import type { Board } from "../lib/types";

/** Leaderboards list (legacy `initBoardsTable`): load, reload, archive / restore. */
export function useBoards() {
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ boards?: Board[] }>("/api/admin/leaderboards");
      setBoards(data.boards || []);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleArchive = useCallback(
    async (board: Board) => {
      const slug = board.slug;
      const archived = String(board.archived) === "1";
      const endpoint = archived
        ? `/api/admin/leaderboards/${slug}/unarchive`
        : `/api/admin/leaderboards/${slug}/archive`;
      try {
        await api(endpoint, { method: "POST" });
        void load();
      } catch (err) {
        alert(`Error: ${errorMessage(err)}`);
      }
    },
    [load],
  );

  const duplicateBoard = useCallback(
    async (board: Board) => {
      try {
        await api(`/api/admin/leaderboards/${encodeURIComponent(board.slug)}/duplicate`, {
          method: "POST",
        });
        await load();
      } catch (err) {
        alert(`Duplicate failed: ${errorMessage(err)}`);
      }
    },
    [load],
  );

  const deleteBoard = useCallback(
    async (board: Board) => {
      if (!confirm(`Permanently delete leaderboard "${board.title}" (${board.slug}) and all its players?`)) {
        return;
      }
      try {
        await api(`/api/admin/leaderboards/${encodeURIComponent(board.slug)}`, {
          method: "DELETE",
        });
        await load();
      } catch (err) {
        alert(`Delete failed: ${errorMessage(err)}`);
      }
    },
    [load],
  );

  return { boards, error, reload: load, toggleArchive, duplicateBoard, deleteBoard };
}
