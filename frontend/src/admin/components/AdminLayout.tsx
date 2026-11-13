import { Fragment, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AdminLink } from "./AdminLink";

const NAV: { to: string; label: string; end?: boolean }[] = [
  { to: "/", label: "Overview", end: true },
  { to: "/leaderboards/", label: "Leaderboards" },
  { to: "/raffles/", label: "Raffles" },
  { to: "/site/", label: "Site settings" },
  { to: "/audit/", label: "Audit log" },
];

function isActive(pathname: string, to: string, end?: boolean): boolean {
  const p = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return end ? p === to : p.startsWith(to);
}

/** The legacy admin header + nav (active link gets `is-active`), then the page. */
export function AdminLayout() {
  const { pathname } = useLocation();

  // A full page load used to start at the top; keep that for client navigation.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <header className="admin-header">
        <div className="admin-header__inner">
          <AdminLink to="/" className="admin-header__brand">
            <strong>KDeenOff</strong>{" "}
            <span className="admin-header__badge">Admin</span>
          </AdminLink>

          <nav className="admin-nav">
            {NAV.map((item, i) => (
              <Fragment key={item.to}>
                {i > 0 ? " " : null}
                <AdminLink
                  to={item.to}
                  className={isActive(pathname, item.to, item.end) ? "is-active" : undefined}
                >
                  {item.label}
                </AdminLink>
              </Fragment>
            ))}
          </nav>

          <a href="/" className="admin-header__site-link" target="_blank">
            Open site ↗
          </a>
        </div>
      </header>

      <Outlet />
    </>
  );
}
