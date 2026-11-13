import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { copyText } from "../../hooks/useCopy";
import { adminApi, errorCode } from "../../lib/api";
import { IconCheck, IconCopy, IconExternal, IconPlus, IconRefresh, IconTrash } from "./AdminIcons";
import type { SiteSettingsMap, ToastKind } from "./adminTypes";

interface SiteSettingsTabProps {
  notify: (text: string, kind?: ToastKind) => void;
  onChanged: () => void;
}

const KNOWN_FIELDS: {
  key: string;
  label: string;
  placeholder: string;
  fallback: string;
  type?: "text" | "url";
  group: "promo" | "partner" | "socials";
  hint: string;
}[] = [
  {
    key: "promo_code",
    label: "Channel Promo Code",
    placeholder: "KDEENOFF",
    fallback: "KDEENOFF",
    group: "promo",
    hint: "Shown across referral copy buttons and bonus instructions.",
  },
  {
    key: "headline_prize",
    label: "Headline Prize Pool",
    placeholder: "$10,000",
    fallback: "$10,000",
    group: "promo",
    hint: "Featured prize headline for active campaigns.",
  },
  {
    key: "partner_name",
    label: "Default Partner Name",
    placeholder: "500 Casino / Stake",
    fallback: "Stake",
    group: "partner",
    hint: "Primary partner casino name for new leaderboards.",
  },
  {
    key: "partner_signup_url",
    label: "Default Partner Referral URL",
    placeholder: "https://stake.com/?c=KDEENOFF",
    fallback: "https://stake.com/?c=KDEENOFF",
    type: "url",
    group: "partner",
    hint: "Registration URL opened by partner claim CTAs.",
  },
  {
    key: "kick_channel",
    label: "Kick Channel Handle",
    placeholder: "KDeenOff",
    fallback: "KDeenOff",
    group: "socials",
    hint: "Used by the live stream embed and Kick chat sidebar.",
  },
  {
    key: "kick_url",
    label: "Kick Stream URL",
    placeholder: "https://kick.com/kdeenoff",
    fallback: "https://kick.com/kdeenoff",
    type: "url",
    group: "socials",
    hint: "Full link to the Kick channel.",
  },
  {
    key: "telegram_url",
    label: "Telegram Community URL",
    placeholder: "https://t.me/kdeenoff",
    fallback: "https://t.me/kdeenoff",
    type: "url",
    group: "socials",
    hint: "Community announcements & raffle alerts link.",
  },
];

const KNOWN_KEY_SET = new Set(KNOWN_FIELDS.map((f) => f.key));

export function SiteSettingsTab({ notify, onChanged }: SiteSettingsTabProps) {
  const [original, setOriginal] = useState<SiteSettingsMap>({});
  const [draft, setDraft] = useState<SiteSettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi<{ settings?: SiteSettingsMap }>("/api/admin/site");
      const map: SiteSettingsMap = {};
      const incoming = res.settings || {};
      for (const field of KNOWN_FIELDS) {
        map[field.key] = incoming[field.key] ?? field.fallback;
      }
      for (const [k, v] of Object.entries(incoming)) {
        if (!(k in map)) map[k] = String(v ?? "");
      }
      setOriginal(map);
      setDraft({ ...map });
    } catch (err) {
      notify(`Failed to load settings: ${errorCode(err)}`, "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const customKeys = useMemo(
    () => Object.keys(draft).filter((k) => !KNOWN_KEY_SET.has(k)).sort(),
    [draft],
  );

  const isDirty = useMemo(() => {
    const aKeys = Object.keys(original);
    const bKeys = Object.keys(draft);
    if (aKeys.length !== bKeys.length) return true;
    return bKeys.some((k) => (original[k] ?? "") !== (draft[k] ?? ""));
  }, [original, draft]);

  const setField = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e?: FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    try {
      await adminApi("/api/admin/site", {
        method: "PUT",
        body: { settings: draft },
      });
      setOriginal({ ...draft });
      onChanged();
      notify("Site settings saved", "success");
    } catch (err) {
      notify(`Save failed: ${errorCode(err)}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleAddCustom = (e: FormEvent) => {
    e.preventDefault();
    const clean = newKey.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(clean)) {
      notify("Key must start with a letter and use lowercase letters, digits, or underscores", "error");
      return;
    }
    setDraft((prev) => ({ ...prev, [clean]: newVal }));
    setNewKey("");
    setNewVal("");
    notify(`Staged "${clean}" — click Save All Changes to persist`, "info");
  };

  const handleDeleteCustom = async (key: string) => {
    try {
      await adminApi(`/api/admin/site/${encodeURIComponent(key)}`, { method: "DELETE" });
      setOriginal((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setDraft((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      onChanged();
      notify(`Removed setting "${key}"`, "success");
    } catch (err) {
      notify(`Delete failed: ${errorCode(err)}`, "error");
    }
  };

  const handleCopyCode = () => {
    void copyText(draft.promo_code || "KDEENOFF");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (loading) {
    return (
      <div className="ad-card ad-panel">
        <p className="ad-muted">Loading site configuration…</p>
      </div>
    );
  }

  return (
    <div className="ad-settings-layout">
      <form className="ad-settings-main" onSubmit={(e) => void handleSave(e)}>
        <div className="ad-toolbar">
          <div>
            <h2 className="ad-section-title">Global Site Configuration</h2>
            <p className="ad-muted">
              Manage promo codes, default partner referral links, and community channels.
            </p>
          </div>
          <div className="ad-toolbar__actions">
            {isDirty && (
              <button
                type="button"
                className="ad-btn ad-btn--ghost ad-btn--sm"
                onClick={() => setDraft({ ...original })}
              >
                Discard
              </button>
            )}
            <button
              type="button"
              className="ad-btn ad-btn--secondary ad-btn--sm"
              onClick={() => void load()}
            >
              <IconRefresh size={14} />
              <span>Reload</span>
            </button>
            <button
              type="submit"
              className="ad-btn ad-btn--primary ad-btn--sm"
              disabled={saving || !isDirty}
            >
              <IconCheck size={15} />
              <span>{saving ? "Saving…" : isDirty ? "Save All Changes" : "Saved"}</span>
            </button>
          </div>
        </div>

        {(
          [
            ["promo", "Promo & Campaign Headline"],
            ["partner", "Default Partner Configuration"],
            ["socials", "Stream & Community Channels"],
          ] as const
        ).map(([groupKey, groupTitle]) => (
          <section key={groupKey} className="ad-card ad-panel">
            <div className="ad-panel__head">
              <h3 className="ad-panel__title">{groupTitle}</h3>
            </div>
            <div className="ad-form-grid">
              {KNOWN_FIELDS.filter((f) => f.group === groupKey).map((field) => {
                const changed = (original[field.key] ?? "") !== (draft[field.key] ?? "");
                return (
                  <label key={field.key} className="ad-field">
                    <span className="ad-field__label">
                      <span>{field.label}</span>
                      {changed && <span className="ad-badge ad-badge--warn">Modified</span>}
                    </span>
                    <input
                      type={field.type || "text"}
                      className="ad-input"
                      placeholder={field.placeholder}
                      value={draft[field.key] ?? ""}
                      onChange={(e) => setField(field.key, e.target.value)}
                    />
                    <span className="ad-field__hint">{field.hint}</span>
                  </label>
                );
              })}
            </div>
          </section>
        ))}

        {/* Custom Key-Value Store */}
        <section className="ad-card ad-panel">
          <div className="ad-panel__head">
            <div>
              <h3 className="ad-panel__title">Custom Key-Value Parameters</h3>
              <p className="ad-panel__sub">Additional runtime flags stored in `site_settings`</p>
            </div>
          </div>

          {customKeys.length > 0 && (
            <div className="ad-kv-list">
              {customKeys.map((key) => (
                <div key={key} className="ad-kv-row">
                  <code className="ad-code">{key}</code>
                  <input
                    type="text"
                    className="ad-input"
                    value={draft[key] ?? ""}
                    onChange={(e) => setField(key, e.target.value)}
                  />
                  <button
                    type="button"
                    className="ad-btn ad-btn--danger ad-btn--xs"
                    title={`Delete ${key}`}
                    onClick={() => void handleDeleteCustom(key)}
                  >
                    <IconTrash size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="ad-kv-add">
            <input
              type="text"
              className="ad-input"
              placeholder="custom_key_name"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
            <input
              type="text"
              className="ad-input"
              placeholder="Value"
              value={newVal}
              onChange={(e) => setNewVal(e.target.value)}
            />
            <button
              type="button"
              className="ad-btn ad-btn--secondary ad-btn--sm"
              onClick={(e) => handleAddCustom(e as unknown as FormEvent)}
            >
              <IconPlus size={14} />
              <span>Add Key</span>
            </button>
          </div>
        </section>
      </form>

      {/* Live Preview Sidebar */}
      <aside className="ad-settings-preview">
        <div className="ad-card ad-panel ad-promo-preview">
          <span className="ad-badge ad-badge--live">Live Card Preview</span>
          <div className="ad-promo-preview__prize">{draft.headline_prize || "$10,000"}</div>
          <p className="ad-promo-preview__partner">
            Partnered with <strong>{draft.partner_name || "Stake"}</strong>
          </p>
          <div className="ad-promo-preview__code-box">
            <div>
              <span className="ad-promo-preview__kicker">PROMO CODE</span>
              <strong className="ad-promo-preview__code">{draft.promo_code || "KDEENOFF"}</strong>
            </div>
            <button
              type="button"
              className="ad-btn ad-btn--secondary ad-btn--xs"
              onClick={handleCopyCode}
            >
              {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>

          <div className="ad-promo-preview__links">
            {draft.partner_signup_url && (
              <a
                href={draft.partner_signup_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ad-btn ad-btn--primary ad-btn--sm"
              >
                <span>Test Partner Link</span>
                <IconExternal size={14} />
              </a>
            )}
            <div className="ad-promo-preview__socials">
              {draft.kick_url && (
                <a
                  href={draft.kick_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ad-btn ad-btn--ghost ad-btn--xs"
                >
                  <span>Kick ({draft.kick_channel || "stream"})</span>
                  <IconExternal size={12} />
                </a>
              )}
              {draft.telegram_url && (
                <a
                  href={draft.telegram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ad-btn ad-btn--ghost ad-btn--xs"
                >
                  <span>Telegram</span>
                  <IconExternal size={12} />
                </a>
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
