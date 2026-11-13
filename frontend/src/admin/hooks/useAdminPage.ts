import { useEffect } from "react";

/**
 * Per-page document setup: the legacy pages all had `<title>KDeenOff</title>` and
 * `<body class="admin-body" data-admin-page="…">`. Reproduced for every route.
 */
export function useAdminPage(page: string | null, title = "KDeenOff"): void {
  useEffect(() => {
    document.title = title;
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.append(icon);
    }
    icon.type = "image/png";
    icon.href = "/img/brand/favicon.png";
    const body = document.body;
    if (page) body.dataset.adminPage = page;
    else delete body.dataset.adminPage;
    return () => {
      if (body.dataset.adminPage === page) delete body.dataset.adminPage;
    };
  }, [page, title]);
}
