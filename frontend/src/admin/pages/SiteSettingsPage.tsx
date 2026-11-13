import { useEffect, useRef, useState } from "react";
import { StatusBox } from "../components/StatusBox";
import { useAdminPage } from "../hooks/useAdminPage";
import { useStatus } from "../hooks/useStatus";
import { api, errorMessage } from "../lib/api";
import type { SiteSettings } from "../lib/types";

/** `/admin/site/` — global links, channel promo code, partners and socials. */
export function SiteSettingsPage() {
  useAdminPage("site-settings");
  const [status, showStatus] = useStatus();
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [version, setVersion] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ settings?: SiteSettings }>("/api/admin/site")
      .then((data) => {
        if (cancelled) return;
        setSettings(data.settings || {});
        setVersion((v) => v + 1);
      })
      .catch((err) => {
        if (cancelled) return;
        showStatus(`Load failed: ${errorMessage(err)}`, "error");
      });
    return () => {
      cancelled = true;
    };
  }, [showStatus]);

  const saveSettings = async () => {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    try {
      for (const [k, v] of fd.entries()) {
        await api("/api/admin/site", {
          method: "POST",
          body: JSON.stringify({ key: k, value: String(v) }),
        });
      }
      showStatus("Site settings saved ✓");
    } catch (err) {
      showStatus(`Error: ${errorMessage(err)}`, "error");
    }
  };

  return (
    <main className="admin-main">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Site settings &amp; promo codes</h1>
          <p className="admin-page-sub">Global links, channel promo code, partners and socials</p>
        </div>

        <div className="admin-page-actions">
          <button type="button" className="adm-btn adm-btn--primary" data-btn-save-site="" onClick={saveSettings}>
            Save settings
          </button>
        </div>
      </div>

      <StatusBox id="site-status-box" status={status} />

      <div className="admin-card">
        <form key={version} ref={formRef} data-form-site-settings="" onSubmit={(e) => e.preventDefault()}>
          <div className="admin-form-grid">
            <div className="admin-form-group">
              <label className="admin-form-label">Channel promo code *</label>
              <input
                type="text"
                name="promo_code"
                className="admin-input"
                defaultValue={settings?.promo_code || "KDEENOFF"}
                required
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Headline prize pool</label>
              <input
                type="text"
                name="headline_prize"
                className="admin-input"
                defaultValue={settings?.headline_prize || "$10,000"}
              />
            </div>
          </div>

          <div className="admin-form-grid">
            <div className="admin-form-group">
              <label className="admin-form-label">Default partner</label>
              <input
                type="text"
                name="partner_name"
                className="admin-input"
                defaultValue={settings?.partner_name || "Stake"}
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Partner referral link</label>
              <input
                type="url"
                name="partner_signup_url"
                className="admin-input"
                defaultValue={settings?.partner_signup_url || "https://stake.com/?c=KDEENOFF"}
              />
            </div>
          </div>

          <div className="admin-form-grid">
            <div className="admin-form-group">
              <label className="admin-form-label">Kick channel (name)</label>
              <input
                type="text"
                name="kick_channel"
                className="admin-input"
                defaultValue={settings?.kick_channel || "KDeenOff"}
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Kick link</label>
              <input
                type="url"
                name="kick_url"
                className="admin-input"
                defaultValue={settings?.kick_url || "https://kick.com/kdeenoff"}
              />
            </div>
          </div>

          <div className="admin-form-grid">
            <div className="admin-form-group">
              <label className="admin-form-label">Telegram channel / chat</label>
              <input
                type="url"
                name="telegram_url"
                className="admin-input"
                defaultValue={settings?.telegram_url || "https://t.me/kdeenoff"}
              />
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
