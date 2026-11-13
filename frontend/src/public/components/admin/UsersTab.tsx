import { useCallback, useEffect, useMemo, useState } from "react";
import { useNow } from "../../hooks/useNow";
import { adminApi, errorCode } from "../../lib/api";
import { safeAvatar } from "../../lib/format";
import {
  IconClose,
  IconDownload,
  IconRefresh,
  IconSearch,
  IconShield,
  IconTicket,
  IconTrash,
  IconTrophy,
  IconUsers,
} from "./AdminIcons";
import {
  csvEscape,
  downloadTextFile,
  fmtDateTime,
  relTime,
  type AdminUser,
  type AdminUserDetail,
  type ToastKind,
} from "./adminTypes";

type UserFilter = "all" | "streamers" | "kick" | "verified" | "sessions" | "entrants";

interface UsersTabProps {
  notify: (text: string, kind?: ToastKind) => void;
  onChanged: () => void;
}

interface UsersStats {
  totalUsers: number;
  verifiedEmails: number;
  linkedKick: number;
  streamers?: number;
  admins?: number;
  activeSessions: number;
  totalEntries: number;
}

export function UsersTab({ notify, onChanged }: UsersTabProps) {
  const now = useNow();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<UsersStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<UserFilter>("all");
  const [search, setSearch] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi<{ users?: AdminUser[]; stats?: UsersStats }>("/api/admin/users");
      setUsers(res.users || []);
      if (res.stats) setStats(res.stats);
    } catch (err) {
      notify(`Failed to load users: ${errorCode(err)}`, "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadDetail = useCallback(
    async (id: string, silent = false) => {
      if (!silent) setLoadingDetail(true);
      try {
        const res = await adminApi<AdminUserDetail>(
          `/api/admin/users/${encodeURIComponent(id)}`,
        );
        setDetail(res);
      } catch (err) {
        notify(`Failed to inspect user: ${errorCode(err)}`, "error");
        setSelectedId(null);
      } finally {
        if (!silent) setLoadingDetail(false);
      }
    },
    [notify],
  );

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    setConfirmDelete(false);
    if (selectedId) {
      void loadDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [selectedId, loadDetail]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === "streamers" && u.role !== "streamer" && u.role !== "admin") return false;
      if (filter === "kick" && !u.kick_user_id) return false;
      if (filter === "verified" && !u.email_verified) return false;
      if (filter === "sessions" && u.active_sessions <= 0) return false;
      if (filter === "entrants" && u.raffle_entries_count <= 0) return false;
      if (q) {
        const hay = `${u.kick_name} ${u.kick_user_id} ${u.email} ${u.id} ${u.role || "player"}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, filter, search]);

  const handleRoleChange = async (id: string, nextRole: "player" | "streamer" | "admin") => {
    setBusyAction("role");
    try {
      const res = await adminApi<{ ok?: boolean; id?: string; role?: string }>(
        `/api/admin/users/${encodeURIComponent(id)}/role`,
        { method: "PATCH", body: { role: nextRole } },
      );
      const targetId = res.id || id;
      if (targetId !== id) {
        setSelectedId(targetId);
      } else {
        await loadDetail(targetId, true);
      }
      await loadUsers();
      onChanged();
      notify(`Updated role to ${nextRole}`, "success");
    } catch (err) {
      notify(`Role update failed: ${errorCode(err)}`, "error");
    } finally {
      setBusyAction(null);
    }
  };

  const handleRevokeSessions = async (id: string) => {
    setBusyAction("revoke");
    try {
      const res = await adminApi<{ revoked?: number }>(
        `/api/admin/users/${encodeURIComponent(id)}/revoke-sessions`,
        { method: "POST", body: {} },
      );
      await loadDetail(id, true);
      await loadUsers();
      onChanged();
      notify(`Revoked ${res.revoked ?? 0} active sessions`, "info");
    } catch (err) {
      notify(`Revoke failed: ${errorCode(err)}`, "error");
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteUser = async (id: string) => {
    setBusyAction("delete");
    try {
      await adminApi(`/api/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
      setConfirmDelete(false);
      setSelectedId(null);
      await loadUsers();
      onChanged();
      notify("Deleted user record", "success");
    } catch (err) {
      notify(`Delete failed: ${errorCode(err)}`, "error");
    } finally {
      setBusyAction(null);
    }
  };

  const exportUsersCsv = () => {
    const lines = [
      "id,kick_name,kick_user_id,email,email_verified,active_sessions,raffle_entries,raffles_won,created_iso",
      ...filteredUsers.map((u) =>
        [
          csvEscape(u.id),
          csvEscape(u.kick_name),
          csvEscape(u.kick_user_id),
          csvEscape(u.email),
          u.email_verified ? 1 : 0,
          u.active_sessions,
          u.raffle_entries_count,
          u.raffles_won_count,
          u.created_at ? new Date(Number(u.created_at)).toISOString() : "",
        ].join(","),
      ),
    ];
    downloadTextFile(`kdeenoff-users-${Date.now()}.csv`, lines.join("\n"));
    notify(`Exported ${filteredUsers.length} users`, "info");
  };

  return (
    <div className="kadm-stack">
      {/* Mini KPI Strip */}
      {stats && (
        <div className="kadm-mini-stats">
          <div className="kadm-card kadm-mini-stat">
            <span className="kadm-mini-label">Total Accounts</span>
            <strong>{stats.totalUsers}</strong>
          </div>
          <div className="kadm-card kadm-mini-stat">
            <span className="kadm-mini-label">Kick Linked</span>
            <strong>{stats.linkedKick}</strong>
          </div>
          <div className="kadm-card kadm-mini-stat">
            <span className="kadm-mini-label">Verified Emails</span>
            <strong>{stats.verifiedEmails}</strong>
          </div>
          <div className="kadm-card kadm-mini-stat">
            <span className="kadm-mini-label">Active Sessions</span>
            <strong>{stats.activeSessions}</strong>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="kadm-toolbar">
        <div className="kadm-seg" role="tablist" aria-label="User directory filter">
          {(
            [
              ["all", "All"],
              ["streamers", "Streamers"],
              ["kick", "Kick Linked"],
              ["verified", "Verified Email"],
              ["sessions", "Active Session"],
              ["entrants", "Raffle Entrants"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={`kadm-seg__btn${filter === key ? " is-active" : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="kadm-toolbar__actions">
          <div className="kadm-search">
            <IconSearch size={15} />
            <input
              type="search"
              className="kadm-search__input"
              placeholder="Search Kick handle, email, ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="kadm-btn kadm-btn--secondary kadm-btn--sm"
            disabled={!filteredUsers.length}
            onClick={exportUsersCsv}
          >
            <IconDownload size={14} />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            className="kadm-btn kadm-btn--ghost kadm-btn--sm"
            onClick={() => void loadUsers()}
          >
            <IconRefresh size={14} />
          </button>
        </div>
      </div>

      {/* Directory + Optional User Inspector */}
      <div className={selectedId ? "kadm-users-layout has-inspector" : "kadm-users-layout"}>
        <div className="kadm-card kadm-table-card">
          <div className="kadm-table-wrap">
            <table className="kadm-table">
              <thead>
                <tr>
                  <th>Identity</th>
                  <th>Email Status</th>
                  <th>Raffles</th>
                  <th>Sessions</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {loading && users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="kadm-table__empty">
                      Loading community directory…
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="kadm-table__empty">
                      No accounts match your filter.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const primary = u.kick_name || u.email || u.id;
                    const avatar = safeAvatar(u.avatar_url || undefined);
                    const isSelected = selectedId === u.id;
                    return (
                      <tr
                        key={u.id}
                        className={isSelected ? "is-selected" : undefined}
                        style={{ cursor: "pointer" }}
                        onClick={() => setSelectedId(isSelected ? null : u.id)}
                      >
                        <td>
                          <div className="kadm-user-cell">
                            {avatar ? (
                              <img
                                src={avatar}
                                alt=""
                                width={30}
                                height={30}
                                className="kadm-user-cell__avatar"
                              />
                            ) : (
                              <span className="kadm-user-cell__avatar kadm-user-cell__avatar--ph">
                                {(primary[0] || "U").toUpperCase()}
                              </span>
                            )}
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <strong>{primary}</strong>
                                {u.role === "admin" && (
                                  <span className="kadm-badge kadm-badge--warn">Admin</span>
                                )}
                                {u.role === "streamer" && (
                                  <span className="kadm-badge kadm-badge--info">Streamer</span>
                                )}
                              </div>
                              <div className="kadm-subtext">
                                {u.kick_user_id ? `Kick #${u.kick_user_id}` : "Email-only account"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          {u.email ? (
                            <div>
                              <span>{u.email}</span>{" "}
                              <span
                                className={`kadm-badge kadm-badge--${u.email_verified ? "live" : "warn"}`}
                              >
                                {u.email_verified ? "Verified" : "Pending"}
                              </span>
                            </div>
                          ) : (
                            <span className="kadm-muted">Not linked</span>
                          )}
                        </td>
                        <td className="kadm-nowrap">
                          <span>{u.raffle_entries_count} entries</span>
                          {u.raffles_won_count > 0 && (
                            <span className="kadm-badge kadm-badge--live" style={{ marginLeft: 6 }}>
                              <IconTrophy size={11} />
                              <span>{u.raffles_won_count} won</span>
                            </span>
                          )}
                        </td>
                        <td className="kadm-nowrap">
                          {u.active_sessions > 0 ? (
                            <span className="kadm-badge kadm-badge--info">
                              {u.active_sessions} active
                            </span>
                          ) : (
                            <span className="kadm-muted">0</span>
                          )}
                        </td>
                        <td className="kadm-nowrap">
                          <div>{relTime(u.updated_at, now)}</div>
                          <span className="kadm-subtext">{fmtDateTime(u.created_at)}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* User Inspector Panel */}
        {selectedId && (
          <aside className="kadm-card kadm-panel kadm-user-inspector">
            <div className="kadm-panel__head">
              <h3 className="kadm-panel__title">Account Inspector</h3>
              <button
                type="button"
                className="kadm-btn kadm-btn--ghost kadm-btn--xs"
                onClick={() => setSelectedId(null)}
              >
                <IconClose size={15} />
              </button>
            </div>

            {loadingDetail && !detail ? (
              <p className="kadm-muted">Loading profile details…</p>
            ) : detail ? (
              <div className="kadm-stack-sm">
                <div className="kadm-user-hero">
                  {safeAvatar(detail.user.avatar_url || undefined) ? (
                    <img
                      src={safeAvatar(detail.user.avatar_url || undefined)}
                      alt=""
                      width={46}
                      height={46}
                      className="kadm-user-cell__avatar"
                    />
                  ) : (
                    <span
                      className="kadm-user-cell__avatar kadm-user-cell__avatar--ph"
                      style={{ width: 46, height: 46 }}
                    >
                      <IconUsers size={20} />
                    </span>
                  )}
                  <div>
                    <strong className="kadm-user-hero__name">
                      {detail.user.kick_name || detail.user.email || detail.user.id}
                    </strong>
                    <div className="kadm-subtext">ID: {detail.user.id}</div>
                  </div>
                </div>

                <div className="kadm-kv-summary">
                  <div>
                    <span className="kadm-mini-label">Email</span>
                    <strong>{detail.user.email || "—"}</strong>
                  </div>
                  <div>
                    <span className="kadm-mini-label">Email Verified</span>
                    <strong>
                      {detail.user.email_verified
                        ? fmtDateTime(detail.user.email_verified_at)
                        : "No"}
                    </strong>
                  </div>
                  <div>
                    <span className="kadm-mini-label">Kick Account</span>
                    <strong>
                      {detail.user.kick_user_id
                        ? `${detail.user.kick_name || "Linked"} (#${detail.user.kick_user_id})`
                        : "Not linked"}
                    </strong>
                  </div>
                  <div>
                    <span className="kadm-mini-label">Created</span>
                    <strong>{fmtDateTime(detail.user.created_at)}</strong>
                  </div>
                </div>

                {/* Account Role */}
                <div className="kadm-subpanel">
                  <div className="kadm-subpanel__head">
                    <strong>
                      <IconShield size={14} /> Access Role
                    </strong>
                  </div>
                  <div className="kadm-seg" role="radiogroup" aria-label="Account role">
                    {(
                      [
                        ["player", "Player"],
                        ["streamer", "Streamer"],
                        ["admin", "Admin"],
                      ] as const
                    ).map(([roleKey, roleLabel]) => {
                      const active = (detail.user.role || "player") === roleKey;
                      return (
                        <button
                          key={roleKey}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={busyAction === "role"}
                          className={`kadm-seg__btn${active ? " is-active" : ""}`}
                          onClick={() => {
                            if (!active) void handleRoleChange(detail.user.id, roleKey);
                          }}
                        >
                          {roleLabel}
                        </button>
                      );
                    })}
                  </div>
                  <p className="kadm-subtext" style={{ marginTop: 6 }}>
                    Streamers can create, edit, spin, eliminate, and reroll raffles via the Raffle Overlay without full Admin access.
                  </p>
                </div>

                {/* Active Sessions */}
                <div className="kadm-subpanel">
                  <div className="kadm-subpanel__head">
                    <strong>
                      <IconShield size={14} /> Active Sessions ({detail.sessions.length})
                    </strong>
                    {detail.sessions.length > 0 && (
                      <button
                        type="button"
                        className="kadm-btn kadm-btn--secondary kadm-btn--xs"
                        disabled={busyAction === "revoke"}
                        onClick={() => void handleRevokeSessions(detail.user.id)}
                      >
                        {busyAction === "revoke" ? "Revoking…" : "Revoke All"}
                      </button>
                    )}
                  </div>
                  {detail.sessions.length === 0 ? (
                    <p className="kadm-subtext">No active browser sessions.</p>
                  ) : (
                    <ul className="kadm-mini-list">
                      {detail.sessions.slice(0, 6).map((s, idx) => (
                        <li key={idx}>
                          <span>Signed in {relTime(s.created_at, now)}</span>
                          <span className="kadm-subtext">Expires {fmtDateTime(s.expires_at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Raffle Participation */}
                <div className="kadm-subpanel">
                  <div className="kadm-subpanel__head">
                    <strong>
                      <IconTicket size={14} /> Raffle Entries ({detail.entries.length})
                    </strong>
                  </div>
                  {detail.entries.length === 0 ? (
                    <p className="kadm-subtext">Has not entered any raffles yet.</p>
                  ) : (
                    <ul className="kadm-mini-list">
                      {detail.entries.slice(0, 8).map((e) => {
                        const won =
                          Boolean(e.winner) &&
                          Boolean(detail.user.kick_name) &&
                          e.winner!.toLowerCase() === detail.user.kick_name.toLowerCase();
                        return (
                          <li key={e.id}>
                            <div>
                              <strong>{e.title || `Raffle #${e.raffle_id}`}</strong>{" "}
                              {won && <span className="kadm-badge kadm-badge--live">Won</span>}
                            </div>
                            <span className="kadm-subtext">
                              {e.prize ? `${e.prize} · ` : ""}
                              {fmtDateTime(e.created_at)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Danger Zone */}
                <div className="kadm-danger-box">
                  <div>
                    <strong>Delete Account</strong>
                    <span className="kadm-field__hint">
                      Removes sessions, verification codes, and account record.
                    </span>
                  </div>
                  <div className="kadm-row-actions">
                    {confirmDelete ? (
                      <>
                        <button
                          type="button"
                          className="kadm-btn kadm-btn--danger kadm-btn--xs"
                          disabled={busyAction === "delete"}
                          onClick={() => void handleDeleteUser(detail.user.id)}
                        >
                          {busyAction === "delete" ? "Deleting…" : "Confirm"}
                        </button>
                        <button
                          type="button"
                          className="kadm-btn kadm-btn--ghost kadm-btn--xs"
                          onClick={() => setConfirmDelete(false)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="kadm-btn kadm-btn--danger kadm-btn--xs"
                        onClick={() => setConfirmDelete(true)}
                      >
                        <IconTrash size={13} />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </aside>
        )}
      </div>
    </div>
  );
}
