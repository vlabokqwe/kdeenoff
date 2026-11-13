import { useCallback, useEffect, useState } from "react";
import { useAdminPage } from "../hooks/useAdminPage";
import { api, errorMessage } from "../lib/api";
import { fmtDate } from "../lib/format";
import type { AuditEntry } from "../lib/types";

/** `/admin/audit/` — history of changes to settings, players, ranks and payouts. */
export function AuditPage() {
  useAdminPage("audit");
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ entries?: AuditEntry[] }>("/api/admin/audit");
      setRows(data.entries || []);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  let body;
  if (error) {
    body = (
      <tr>
        <td colSpan={5} className="admin-status is-error">
          Error: {error}
        </td>
      </tr>
    );
  } else if (!rows) {
    body = (
      <tr>
        <td colSpan={5} className="admin-status">
          Loading log…
        </td>
      </tr>
    );
  } else if (!rows.length) {
    body = (
      <tr>
        <td colSpan={5} className="admin-status">
          No log entries yet.
        </td>
      </tr>
    );
  } else {
    body = rows.map((e, i) => (
      <tr key={i}>
        <td>{fmtDate(e.at)}</td>
        <td>{e.actor_email || "admin"}</td>
        <td>
          <code>{e.action || ""}</code>
        </td>
        <td>{e.target || "—"}</td>
        <td>
          <code>{e.meta_json || ""}</code>
        </td>
      </tr>
    ));
  }

  return (
    <main className="admin-main">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Audit Log</h1>
          <p className="admin-page-sub">History of all changes to settings, players, ranks and payouts</p>
        </div>

        <div className="admin-page-actions">
          <button
            type="button"
            className="adm-btn adm-btn--secondary"
            data-btn-refresh-audit=""
            onClick={() => void load()}
          >
            ↻ Refresh log
          </button>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date &amp; time</th>
                <th>User</th>
                <th>Action</th>
                <th>Target</th>
                <th>Details (JSON)</th>
              </tr>
            </thead>
            <tbody data-admin-audit-tbody="">{body}</tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
