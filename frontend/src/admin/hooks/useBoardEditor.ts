import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";
import type { Board, BoardDetail, Player, Spot } from "../lib/types";
import type { StatusType } from "./useStatus";

/**
 * Board editor data (legacy `loadAll`): board + players + spots.
 * `version` increases on every successful load; the editor uses it as a React key
 * so the settings form and the player / spot rows are re-filled from the server
 * after each reload, exactly like the old full re-render.
 */
export function useBoardEditor(slug: string, showStatus: (text: string, type?: StatusType) => void) {
  const [board, setBoard] = useState<Board | null>(null);
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [spots, setSpots] = useState<Spot[] | null>(null);
  const [version, setVersion] = useState(0);

  const loadAll = useCallback(async () => {
    try {
      const data = await api<BoardDetail>(`/api/admin/leaderboards/${encodeURIComponent(slug)}`);
      setBoard(data.board);
      setPlayers(data.players || []);
      setSpots(data.spots || []);
      setVersion((v) => v + 1);
    } catch (err) {
      showStatus(`Load failed: ${errorMessage(err)}`, "error");
    }
  }, [slug, showStatus]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  return { board, players, spots, version, loadAll };
}

/** Slug from `/admin/leaderboards/<slug>/` (or `?slug=`), defaulting to `kdeenoff-monthly`. */
export function detectEditorSlug(fullPathname: string, search: string): string {
  const m = fullPathname.match(/\/admin\/leaderboards\/([a-z0-9-]+)\/?/);
  if (m) return m[1];
  const q = new URLSearchParams(search).get("slug");
  return q || "kdeenoff-monthly";
}
