import { useState } from "react";
import { api, errorMessage } from "../../lib/api";
import type { Player } from "../../lib/types";
import type { StatusType } from "../../hooks/useStatus";

interface PlayersTableProps {
  slug: string;
  players: Player[] | null;
  /** Load counter: rows are re-created (edits dropped) after every reload. */
  version: number;
  showStatus: (text: string, type?: StatusType) => void;
  onChanged: () => void;
  onPreview: (player: Player) => void;
}

/** "Race players" table (`data-admin-players-tbody`). */
export function PlayersTable({ slug, players, version, showStatus, onChanged, onPreview }: PlayersTableProps) {
  let body;
  if (!players) {
    body = (
      <tr>
        <td colSpan={8} className="admin-status">
          Loading players…
        </td>
      </tr>
    );
  } else if (players.length === 0) {
    body = (
      <tr>
        <td colSpan={8} className="admin-status">
          No players in this race yet. Click "+ Add player" or "Import CSV".
        </td>
      </tr>
    );
  } else {
    body = players.map((p) => (
      <PlayerRow
        key={`${version}:${p.id}`}
        slug={slug}
        player={p}
        showStatus={showStatus}
        onChanged={onChanged}
        onPreview={onPreview}
      />
    ));
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Avatar</th>
            <th>Player username</th>
            <th>Wager ($)</th>
            <th>Prize ($)</th>
            <th>Auto-growth</th>
            <th>72h Plan</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody data-admin-players-tbody="">{body}</tbody>
      </table>
    </div>
  );
}

interface PlayerRowProps {
  slug: string;
  player: Player;
  showStatus: (text: string, type?: StatusType) => void;
  onChanged: () => void;
  onPreview: (player: Player) => void;
}

function PlayerRow({ slug, player: p, showStatus, onChanged, onPreview }: PlayerRowProps) {
  const [username, setUsername] = useState(p.username);
  const [wagered, setWagered] = useState((p.wagered_cents / 100).toFixed(2));
  const [prize, setPrize] = useState((p.prize_cents / 100).toFixed(2));
  const [growth, setGrowth] = useState(p.wag_growth_enabled === 1);

  const customAvatar = p.avatar_url && !p.avatar_url.includes("dicebear.com") ? p.avatar_url : "";
  const avatar =
    customAvatar ||
    (p.is_registered
      ? `/api/leaderboards/avatar/${encodeURIComponent((p.username || p.avatar_sid || String(p.id)).toLowerCase())}.svg?v=ape3`
      : "/api/leaderboards/avatar/neutral.svg?v=zeus1&preset=neutral");

  const save = async () => {
    const payload = {
      username,
      wagered_cents: Math.round(Number(wagered || 0) * 100),
      prize_cents: Math.round(Number(prize || 0) * 100),
      wag_growth_enabled: growth ? 1 : 0,
    };
    try {
      await api(`/api/admin/leaderboards/${slug}/players/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      showStatus("Player saved ✓");
      onChanged();
    } catch (err) {
      alert(`Save failed: ${errorMessage(err)}`);
    }
  };

  const remove = async () => {
    if (!confirm("Remove this player from the race?")) return;
    try {
      await api(`/api/admin/leaderboards/${slug}/players/${p.id}`, { method: "DELETE" });
      showStatus("Player removed");
      onChanged();
    } catch (err) {
      alert(`Delete failed: ${errorMessage(err)}`);
    }
  };

  return (
    <tr data-player-id={p.id}>
      <td>
        <strong>#{p.rank || "—"}</strong>
      </td>
      <td>
        <img src={avatar} alt="" width="32" height="32" />
      </td>
      <td>
        <input
          type="text"
          className="admin-input"
          data-field="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </td>
      <td>
        <div>
          <span>$</span>{" "}
          <input
            type="number"
            className="admin-input"
            step="0.01"
            data-field="wagered_usd"
            value={wagered}
            onChange={(e) => setWagered(e.target.value)}
          />
        </div>
      </td>
      <td>
        <div>
          <span>$</span>{" "}
          <input
            type="number"
            className="admin-input"
            step="0.01"
            data-field="prize_usd"
            value={prize}
            onChange={(e) => setPrize(e.target.value)}
          />
        </div>
      </td>
      <td>
        <label>
          <input
            type="checkbox"
            data-field="wag_growth_enabled"
            checked={growth}
            onChange={(e) => setGrowth(e.target.checked)}
          />{" "}
          <span>Growth</span>
        </label>
      </td>
      <td>
        <button
          type="button"
          className="adm-btn adm-btn--secondary adm-btn--sm"
          data-action="preview-schedule"
          data-player-id={p.id}
          onClick={() => onPreview(p)}
        >
          72h
        </button>
      </td>
      <td>
        <div>
          <button
            type="button"
            className="adm-btn adm-btn--primary adm-btn--sm"
            data-action="save-player"
            data-player-id={p.id}
            onClick={save}
          >
            Save
          </button>{" "}
          <button
            type="button"
            className="adm-btn adm-btn--danger adm-btn--sm"
            data-action="delete-player"
            data-player-id={p.id}
            onClick={remove}
          >
            ✕
          </button>
        </div>
      </td>
    </tr>
  );
}
