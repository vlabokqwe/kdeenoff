import { useCallback, useEffect, useState } from "react";
import { useNow } from "../../hooks/useNow";
import { adminApi, errorCode } from "../../lib/api";
import { IconDownload, IconRefresh, IconSearch } from "./AdminIcons";
import {
  csvEscape,
  downloadTextFile,
  fmtDateTime,
  parseMeta,
  relTime,
  type AdminAuditEntry,
  type ToastKind,
} from "./adminTypes";

type AuditDomain = "all" | "leaderboards" | "players" | "raffles" | "users" | "site";

interface AuditLogTabProps {
  notify: (text: string, kind?: ToastKind) => void;
}

export function AuditLogTab({ notify }: AuditLogTabProps) {
  const now = useNow();
  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState<AuditDomain>("all");
  const [query, setQuery] = useState("");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "250" });
      if (domain !== "all") params.set("domain", domain);
      if (query.trim()) params.set("q", query.trim());
      const res = await adminApi<{ entries?: AdminAuditEntry[] }>(
        `/api/admin/audit?${params.toString()}`,
      );
      setEntries(res.entries || []);
    } catch (err) {
      notify(`Failed to load audit log: ${errorCode(err)}`, "error");
    } finally {
      setLoading(false);
    }
  }, [domain, query, notify]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, query ? 200 : 0);
    return () => window.clearTimeout(t);
  }, [load, query]);

  const exportCsv = () => {
    const header = ["timestamp", "iso_date", "actor_email", "action", "target", "meta_json"];
    const lines = [
      header.join(","),
      ...entries.map((e) =>
        [
          e.at ?? "",
          e.at ? new Date(Number(e.at)).toISOString() : "",
          csvEscape(e.actor_email || "admin"),
          csvEscape(e.action || ""),
          csvEscape(e.target || ""),
          csvEscape(e.meta_json || ""),
        ].join(","),
      ),
    ];
    downloadTextFile(`kdeenoff-audit-${Date.now()}.csv`, lines.join("\n"));
    notify(`Exported ${entries.length} audit entries`, "info");
  };

  return (
    <div className="ad-stack">
      <div className="ad-toolbar">
        <div className="ad-seg" role="tablist" aria-label="Audit domain filter">
          {(
            [
              ["all", "All"],
              ["leaderboards", "Races & Spots"],
              ["players", "Players"],
              ["raffles", "Raffles"],
              ["users", "Users"],
              ["site", "Site"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={domain === key}
              className={`ad-seg__btn${domain === key ? " is-active" : ""}`}
              onClick={() => setDomain(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ad-toolbar__actions">
          <div className="ad-search">
            <IconSearch size={15} />
            <input
              type="search"
              className="ad-search__input"
              placeholder="Search actor, action, target…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="ad-btn ad-btn--secondary ad-btn--sm"
            disabled={!entries.length}
            onClick={exportCsv}
          >
            <IconDownload size={14} />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            className="ad-btn ad-btn--ghost ad-btn--sm"
            onClick={() => void load()}
          >
            <IconRefresh size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="ad-card ad-table-card">
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Payload Summary</th>
              </tr>
            </thead>
            <tbody>
              {loading && entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="ad-table__empty">
                    Loading audit log…
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="ad-table__empty">
                    No matching audit entries found.
                  </td>
                </tr>
              ) : (
                entries.map((entry, idx) => {
                  const meta = parseMeta(entry.meta_json);
                  const rowKey = entry.id ?? idx;
                  const isOpen = expandedRow === rowKey;
                  return (
                    <tr
                      key={rowKey}
                      className={isOpen ? "is-selected" : undefined}
                      onClick={() => setExpandedRow(isOpen ? null : rowKey)}
                      style={{ cursor: entry.meta_json ? "pointer" : undefined }}
                    >
                      <td className="ad-nowrap">
                        <div>
                          <strong>{relTime(entry.at, now)}</strong>
                        </div>
                        <span className="ad-subtext">{fmtDateTime(entry.at)}</span>
                      </td>
                      <td>
                        <span className="ad-badge ad-badge--muted">
                          {entry.actor_email || "admin"}
                        </span>
                      </td>
                      <td>
                        <code className="ad-code">{entry.action || "—"}</code>
                      </td>
                      <td>
                        <strong>{entry.target || "—"}</strong>
                      </td>
                      <td>
                        {meta && Object.keys(meta).length > 0 ? (
                          <div className="ad-meta-pills">
                            {Object.entries(meta).map(([k, v]) => (
                              <span key={k} className="ad-meta-pill">
                                <span className="ad-meta-pill__k">{k}:</span>{" "}
                                <span>{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                              </span>
                            ))}
                          </div>
                        ) : entry.meta_json && entry.meta_json !== "{}" ? (
                          <code className="ad-code">{entry.meta_json}</code>
                        ) : (
                          <span className="ad-muted">—</span>
                        )}
                        {isOpen && entry.meta_json && (
                          <pre className="ad-json-pre">{entry.meta_json}</pre>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
