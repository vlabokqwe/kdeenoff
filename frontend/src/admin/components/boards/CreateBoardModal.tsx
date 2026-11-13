import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, errorMessage } from "../../lib/api";
import { DAY_MS, fromLocalISO, localISO } from "../../lib/format";
import { AdminModal, ModalCloseButton, ModalCloseX } from "../AdminModal";

interface CreateBoardModalProps {
  open: boolean;
  /** Bumped on every opening: remounts the form (legacy `form.reset()`). */
  nonce: number;
  onClose: () => void;
}

/** "New leaderboard" modal (`#modal-create-board`), shared by Overview and Leaderboards. */
export function CreateBoardModal({ open, nonce, onClose }: CreateBoardModalProps) {
  return (
    <AdminModal id="modal-create-board" open={open}>
      <div className="admin-modal__head">
        <h3>New leaderboard</h3>
        <ModalCloseX onClose={onClose} />
      </div>
      <CreateBoardForm key={nonce} onClose={onClose} />
    </AdminModal>
  );
}

const TOP_10_WEIGHTS = [0.4, 0.2, 0.12, 0.07, 0.05, 0.04, 0.035, 0.03, 0.03, 0.025];
const TOP_5_WEIGHTS = [0.45, 0.25, 0.15, 0.1, 0.05];
const TOP_3_WEIGHTS = [0.5, 0.3, 0.2];

type SpotPreset = "top10" | "top5" | "top3" | "empty";

function slugifyTitle(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function buildPresetSpots(preset: SpotPreset, poolCents: number) {
  if (preset === "empty" || poolCents <= 0) return [];
  const weights =
    preset === "top10"
      ? TOP_10_WEIGHTS
      : preset === "top5"
        ? TOP_5_WEIGHTS
        : TOP_3_WEIGHTS;
  return weights.map((w, idx) => ({
    rank: idx + 1,
    prize_cents: Math.round((poolCents * w) / 100) * 100,
    hidden: 0,
  }));
}

function CreateBoardForm({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [startsDefault] = useState(() => localISO(Date.now()));
  const [endsDefault] = useState(() => localISO(Date.now() + 30 * DAY_MS));

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const startsAt = fromLocalISO(fd.get("starts_at_local"));
    const endsAt = fromLocalISO(fd.get("ends_at_local"));
    const prizePoolCents = Math.round(Number(fd.get("prize_pool_usd") || 0) * 100);
    const preset = (String(fd.get("spot_preset") || "top10") as SpotPreset);
    const spots = buildPresetSpots(preset, prizePoolCents);

    const payload = {
      title: fd.get("title"),
      slug: String(fd.get("slug") || "").trim() || undefined,
      subtitle: fd.get("subtitle"),
      prize_pool_cents: prizePoolCents,
      partner: fd.get("partner"),
      partner_signup_url: fd.get("partner_signup_url"),
      badge: fd.get("badge"),
      promo_code: fd.get("promo_code"),
      sort_order: Math.floor(Number(fd.get("sort_order") || 0)),
      starts_at: startsAt,
      ends_at: endsAt,
      avatar_style: fd.get("avatar_style"),
      show_in_drawer: fd.get("show_in_drawer") === "1",
      show_on_home: fd.get("show_on_home") === "1",
      hidden: fd.get("hidden") === "1",
      is_demo: fd.get("is_demo") === "1",
      spots,
    };

    try {
      const res = await api<{ slug: string }>("/api/admin/leaderboards", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onClose();
      navigate(`/leaderboards/${res.slug}/`);
    } catch (err) {
      alert(`Create failed: ${errorMessage(err)}`);
    }
  };

  return (
    <form data-form-create-board="" onSubmit={onSubmit}>
      <div className="admin-modal__body">
        <div className="admin-form-group">
          <label className="admin-form-label">Leaderboard title *</label>
          <input
            type="text"
            name="title"
            className="admin-input"
            required
            placeholder="e.g. KDeenOff $10,000 Race"
            value={title}
            onChange={(e) => {
              const v = e.target.value;
              setTitle(v);
              if (!slugTouched) setSlug(slugifyTitle(v));
            }}
          />
        </div>

        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-form-label">Slug (URL) *</label>
            <input
              type="text"
              name="slug"
              className="admin-input"
              placeholder="kdeenoff-monthly"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugifyTitle(e.target.value));
              }}
            />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Prize pool ($) *</label>
            <input type="number" name="prize_pool_usd" className="admin-input" defaultValue="10000" min="0" />
          </div>
        </div>

        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-form-label">Badge (blank = auto)</label>
            <input type="text" name="badge" className="admin-input" maxLength={24} placeholder="MONTHLY / WEEKLY / VIP" />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Promo code</label>
            <input type="text" name="promo_code" className="admin-input" maxLength={40} defaultValue="KDEENOFF" />
          </div>
        </div>

        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-form-label">Partner (casino)</label>
            <input type="text" name="partner" className="admin-input" defaultValue="stake" placeholder="stake / rainbet" />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Sign-up link</label>
            <input
              type="url"
              name="partner_signup_url"
              className="admin-input"
              defaultValue="https://stake.com/?c=KDEENOFF"
            />
          </div>
        </div>

        <div className="admin-form-group">
          <label className="admin-form-label">Subtitle / Description</label>
          <textarea
            name="subtitle"
            className="admin-textarea"
            rows={2}
            placeholder="Play at the casino with code KDEENOFF..."
          ></textarea>
        </div>

        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-form-label">Start date</label>
            <input type="datetime-local" name="starts_at_local" className="admin-input" defaultValue={startsDefault} />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">End date *</label>
            <input type="datetime-local" name="ends_at_local" className="admin-input" required defaultValue={endsDefault} />
          </div>
        </div>

        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-form-label">Initial spot prizes</label>
            <select name="spot_preset" className="admin-select" defaultValue="top10">
              <option value="top10">Top 10 (auto-split)</option>
              <option value="top5">Top 5 (auto-split)</option>
              <option value="top3">Top 3 (podium)</option>
              <option value="empty">Empty</option>
            </select>
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Sort order</label>
            <input type="number" name="sort_order" className="admin-input" defaultValue="0" step="1" />
          </div>
        </div>

        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-form-label">Avatar style</label>
            <select name="avatar_style" className="admin-select" defaultValue="kdeenoff">
              <option value="kdeenoff">KDeenOff Monkey Drops (auto)</option>
              <option value="kdeenoff-camo">KDeenOff Street Camo &amp; Patch</option>
              <option value="kdeenoff-luxe">KDeenOff Luxe Metals &amp; Stone</option>
              <option value="none">No avatars</option>
            </select>
          </div>
          <div className="admin-form-group">
            <label>
              <input type="checkbox" name="show_in_drawer" value="1" defaultChecked />{" "}
              <span>Show in left sidebar</span>
            </label>
            <br />
            <label>
              <input type="checkbox" name="show_on_home" value="1" defaultChecked />{" "}
              <span>Show on home page</span>
            </label>
            <br />
            <label>
              <input type="checkbox" name="hidden" value="1" />{" "}
              <span>Hidden draft</span>
            </label>
            <br />
            <label>
              <input type="checkbox" name="is_demo" value="1" />{" "}
              <span>Mark as demo / test data</span>
            </label>
          </div>
        </div>
      </div>
      <div className="admin-modal__footer">
        <ModalCloseButton onClose={onClose} />{" "}
        <button type="submit" className="adm-btn adm-btn--primary">
          Create race
        </button>
      </div>
    </form>
  );
}
