import type { FormEvent } from "react";
import { api, errorMessage } from "../../lib/api";
import type { StatusType } from "../../hooks/useStatus";
import { AdminModal, ModalCloseButton, ModalCloseX } from "../AdminModal";

interface AddPlayerModalProps {
  slug: string;
  open: boolean;
  nonce: number;
  onClose: () => void;
  showStatus: (text: string, type?: StatusType) => void;
  onAdded: () => void;
}

/** "Add player" modal (`#modal-add-player`); the form resets on every opening. */
export function AddPlayerModal({ slug, open, nonce, onClose, showStatus, onAdded }: AddPlayerModalProps) {
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      username: fd.get("username"),
      wagered_cents: Math.round(Number(fd.get("wagered_usd") || 0) * 100),
      prize_cents: Math.round(Number(fd.get("prize_usd") || 0) * 100),
      avatar_url: fd.get("avatar_url"),
      wag_growth_enabled: fd.get("wag_growth_enabled") ? 1 : 0,
    };
    try {
      await api(`/api/admin/leaderboards/${slug}/players`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      // The parent hides this modal and reloads the board.
      onAdded();
      showStatus("Player added ✓");
    } catch (err) {
      alert(`Error: ${errorMessage(err)}`);
    }
  };

  return (
    <AdminModal id="modal-add-player" open={open}>
      <div className="admin-modal__head">
        <h3>Add player</h3>
        <ModalCloseX onClose={onClose} />
      </div>
      <form key={nonce} data-form-add-player="" onSubmit={onSubmit}>
        <div className="admin-modal__body">
          <div className="admin-form-group">
            <label className="admin-form-label">Player username *</label>
            <input type="text" name="username" className="admin-input" required placeholder="e.g. LuckySnail" />
          </div>
          <div className="admin-form-grid">
            <div className="admin-form-group">
              <label className="admin-form-label">Wager amount ($)</label>
              <input type="number" name="wagered_usd" className="admin-input" step="0.01" defaultValue="0" />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Prize ($)</label>
              <input type="number" name="prize_usd" className="admin-input" step="0.01" defaultValue="0" />
            </div>
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Custom avatar URL (optional)</label>
            <input type="url" name="avatar_url" className="admin-input" placeholder="https://..." />
          </div>
          <div className="admin-form-group">
            <label>
              <input type="checkbox" name="wag_growth_enabled" value="1" defaultChecked />{" "}
              <strong>Enable wager auto-growth for this player</strong>
            </label>
          </div>
        </div>
        <div className="admin-modal__footer">
          <ModalCloseButton onClose={onClose} />{" "}
          <button type="submit" className="adm-btn adm-btn--primary">
            Add
          </button>
        </div>
      </form>
    </AdminModal>
  );
}
