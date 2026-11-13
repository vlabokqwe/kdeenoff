import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { StatusBox } from "../components/StatusBox";
import { RaffleModal, raffleDefaults, type RaffleFormDefaults } from "../components/raffles/RaffleModal";
import { useAdminPage } from "../hooks/useAdminPage";
import { useModal } from "../hooks/useModal";
import { useStatus } from "../hooks/useStatus";
import { api, errorMessage } from "../lib/api";
import { fmtDate, fromLocalISO } from "../lib/format";
import type { Raffle } from "../lib/types";

function isRaffleEnded(row: Raffle, now = Date.now()): boolean {
  if (row.ended_at != null) return true;
  if (row.end_mode === "manual") return false;
  return Number(row.ends_at) <= now;
}

function RaffleStatus({ row }: { row: Raffle }) {
  if (row.hidden) return <span>Hidden</span>;
  const now = Date.now();
  if (isRaffleEnded(row, now)) return <span>Finished</span>;
  if (Number(row.starts_at) > now) return <span>Upcoming</span>;
  return <span>{row.end_mode === "manual" ? "● Live (Button)" : "● Live"}</span>;
}

/** `/admin/raffles/` — raffle list + add / edit / finish / delete. */
export function RafflesPage() {
  useAdminPage("raffles");
  const [status, showStatus] = useStatus();
  const [rows, setRows] = useState<Raffle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modal = useModal<RaffleFormDefaults>();
  const editingId = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ raffles?: Raffle[] }>("/api/admin/raffles");
      setRows(data.raffles || []);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openModal = (row: Raffle | null) => {
    editingId.current = row ? row.id : null;
    modal.show(raffleDefaults(row));
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this raffle?")) return;
    try {
      await api(`/api/admin/raffles/${id}`, { method: "DELETE" });
      showStatus("Raffle deleted");
      await load();
    } catch (err) {
      showStatus(errorMessage(err), "error");
    }
  };

  const endRaffle = async (row: Raffle) => {
    try {
      await api(`/api/admin/raffles/${row.id}/end`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      showStatus("Raffle ended");
      await load();
    } catch (err) {
      showStatus(errorMessage(err), "error");
    }
  };

  const drawWinner = async (row: Raffle) => {
    try {
      const res = await api<{ winner?: string | null }>(`/api/admin/raffles/${row.id}/draw-winner`, {
        method: "POST",
        body: JSON.stringify({ exclude_current: Boolean(row.winner) }),
      });
      showStatus(res.winner ? `Winner drawn: ${res.winner}` : "Winner drawn");
      await load();
    } catch (err) {
      showStatus(errorMessage(err), "error");
    }
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const endMode = fd.get("end_mode") === "manual" ? "manual" : "timer";
    const endsAt = endMode === "timer" ? fromLocalISO(fd.get("ends_at_local")) : null;
    if (endMode === "timer" && !endsAt) {
      showStatus("End date is required", "error");
      return;
    }
    const payload: Record<string, unknown> = {
      title: fd.get("title"),
      prize: fd.get("prize"),
      winner: fd.get("winner"),
      note: fd.get("note"),
      end_mode: endMode,
      starts_at: fromLocalISO(fd.get("starts_at_local")) || Date.now(),
      hidden: fd.get("hidden") === "1",
      is_demo: fd.get("is_demo") === "1",
    };
    if (endMode === "timer" && endsAt) {
      payload.ends_at = endsAt;
    }
    try {
      if (editingId.current) {
        await api(`/api/admin/raffles/${editingId.current}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        showStatus("Raffle saved");
      } else {
        await api("/api/admin/raffles", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showStatus("Raffle added");
      }
      modal.close();
      await load();
    } catch (err) {
      showStatus(errorMessage(err), "error");
    }
  };

  let body;
  if (error) {
    body = (
      <tr>
        <td colSpan={7} className="admin-status is-error">
          Error: {error}
        </td>
      </tr>
    );
  } else if (!rows) {
    body = (
      <tr>
        <td colSpan={7} className="admin-status">
          Loading raffles…
        </td>
      </tr>
    );
  } else if (!rows.length) {
    body = (
      <tr>
        <td colSpan={7} className="admin-status">
          No raffles yet. Add the first one.
        </td>
      </tr>
    );
  } else {
    body = rows.map((row) => {
      const ended = isRaffleEnded(row);
      const endsLabel =
        row.end_mode === "manual" && !ended
          ? "Manual button"
          : fmtDate(row.ended_at || row.ends_at);
      return (
        <tr key={row.id}>
          <td>
            <a href={`/raffles/${row.id}/`} target="_blank" rel="noopener noreferrer">
              <strong>{row.title}</strong>
            </a>
            {row.is_demo ? <> <span>[DEMO]</span></> : null}
          </td>
          <td>{row.prize || "—"}</td>
          <td>{row.winner || "—"}</td>
          <td>{endsLabel}</td>
          <td>{Number(row.entry_count) || 0}</td>
          <td>
            <RaffleStatus row={row} />
          </td>
          <td>
            {!ended && (
              <>
                <button
                  type="button"
                  className="adm-btn adm-btn--primary adm-btn--sm"
                  data-raffle-finish={row.id}
                  onClick={() => void endRaffle(row)}
                >
                  End raffle
                </button>{" "}
              </>
            )}
            {(Number(row.entry_count) || 0) > 0 && (
              <>
                <button
                  type="button"
                  className="adm-btn adm-btn--secondary adm-btn--sm"
                  data-raffle-draw={row.id}
                  onClick={() => void drawWinner(row)}
                >
                  Draw winner
                </button>{" "}
              </>
            )}
            <button
              type="button"
              className="adm-btn adm-btn--secondary adm-btn--sm"
              data-raffle-edit={row.id}
              onClick={() => openModal(row)}
            >
              Edit
            </button>{" "}
            <button
              type="button"
              className="adm-btn adm-btn--danger adm-btn--sm"
              data-raffle-delete={row.id}
              onClick={() => remove(row.id)}
            >
              Delete
            </button>
          </td>
        </tr>
      );
    });
  }

  return (
    <>
      <main className="admin-main">
        <div className="admin-page-head">
          <div>
            <h1 className="admin-page-title">Raffles</h1>
            <p className="admin-page-sub">
              Create raffles with either a countdown timer or manual completion by button press.
            </p>
          </div>

          <div className="admin-page-actions">
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              data-open-raffle-modal=""
              onClick={() => openModal(null)}
            >
              + Add raffle
            </button>
          </div>
        </div>

        <StatusBox as="p" className="adm-status" data-raffles-status="" status={status} />

        <div className="admin-card">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Prize</th>
                  <th>Winner</th>
                  <th>Ends</th>
                  <th>Entries</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody data-admin-raffles-tbody="">{body}</tbody>
            </table>
          </div>
        </div>
      </main>

      <RaffleModal
        open={modal.open}
        nonce={modal.nonce}
        defaults={modal.data}
        onClose={modal.close}
        onSubmit={onSubmit}
      />
    </>
  );
}
