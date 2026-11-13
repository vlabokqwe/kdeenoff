import { useEffect, useState, type FormEvent } from "react";
import type { Raffle } from "../../lib/types";
import { DAY_MS, localISO } from "../../lib/format";
import { AdminModal, ModalCloseButton, ModalCloseX } from "../AdminModal";

export interface RaffleFormDefaults {
  editing: boolean;
  title: string;
  prize: string;
  winner: string;
  note: string;
  endMode: "timer" | "manual";
  startsLocal: string;
  endsLocal: string;
  hidden: boolean;
  isDemo: boolean;
}

/** Legacy `fillForm(row)`: values for a new (row = null) or an existing raffle. */
export function raffleDefaults(row: Raffle | null): RaffleFormDefaults {
  const endMode: "timer" | "manual" = row?.end_mode === "manual" ? "manual" : "timer";
  const defaultEnds =
    row && endMode === "timer" && row.ends_at
      ? row.ends_at
      : Date.now() + 7 * DAY_MS;
  return {
    editing: !!row,
    title: row?.title || "",
    prize: row?.prize || "",
    winner: row?.winner || "",
    note: row?.note || "",
    endMode,
    startsLocal: localISO(row?.starts_at || Date.now()),
    endsLocal: localISO(defaultEnds),
    hidden: !!row?.hidden,
    isDemo: !!row?.is_demo,
  };
}

interface RaffleModalProps {
  open: boolean;
  nonce: number;
  defaults: RaffleFormDefaults | undefined;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}

/** "New raffle" / "Edit raffle" modal (`#modal-raffle`). */
export function RaffleModal({ open, nonce, defaults, onClose, onSubmit }: RaffleModalProps) {
  const d = defaults;
  const [endMode, setEndMode] = useState<"timer" | "manual">(d?.endMode || "timer");

  useEffect(() => {
    setEndMode(d?.endMode || "timer");
  }, [nonce, d?.endMode]);

  return (
    <AdminModal id="modal-raffle" open={open}>
      <div className="admin-modal__head">
        <h3 data-raffle-modal-title="">{d?.editing ? "Edit raffle" : "New raffle"}</h3>
        <ModalCloseX onClose={onClose} />
      </div>
      <form key={nonce} data-form-raffle="" onSubmit={onSubmit}>
        <div className="admin-modal__body">
          <div className="admin-form-group">
            <label className="admin-form-label">Title *</label>
            <input
              type="text"
              name="title"
              className="admin-input"
              required
              maxLength={120}
              placeholder="e.g. Weekly $500 Raffle"
              defaultValue={d?.title}
            />
          </div>

          <div className="admin-form-grid">
            <div className="admin-form-group">
              <label className="admin-form-label">Prize</label>
              <input
                type="text"
                name="prize"
                className="admin-input"
                maxLength={120}
                placeholder="$500 or iPhone"
                defaultValue={d?.prize}
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Completion mode</label>
              <select
                name="end_mode"
                className="admin-input"
                value={endMode}
                onChange={(e) => setEndMode(e.target.value === "manual" ? "manual" : "timer")}
              >
                <option value="timer">Countdown timer</option>
                <option value="manual">Manual (streamer button)</option>
              </select>
            </div>
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">Winner</label>
            <input
              type="text"
              name="winner"
              className="admin-input"
              maxLength={80}
              placeholder="For a finished raffle"
              defaultValue={d?.winner}
            />
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">Note / Rules</label>
            <textarea
              name="note"
              className="admin-textarea"
              rows={2}
              maxLength={500}
              placeholder="Terms, how to enter (separate rules with |)"
              defaultValue={d?.note}
            ></textarea>
          </div>

          <div className="admin-form-grid">
            <div className="admin-form-group">
              <label className="admin-form-label">Starts</label>
              <input
                type="datetime-local"
                name="starts_at_local"
                className="admin-input"
                defaultValue={d?.startsLocal}
              />
            </div>
            {endMode === "timer" && (
              <div className="admin-form-group">
                <label className="admin-form-label">Ends *</label>
                <input
                  type="datetime-local"
                  name="ends_at_local"
                  className="admin-input"
                  required
                  defaultValue={d?.endsLocal}
                />
              </div>
            )}
          </div>

          <p className="admin-page-sub">
            {endMode === "manual"
              ? "Manual mode stays open until you press End raffle on the raffle page or here."
              : "If the end date has passed, the raffle goes to Past. Otherwise it is in Active."}
          </p>

          <label>
            <input type="checkbox" name="hidden" value="1" defaultChecked={d?.hidden} />{" "}
            <span>Hide from site</span>
          </label>{" "}
          <label>
            <input type="checkbox" name="is_demo" value="1" defaultChecked={d?.isDemo} />{" "}
            <span>Mark as demo / test raffle</span>
          </label>
        </div>
        <div className="admin-modal__footer">
          <ModalCloseButton onClose={onClose} />{" "}
          <button type="submit" className="adm-btn adm-btn--primary" data-raffle-submit="">
            {d?.editing ? "Save" : "Add"}
          </button>
        </div>
      </form>
    </AdminModal>
  );
}
