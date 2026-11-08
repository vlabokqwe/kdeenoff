/**
 * Drop static files the live site does not reference, so they are not uploaded
 * with the Worker. Sources stay in public/ and src/. Only dist/ is pruned.
 *
 * Live site: home, raffles, bonuses, leaderboards, account, admin.
 * Design boards are not part of that set: /logo-options/, /logos/, /mode-cards/.
 */
import { lstat, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");

const SOURCE_DIRS = ["src", path.join("public", "js"), path.join("public", "css"), path.join("public", "admin")];
const SKIP_REL = new Set([
  "src/logos.njk",
  "src/logos-word.njk",
  "src/mode-cards.njk",
  "src/_includes/board.njk",
  "public/css/logos.css",
]);
const TEXT_EXT = new Set([".njk", ".html", ".css", ".js", ".mjs", ".json", ".svg"]);
const MEDIA_EXT = new Set([".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".mp4", ".webm", ".woff2"]);
const DROP_DIRS = ["logo-options", "logos", "mode-cards"];

const STATIC_RE =
  /\/(?:img|fonts|css)\/[A-Za-z0-9_./~-]+\.(?:webp|png|jpe?g|gif|svg|mp4|webm|woff2|css)/gi;
const DYNAMIC_RE =
  /\/(?:img|fonts)\/[A-Za-z0-9_./~-]*(?:\$\{[^}]+\}|\{\{[^}]+\}\})[A-Za-z0-9_./~-]*\.(?:webp|png|jpe?g|gif|svg|mp4|webm|woff2)/gi;

/** If the scanner misses one of these, pruning stops instead of shipping a broken site. */
const REQUIRED = [
  "img/brand/mark-muzzle.png",
  "img/brand/kick-logo-k.svg",
  "img/brand/mark-cards.webp",
  "img/deco/raffle-burst.mp4",
  "img/deco/bonus-burst.mp4",
  "img/deco/dash-live.mp4",
  "img/deco/mode-raffle.webp",
  "img/deco/mode-boards.webp",
  "img/partners/stake-raccoon.webm",
  "img/partners/stake-slot-bg.webp",
  "img/bg/glyph-gift.webp",
  "img/lb/place-1.webp",
  "img/lb/slot-host.webm",
  "img/steps/register.webp",
  "img/footer/mark.webp",
  "img/contacts/kick.webp",
  "fonts/rubik-latin.woff2",
  "fonts/rubik-latin-ext.woff2",
];

function posix(value) {
  return value.split(path.sep).join("/");
}

function stripComments(text) {
  return text
    .replace(/\{#[\s\S]*?#\}/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

function cleanPath(raw) {
  let value = raw.split("?")[0].split("#")[0];
  try {
    value = decodeURIComponent(value);
  } catch {
    /* keep the raw path */
  }
  if (value.startsWith("/")) value = value.slice(1);
  return value;
}

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

/** rel is a dist path such as img/steps/register.webp. Directories are not passed here. */
export function keepPublishedFile(rel, refs) {
  const normalized = String(rel).replaceAll("\\", "/").replace(/^\//, "");
  if (normalized === "css/logos.css") return false;
  const ext = path.posix.extname(normalized).toLowerCase();
  if ((normalized.startsWith("img/") || normalized.startsWith("fonts/")) && MEDIA_EXT.has(ext)) {
    return isKept(normalized, refs.used, refs.dynamics);
  }
  return true;
}

async function collectReferences() {
  const used = new Set();
  const dynamics = [];

  function addDynamic(raw) {
    const cleaned = raw.split("?")[0].split("#")[0];
    const token = "\u0000";
    const marked = cleaned.replace(/\$\{[^}]+\}|\{\{[^}]+\}\}/g, token);
    const escaped = marked.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    dynamics.push(new RegExp("^" + escaped.replaceAll(token, "[^/]+") + "$", "i"));
  }

  for (const dir of SOURCE_DIRS) {
    for (const file of await walk(path.join(root, dir))) {
      const rel = posix(path.relative(root, file));
      if (SKIP_REL.has(rel)) continue;
      if (!TEXT_EXT.has(path.extname(file).toLowerCase())) continue;
      const text = stripComments(await readFile(file, "utf8"));
      DYNAMIC_RE.lastIndex = 0;
      for (const match of text.matchAll(DYNAMIC_RE)) addDynamic(match[0]);
      STATIC_RE.lastIndex = 0;
      for (const match of text.matchAll(STATIC_RE)) used.add(cleanPath(match[0]));
    }
  }

  return { used, dynamics };
}

export async function loadSiteReferences() {
  return collectReferences();
}

function isKept(rel, used, dynamics) {
  if (used.has(rel)) return true;
  const abs = `/${rel}`;
  return dynamics.some((re) => re.test(abs));
}

async function removeEmptyDirs(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) await removeEmptyDirs(path.join(dir, entry.name));
  }
  try {
    const left = await readdir(dir);
    if (left.length === 0) await rm(dir, { recursive: true, force: true });
  } catch {
    /* already gone */
  }
}

function isInside(parent, child) {
  const parentPath = path.resolve(parent);
  const childPath = path.resolve(child);
  const prefix = parentPath.endsWith(path.sep) ? parentPath : parentPath + path.sep;
  if (process.platform === "win32") {
    const childLower = childPath.toLowerCase();
    return childLower === parentPath.toLowerCase() || childLower.startsWith(prefix.toLowerCase());
  }
  return childPath === parentPath || childPath.startsWith(prefix);
}

function assertOutputDir(dir) {
  const resolved = path.resolve(dir);
  if (resolved === path.resolve(root) || isInside(path.join(root, "public"), resolved) || isInside(path.join(root, "src"), resolved)) {
    throw new Error(`refusing to prune ${resolved}`);
  }
}

async function safeRemove(file, outputDir) {
  const info = await lstat(file);
  if (info.isSymbolicLink()) {
    if (!isInside(outputDir, file)) throw new Error(`refusing to delete outside output: ${file}`);
    await rm(file);
    return;
  }
  const real = await realpathInside(file);
  const outputReal = await realpathInside(outputDir);
  if (!isInside(outputReal, real)) throw new Error(`refusing to delete outside output: ${file}`);
  await rm(file);
}

async function realpathInside(file) {
  const { realpath } = await import("node:fs/promises");
  return realpath(file);
}

function mb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * @param {{ dry?: boolean, outputDir?: string }} [opts]
 * dry scans public/ and deletes nothing. Otherwise outputDir (or dist/) is pruned.
 */
export async function pruneUnusedAssets(opts = {}) {
  const dry = Boolean(opts.dry);
  const { used, dynamics } = await collectReferences();
  const missed = REQUIRED.filter((rel) => !isKept(rel, used, dynamics));
  if (missed.length) {
    throw new Error(`asset prune aborted, references not found: ${missed.join(", ")}`);
  }

  const baseDir = dry ? path.join(root, "public") : path.resolve(opts.outputDir || distDir);
  if (!dry) assertOutputDir(baseDir);
  const dropped = [];

  async function consider(full, rel) {
    if (isKept(rel, used, dynamics)) return;
    const bytes = (await stat(full)).size;
    dropped.push({ rel, bytes });
    if (!dry) await safeRemove(full, baseDir);
  }

  for (const dirName of DROP_DIRS) {
    const dir = path.join(baseDir, dirName);
    for (const full of await walk(dir)) {
      const rel = posix(path.relative(baseDir, full));
      const bytes = (await stat(full)).size;
      dropped.push({ rel, bytes });
      if (!dry) await safeRemove(full, baseDir);
    }
    if (!dry) await rm(dir, { recursive: true, force: true });
  }

  for (const folder of ["img", "fonts"]) {
    for (const full of await walk(path.join(baseDir, folder))) {
      if (!MEDIA_EXT.has(path.extname(full).toLowerCase())) continue;
      await consider(full, posix(path.relative(baseDir, full)));
    }
  }

  const logosCss = path.join(baseDir, "css", "logos.css");
  try {
    await stat(logosCss);
    await consider(logosCss, "css/logos.css");
  } catch {
    /* not in this tree */
  }

  if (!dry) {
    await removeEmptyDirs(path.join(baseDir, "img"));
    await removeEmptyDirs(path.join(baseDir, "fonts"));
  }

  const bytes = dropped.reduce((sum, file) => sum + file.bytes, 0);
  const groups = new Map();
  for (const file of dropped) {
    const parts = file.rel.split("/");
    const key = parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0];
    const group = groups.get(key) || { count: 0, bytes: 0 };
    group.count += 1;
    group.bytes += file.bytes;
    groups.set(key, group);
  }
  const lines = [...groups.entries()]
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .map(([key, group]) => `    ${key}  ${group.count} files, ${mb(group.bytes)}`);

  console.log(
    `  assets  ${dry ? "would leave out" : "left out"} ${dropped.length} files, ${mb(bytes)}`,
  );
  if (lines.length) console.log(lines.join("\n"));
  if (process.argv.includes("--verbose")) {
    const kept = [];
    for (const folder of ["img", "fonts"]) {
      for (const full of await walk(path.join(baseDir, folder))) {
        const rel = posix(path.relative(baseDir, full));
        if (isKept(rel, used, dynamics)) kept.push(rel);
      }
    }
    console.log(`  kept ${kept.length}\n    ${kept.sort().join("\n    ")}`);
  }
  return { dropped: dropped.length, bytes };
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  const dry = !process.argv.includes("--dist");
  await pruneUnusedAssets({ dry });
}
