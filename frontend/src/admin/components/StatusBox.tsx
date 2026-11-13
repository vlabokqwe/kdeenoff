import type { HTMLAttributes } from "react";
import type { StatusState } from "../hooks/useStatus";

type StatusBoxProps = Omit<HTMLAttributes<HTMLElement>, "hidden" | "children"> & {
  as?: "div" | "p";
  status: StatusState | null;
  [dataAttr: `data-${string}`]: string | undefined;
};

/**
 * Status box: keeps its initial markup (`<div id="admin-status-box" hidden>` or
 * `<p class="adm-status" data-…-status hidden>`) until the first message, then
 * becomes `adm-status adm-status--<type>` and auto-hides (see useStatus).
 */
export function StatusBox({ as = "div", status, className, ...rest }: StatusBoxProps) {
  const Tag = as;
  return (
    <Tag
      {...rest}
      className={status ? `adm-status adm-status--${status.type}` : className}
      hidden={!status?.visible}
    >
      {status?.text}
    </Tag>
  );
}
