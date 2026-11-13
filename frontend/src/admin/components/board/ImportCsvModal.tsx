import type { FormEvent } from "react";
import { api, errorMessage } from "../../lib/api";
import type { StatusType } from "../../hooks/useStatus";
import { AdminModal, ModalCloseButton, ModalCloseX } from "../AdminModal";

interface ImportCsvModalProps {
  slug: string;
  open: boolean;
  onClose: () => void;
  showStatus: (text: string, type?: StatusType) => void;
  onImported: () => void;
}

/**
 * "Import players from CSV" modal (`#modal-import-csv`). The raw text goes to the
 * server (`{ csv }`), which parses it. Like before, the textarea is not cleared
 * between openings.
 */
export function ImportCsvModal({ slug, open, onClose, showStatus, onImported }: ImportCsvModalProps) {
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const mode = String(fd.get("mode") || "merge") === "replace" ? "replace" : "merge";
    try {
      const res = await api<{ imported: number; created?: number; updated?: number; mode?: string }>(
        `/api/admin/leaderboards/${encodeURIComponent(slug)}/players/import-csv`,
        {
          method: "POST",
          body: JSON.stringify({ csv: fd.get("csv_text"), mode }),
        },
      );
      // The parent hides this modal and reloads the board.
      onImported();
      showStatus(
        mode === "replace"
          ? `Replaced player list with ${res.imported} players ✓`
          : `Imported ${res.imported} players ✓`,
      );
    } catch (err) {
      alert(`Import failed: ${errorMessage(err)}`);
    }
  };

  return (
    <AdminModal id="modal-import-csv" open={open}>
      <div className="admin-modal__head">
        <h3>Import players from CSV</h3>
        <ModalCloseX onClose={onClose} />
      </div>
      <form data-form-import-csv="" onSubmit={onSubmit}>
        <div className="admin-modal__body">
          <div className="admin-form-group">
            <label className="admin-form-label">Import mode</label>
            <select name="mode" className="admin-select" defaultValue="merge">
              <option value="merge">Merge — update existing usernames &amp; add new</option>
              <option value="replace">Replace — clear existing players first</option>
            </select>
          </div>
          <p>
            Paste rows in the format: <code>username, wager_in_usd, prize_in_usd</code>.<br />
            A header row will be skipped automatically.
          </p>
          <textarea
            name="csv_text"
            className="admin-textarea"
            rows={8}
            placeholder={"Player1, 15000, 500\nPlayer2, 8500, 250\nPlayer3, 4200, 100"}
            required
          ></textarea>
        </div>
        <div className="admin-modal__footer">
          <ModalCloseButton onClose={onClose} />{" "}
          <button type="submit" className="adm-btn adm-btn--primary">
            Import
          </button>
        </div>
      </form>
    </AdminModal>
  );
}
