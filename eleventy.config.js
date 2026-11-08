import { statSync } from "node:fs";
import path from "node:path";
import { keepPublishedFile, loadSiteReferences, pruneUnusedAssets } from "./scripts/prune-assets.mjs";

function copyFilter(prefix, refs) {
  return (rel) => {
    if (!rel) return true;
    const normalized = `${prefix}/${String(rel).replaceAll("\\", "/")}`.replace(/\/+/g, "/");
    try {
      if (statSync(path.join("public", normalized)).isDirectory()) return true;
    } catch {
      return false;
    }
    return keepPublishedFile(normalized, refs);
  };
}

/** @param {import("@11ty/eleventy").UserConfig} eleventyConfig */
export default async function (eleventyConfig) {
  const refs = await loadSiteReferences();
  // logo-options is a generation dump, not a site page.
  for (const dir of ["admin", "js"]) {
    eleventyConfig.addPassthroughCopy({ [`public/${dir}`]: dir });
  }
  for (const dir of ["css", "fonts", "img"]) {
    eleventyConfig.addPassthroughCopy({ [`public/${dir}`]: dir }, { filter: copyFilter(dir, refs) });
  }
  // Design boards. Their files stay in the repo and are left out of dist.
  eleventyConfig.ignores.add("src/logos.njk");
  eleventyConfig.ignores.add("src/logos-word.njk");
  eleventyConfig.ignores.add("src/mode-cards.njk");
  eleventyConfig.on("eleventy.after", ({ directories }) =>
    pruneUnusedAssets({ outputDir: directories.output }),
  );
  eleventyConfig.addShortcode("year", () => String(new Date().getFullYear()));

  return {
    dir: {
      input: "src",
      output: "dist",
      includes: "_includes",
      data: "_data",
    },
  };
}
