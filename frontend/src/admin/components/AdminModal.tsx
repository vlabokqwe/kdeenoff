import type { ReactNode } from "react";

interface AdminModalProps {
  id: string;
  open: boolean;
  children: ReactNode;
}

/**
 * Legacy modal shell: `<div class="admin-modal" id="…" hidden>` → `.admin-modal__card`.
 * Stays mounted (hidden) like the old static markup, so uncontrolled fields keep
 * their values exactly as before between openings.
 */
export function AdminModal({ id, open, children }: AdminModalProps) {
  return (
    <div className="admin-modal" id={id} hidden={!open}>
      <div className="admin-modal__card">{children}</div>
    </div>
  );
}

interface CloseButtonProps {
  onClose: () => void;
}

/** Header "×" button (`data-close-modal`). */
export function ModalCloseX({ onClose }: CloseButtonProps) {
  return (
    <button type="button" className="adm-btn adm-btn--secondary adm-btn--sm" data-close-modal="" onClick={onClose}>
      ×
    </button>
  );
}

/** Footer secondary button (`data-close-modal`), "Cancel" or "Close". */
export function ModalCloseButton({ onClose, label = "Cancel" }: CloseButtonProps & { label?: string }) {
  return (
    <button type="button" className="adm-btn adm-btn--secondary" data-close-modal="" onClick={onClose}>
      {label}
    </button>
  );
}
