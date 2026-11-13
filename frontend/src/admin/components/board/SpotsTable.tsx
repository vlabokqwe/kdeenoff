import { useState } from "react";
import { api, errorMessage } from "../../lib/api";
import type { Spot } from "../../lib/types";
import type { StatusType } from "../../hooks/useStatus";

const TOP_10_WEIGHTS = [0.4, 0.2, 0.12, 0.07, 0.05, 0.04, 0.035, 0.03, 0.03, 0.025];
const TOP_5_WEIGHTS = [0.45, 0.25, 0.15, 0.1, 0.05];

interface SpotsTableProps {
  slug: string;
  spots: Spot[] | null;
  version: number;
  prizePoolCents: number;
  showStatus: (text: string, type?: StatusType) => void;
  onSaved: () => void;
}

interface SpotDraftRow {
  rank: number;
  prize: string;
  hidden: boolean;
}

function buildInitialRows(spots: Spot[] | null): SpotDraftRow[] {
  const spotsMap = new Map<number, Spot>();
  let highestRank = 10;
  for (const sp of spots || []) {
    const r = Number(sp.rank) || 0;
    if (r > 0) {
      spotsMap.set(r, sp);
      if (r > highestRank) highestRank = r;
    }
  }
  const count = Math.max(10, highestRank);
  const rows: SpotDraftRow[] = [];
  for (let rank = 1; rank <= count; rank++) {
    const found = spotsMap.get(rank);
    rows.push({
      rank,
      prize: found ? (found.prize_cents / 100).toFixed(2) : "0.00",
      hidden: found ? found.hidden === 1 : false,
    });
  }
  return rows;
}

/** "Fixed prizes per spot" table (`data-admin-spots-tbody`), dynamic ranks (10+). */
export function SpotsTable(props: SpotsTableProps) {
  return <SpotsTableEditor key={props.version} {...props} />;
}

function SpotsTableEditor({ slug, spots, prizePoolCents, showStatus, onSaved }: SpotsTableProps) {
  const [rows, setRows] = useState<SpotDraftRow[]>(() => buildInitialRows(spots));
  const [savingAll, setSavingAll] = useState(false);

  const updateRow = (rank: number, patch: Partial<SpotDraftRow>) => {
    setRows((prev) => prev.map((r) => (r.rank === rank ? { ...r, ...patch } : r)));
  };

  const addSpot = () => {
    setRows((prev) => {
      if (prev.length >= 200) return prev;
      return [...prev, { rank: prev.length + 1, prize: "0.00", hidden: false }];
    });
  };

  const autoFill = (weights: number[]) => {
    const pool = prizePoolCents > 0 ? prizePoolCents : 1_000_000;
    setRows((prev) => {
      const count = Math.max(prev.length, weights.length);
      const next: SpotDraftRow[] = [];
      for (let r = 1; r <= count; r++) {
        const w = weights[r - 1] || 0;
        const cents = Math.round((pool * w) / 100) * 100;
        next.push({
          rank: r,
          prize: (cents / 100).toFixed(2),
          hidden: prev[r - 1]?.hidden ?? false,
        });
      }
      return next;
    });
  };

  const saveOne = async (row: SpotDraftRow) => {
    const prizeUsd = Number(row.prize || 0);
    try {
      await api(`/api/admin/leaderboards/${encodeURIComponent(slug)}/spots/${row.rank}`, {
        method: "PATCH",
        body: JSON.stringify({ prize_cents: Math.round(prizeUsd * 100), hidden: row.hidden ? 1 : 0 }),
      });
      showStatus(`Spot #${row.rank} saved ✓`);
    } catch (err) {
      alert(`Failed to save spot: ${errorMessage(err)}`);
    }
  };

  const saveAll = async () => {
    setSavingAll(true);
    try {
      const payload = rows.map((r) => ({
        rank: r.rank,
        prize_cents: Math.max(0, Math.round(Number(r.prize || 0) * 100)),
        hidden: r.hidden ? 1 : 0,
      }));
      await api(`/api/admin/leaderboards/${encodeURIComponent(slug)}/spots`, {
        method: "PUT",
        body: JSON.stringify({ spots: payload }),
      });
      showStatus("All spot prizes saved ✓");
      onSaved();
    } catch (err) {
      alert(`Failed to save spots: ${errorMessage(err)}`);
    } finally {
      setSavingAll(false);
    }
  };

  return (
    <div>
      <div className="admin-page-actions">
        <button
          type="button"
          className="adm-btn adm-btn--secondary adm-btn--sm"
          onClick={() => autoFill(TOP_10_WEIGHTS)}
        >
          Auto-fill Top 10
        </button>{" "}
        <button
          type="button"
          className="adm-btn adm-btn--secondary adm-btn--sm"
          onClick={() => autoFill(TOP_5_WEIGHTS)}
        >
          Auto-fill Top 5
        </button>{" "}
        <button type="button" className="adm-btn adm-btn--secondary adm-btn--sm" onClick={addSpot}>
          + Add spot
        </button>{" "}
        <button
          type="button"
          className="adm-btn adm-btn--primary adm-btn--sm"
          disabled={savingAll || !spots}
          onClick={() => void saveAll()}
        >
          {savingAll ? "Saving…" : "Save all spots"}
        </button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Spot</th>
              <th>Spot prize ($)</th>
              <th>Hide spot</th>
              <th>Save</th>
            </tr>
          </thead>
          <tbody data-admin-spots-tbody="">
            {spots
              ? rows.map((row) => (
                  <tr key={row.rank} data-spot-rank={row.rank}>
                    <td>
                      <strong>#{row.rank}</strong>
                    </td>
                    <td>
                      <div>
                        <span>$</span>{" "}
                        <input
                          type="number"
                          className="admin-input"
                          step="0.01"
                          data-spot-prize=""
                          value={row.prize}
                          onChange={(e) => updateRow(row.rank, { prize: e.target.value })}
                        />
                      </div>
                    </td>
                    <td>
                      <label>
                        <input
                          type="checkbox"
                          data-spot-hidden=""
                          checked={row.hidden}
                          onChange={(e) => updateRow(row.rank, { hidden: e.target.checked })}
                        />{" "}
                        <span>Hide</span>
                      </label>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="adm-btn adm-btn--secondary adm-btn--sm"
                        data-action="save-spot"
                        data-spot-rank={row.rank}
                        onClick={() => void saveOne(row)}
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
