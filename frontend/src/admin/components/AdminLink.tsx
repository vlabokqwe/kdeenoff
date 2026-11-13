import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { useNavigate } from "react-router-dom";

export const ADMIN_BASE = "/admin";

type AdminLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  /** Path inside the admin app, e.g. "/" or "/leaderboards/". */
  to: string;
};

/**
 * In-app link that renders the exact legacy href (`/admin/`, `/admin/leaderboards/`, …)
 * and navigates client-side on a plain left click (modified clicks open normally).
 */
export function AdminLink({ to, onClick, target, ...rest }: AdminLinkProps) {
  const navigate = useNavigate();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.altKey ||
      e.ctrlKey ||
      e.shiftKey ||
      (target && target !== "_self")
    ) {
      return;
    }
    e.preventDefault();
    navigate(to);
  };

  return <a href={`${ADMIN_BASE}${to}`} target={target} onClick={handleClick} {...rest} />;
}
