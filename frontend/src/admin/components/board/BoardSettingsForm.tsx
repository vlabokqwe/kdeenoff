import type { FormEvent, Ref } from "react";
import { localISO } from "../../lib/format";
import type { Board } from "../../lib/types";

interface BoardSettingsFormProps {
  board: Board | null;
  formRef: Ref<HTMLFormElement>;
}

function normalizeAvatarStyle(raw?: string | null): string {
  const v = (raw || "").trim().toLowerCase();
  if (v === "none" || v === "kdeenoff-camo") return v;
  if (v === "kdeenoff-luxe" || v === "olympus-gold") return "kdeenoff-luxe";
  return "kdeenoff";
}

function defaultsFor(board: Board | null) {
  if (!board) {
    // Static HTML defaults before the first load.
    return {
      title: "",
      slug: "",
      subtitle: "",
      prize: "",
      partner: "",
      url: "",
      badge: "",
      promoCode: "",
      sortOrder: "0",
      starts: "",
      ends: "",
      avatar: "kdeenoff",
      hiddenAbove: "",
      showInDrawer: true,
      showOnHome: true,
      hidden: false,
      isDemo: false,
      autoRank: false,
      growth: false,
      pct: "3",
      hours: "12",
    };
  }
  return {
    title: board.title || "",
    slug: board.slug || "",
    subtitle: board.subtitle || "",
    prize: String((board.prize_pool_cents || 0) / 100),
    partner: board.partner || "",
    url: board.partner_signup_url || "",
    badge: board.badge || "",
    promoCode: board.promo_code || "",
    sortOrder: String(board.sort_order ?? 0),
    starts: localISO(board.starts_at),
    ends: localISO(board.ends_at),
    avatar: normalizeAvatarStyle(board.avatar_style),
    hiddenAbove: String(board.auto_hidden_above_rank || 0),
    showInDrawer: board.show_in_drawer !== 0,
    showOnHome: board.show_on_home !== 0,
    hidden: board.hidden === 1,
    isDemo: board.is_demo === 1,
    autoRank: board.auto_rank_by_wagered === 1,
    growth: board.auto_wager_growth_enabled === 1,
    pct: String(board.auto_wager_growth_pct || 3),
    hours: String((board.auto_wager_growth_interval_ms || 43200000) / 3600000),
  };
}

/**
 * "Race settings" form (`data-form-board-settings`). Uncontrolled: it is re-keyed
 * after every load and read with FormData by the header "Save settings" button.
 */
export function BoardSettingsForm({ board, formRef }: BoardSettingsFormProps) {
  const d = defaultsFor(board);
  // The form has no submit button and several text fields, so the browser never
  // submits it implicitly; the handler is only a guard.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => e.preventDefault();

  return (
    <form data-form-board-settings="" ref={formRef} onSubmit={onSubmit}>
      <div className="admin-form-grid">
        <div className="admin-form-group">
          <label className="admin-form-label">Title *</label>
          <input type="text" name="title" className="admin-input" required defaultValue={d.title} />
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label">URL slug *</label>
          <input type="text" name="new_slug" className="admin-input" required defaultValue={d.slug} />
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label">Prize pool ($) *</label>
          <input type="number" name="prize_pool_usd" className="admin-input" step="0.01" required defaultValue={d.prize} />
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label">Badge (blank = auto)</label>
          <input
            type="text"
            name="badge"
            className="admin-input"
            maxLength={24}
            placeholder="MONTHLY / WEEKLY / VIP"
            defaultValue={d.badge}
          />
        </div>
      </div>

      <div className="admin-form-grid">
        <div className="admin-form-group">
          <label className="admin-form-label">Partner (casino)</label>
          <input type="text" name="partner" className="admin-input" placeholder="stake / rainbet" defaultValue={d.partner} />
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label">Partner referral link</label>
          <input type="url" name="partner_signup_url" className="admin-input" defaultValue={d.url} />
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label">Promo code</label>
          <input
            type="text"
            name="promo_code"
            className="admin-input"
            maxLength={40}
            placeholder="KDEENOFF"
            defaultValue={d.promoCode}
          />
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label">Sort order</label>
          <input type="number" name="sort_order" className="admin-input" step="1" defaultValue={d.sortOrder} />
        </div>
      </div>

      <div className="admin-form-group">
        <label className="admin-form-label">Subtitle / Description</label>
        <textarea
          name="subtitle"
          className="admin-textarea"
          rows={2}
          placeholder="Play at the casino with code KDEENOFF..."
          defaultValue={d.subtitle}
        ></textarea>
      </div>

      <div className="admin-form-grid">
        <div className="admin-form-group">
          <label className="admin-form-label">Start date</label>
          <input type="datetime-local" name="starts_at_local" className="admin-input" defaultValue={d.starts} />
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label">End date *</label>
          <input type="datetime-local" name="ends_at_local" className="admin-input" required defaultValue={d.ends} />
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label">Avatar style</label>
          <select name="avatar_style" className="admin-select" defaultValue={d.avatar}>
            <option value="kdeenoff">KDeenOff Monkey Drops (auto)</option>
            <option value="kdeenoff-camo">KDeenOff Street Camo &amp; Patch</option>
            <option value="kdeenoff-luxe">KDeenOff Luxe Metals &amp; Stone</option>
            <option value="none">No avatars</option>
          </select>
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label">Auto-hide spots below rank</label>
          <input
            type="number"
            name="auto_hidden_above_rank"
            className="admin-input"
            min="0"
            placeholder="25 (0 = show all)"
            defaultValue={d.hiddenAbove}
          />
        </div>
      </div>

      <div className="admin-form-grid">
        <div className="admin-form-group">
          <label>
            <input type="checkbox" name="show_in_drawer" value="1" defaultChecked={d.showInDrawer} />{" "}
            <strong>Show in left sidebar</strong>
          </label>
        </div>
        <div className="admin-form-group">
          <label>
            <input type="checkbox" name="show_on_home" value="1" defaultChecked={d.showOnHome} />{" "}
            <strong>Show on home page</strong>
          </label>
        </div>
        <div className="admin-form-group">
          <label>
            <input type="checkbox" name="hidden" value="1" defaultChecked={d.hidden} />{" "}
            <strong>Hidden draft (not public)</strong>
          </label>
        </div>
        <div className="admin-form-group">
          <label>
            <input type="checkbox" name="is_demo" value="1" defaultChecked={d.isDemo} />{" "}
            <strong>Mark as demo / test data</strong>
          </label>
        </div>
        <div className="admin-form-group">
          <label>
            <input type="checkbox" name="auto_rank_by_wagered" value="1" defaultChecked={d.autoRank} />{" "}
            <strong>Auto-sort by wager</strong>
          </label>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card__head">
          <strong>Automatic wager growth</strong>{" "}
          <label>
            <input type="checkbox" name="auto_wager_growth_enabled" value="1" defaultChecked={d.growth} />{" "}
            <span>Enable scheduled auto-growth</span>
          </label>
        </div>
        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-form-label">Growth per interval (% of current)</label>
            <input
              type="number"
              name="auto_wager_growth_pct"
              className="admin-input"
              min="1"
              max="100"
              defaultValue={d.pct}
            />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Tick interval (hours)</label>
            <input
              type="number"
              name="auto_wager_growth_hours"
              className="admin-input"
              min="0.1"
              step="0.5"
              defaultValue={d.hours}
            />
          </div>
        </div>
      </div>
    </form>
  );
}
