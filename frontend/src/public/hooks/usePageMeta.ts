import { useEffect } from "react";
import { site } from "../../shared/site";

/** Every page class a route can put on <body>, next to the permanent `site`. */
const PAGE_CLASSES = ["site--home", "site--raffles", "site--bonuses", "site--account", "site--board"];

export interface PageMeta {
  /** Kept for call sites. The browser tab title is always KDeenOff. */
  title?: string;
  /** Body page modifier class, e.g. "site--raffles". */
  pageClass?: string;
  description?: string;
}

const TAB_ICON = "/img/brand/favicon.png";

/** document.title, the tab icon, <body class="site {pageClass}"> and the meta description. */
export function usePageMeta({ pageClass = "", description = site.tagline }: PageMeta): void {
  useEffect(() => {
    document.title = site.title;
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.append(icon);
    }
    icon.type = "image/png";
    icon.href = TAB_ICON;
  }, []);

  useEffect(() => {
    const wanted = pageClass.split(/\s+/).filter(Boolean);
    const body = document.body;
    body.classList.add("site");
    for (const name of PAGE_CLASSES) {
      if (!wanted.includes(name)) body.classList.remove(name);
    }
    for (const name of wanted) body.classList.add(name);
  }, [pageClass]);

  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.append(meta);
    }
    meta.content = description;
  }, [description]);
}
