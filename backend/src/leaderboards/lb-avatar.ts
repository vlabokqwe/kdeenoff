/**
 * Deterministic KDeenOff Monkey-with-Joint collector avatar generator.
 *
 * Uses the exact official KDeenOff monkey muzzle + half-lidded eyes + lit joint
 * silhouette (subpixel-traced from `frontend/public/img/brand/mark-white.png`)
 * and renders it across 15 collector craft/material/texture editions and 32
 * curated streetwear & art-toy colorways — inspired by how iconic single-mark
 * labels (e.g. BAPE Ape Head / Bearbrick / gallery print drops) spin one
 * unmistakable silhouette into hundreds of distinct tactile editions.
 */

import type { DatabaseService } from "../database/database.service";

// Exact subpixel Bezier contours of the official KDeenOff logo in viewBox 0 0 128 128
const EYE_LEFT =
  "M36.28 33.37C36.79 34.25 37.19 35.49 38.23 36.77C39.34 38.13 40.13 38.84 41.55 39.85C42.87 40.79 43.46 41.06 45.00 41.58C46.59 42.11 47.36 42.29 49.09 42.38C50.83 42.48 51.56 42.46 53.27 42.04C55.02 41.60 55.86 41.31 57.42 40.31C58.98 39.31 59.66 38.75 60.70 37.28C61.75 35.82 61.96 34.36 62.40 33.34L58.46 33.34C58.36 33.91 58.50 34.69 58.08 35.53C57.64 36.42 57.14 36.92 56.35 37.57C55.62 38.18 55.25 38.36 54.34 38.61C53.31 38.89 52.57 38.97 51.46 38.93C50.40 38.88 49.94 38.76 49.01 38.38C48.09 38.00 47.71 37.76 47.02 37.11C46.34 36.47 46.05 36.09 45.72 35.30C45.40 34.52 45.53 33.83 45.46 33.31L36.28 33.37Z";

const EYE_RIGHT =
  "M80.09 33.40C80.54 34.37 80.84 35.72 81.84 37.14C82.85 38.57 83.41 39.13 84.87 40.19C86.38 41.29 87.31 41.76 89.05 42.38C90.69 42.97 91.39 43.12 93.14 43.16C95.03 43.21 96.20 43.12 98.09 42.61C99.89 42.13 100.59 41.79 102.12 40.74C103.66 39.69 104.31 39.15 105.41 37.60C106.50 36.05 106.83 34.47 107.34 33.37L99.39 33.37C99.25 34.03 99.30 34.97 98.87 35.90C98.43 36.83 98.12 37.17 97.31 37.80C96.47 38.47 95.95 38.76 94.83 39.07C93.72 39.38 93.13 39.40 91.98 39.30C90.86 39.21 90.38 39.07 89.39 38.61C88.41 38.14 87.94 37.75 87.29 37.08C86.72 36.50 86.52 36.19 86.28 35.41C86.04 34.63 86.17 33.90 86.14 33.37L80.09 33.40Z";

const CONE =
  "M30.34 52.29C30.54 52.85 31.01 53.49 31.12 54.45C31.23 55.49 31.28 56.14 30.89 57.25C30.50 58.35 30.10 58.90 29.28 59.69C28.47 60.47 27.57 60.67 26.97 61.02C35.50 64.08 51.25 69.74 59.78 72.80L60.44 72.28L60.47 71.01C59.33 70.21 57.98 69.14 56.09 67.90C52.13 65.31 46.98 61.96 41.58 58.69C36.93 55.87 33.26 53.95 30.34 52.29Z";

const CHERRY =
  "M23.49 49.44C22.62 49.57 22.18 49.72 21.41 50.16C20.66 50.60 20.38 50.84 19.86 51.54C19.33 52.24 19.13 52.65 18.91 53.50C18.68 54.34 18.69 54.76 18.79 55.57C18.89 56.37 18.95 56.71 19.37 57.39C19.83 58.15 20.20 58.63 21.01 59.20C21.82 59.78 22.39 59.93 23.23 60.13C23.96 60.29 24.28 60.28 25.01 60.13C25.84 59.96 26.38 59.79 27.14 59.32C27.88 58.87 28.15 58.62 28.64 57.91C29.16 57.18 29.39 56.71 29.59 55.83C29.79 54.98 29.76 54.61 29.59 53.76C29.42 52.91 29.25 52.51 28.79 51.80C28.33 51.11 28.08 50.86 27.40 50.39C26.73 49.92 26.38 49.75 25.56 49.55C24.74 49.36 24.35 49.31 23.49 49.44Z";

const MUZZLE_OUTER =
  "M58.17 42.07C57.19 42.59 56.79 43.11 56.15 43.76C55.63 44.30 55.48 44.56 55.11 45.21C54.74 45.85 54.57 46.11 54.39 46.85C54.21 47.64 54.27 48.42 54.22 48.98C53.10 49.34 51.48 49.66 49.90 50.36C48.46 51.00 47.94 51.34 46.70 52.32C45.46 53.31 44.91 53.89 44.00 55.06C43.15 56.13 42.78 57.12 42.35 57.85C46.32 60.21 52.97 64.92 57.62 66.92C60.27 68.07 61.66 66.76 64.48 67.38C67.42 68.04 69.17 69.24 71.62 70.03C73.48 70.64 74.41 70.88 76.14 71.19C77.68 71.46 78.29 71.50 79.86 71.50C81.72 71.50 82.88 71.58 85.01 71.19C87.46 70.73 89.67 70.00 91.52 69.34C92.56 68.98 92.92 68.70 93.83 68.08C94.75 67.43 95.38 66.75 95.93 66.29L96.42 66.58C96.46 66.82 96.67 67.12 96.56 67.50C96.42 67.98 96.20 68.36 95.76 68.85C95.19 69.49 94.77 69.98 93.86 70.52C92.36 71.41 90.93 72.23 88.64 73.06C86.09 73.98 84.66 74.34 81.70 74.90C78.49 75.51 76.50 75.72 73.35 75.94C70.56 76.13 69.01 76.06 66.69 75.94C64.84 75.84 64.13 75.74 62.31 75.36C60.45 74.98 59.65 74.77 57.79 74.10C55.13 73.13 51.73 71.53 49.64 70.75C48.92 70.49 48.32 70.48 47.86 70.38C47.85 71.18 47.62 72.18 47.83 73.46C48.06 74.93 48.34 75.79 48.98 77.38C49.63 79.00 49.98 79.66 50.94 81.18C51.93 82.75 52.40 83.44 53.70 84.87C55.19 86.50 56.05 87.42 58.02 88.93C60.09 90.51 61.26 91.23 63.52 92.39C65.64 93.47 66.51 93.81 68.80 94.46C71.11 95.11 72.11 95.32 74.56 95.50C77.16 95.69 78.42 95.69 81.18 95.38C83.99 95.07 85.24 94.82 87.92 94.00C90.54 93.19 91.63 92.73 93.94 91.46C96.18 90.24 97.31 89.30 98.93 87.98C100.19 86.95 100.60 86.45 101.63 85.19C102.75 83.81 103.32 83.09 104.25 81.41C105.19 79.74 105.52 79.04 106.10 77.21C106.68 75.37 106.83 74.48 107.02 72.68C107.20 71.00 107.21 70.34 107.02 68.65C106.83 66.90 106.69 66.10 106.10 64.36C105.49 62.59 105.14 61.86 104.14 60.21C103.13 58.55 102.56 57.86 101.29 56.47C100.07 55.13 99.47 54.65 98.09 53.59C96.76 52.56 96.21 52.20 94.72 51.43C93.19 50.63 92.31 50.28 90.80 49.79C89.46 49.35 88.37 49.25 87.52 49.06C87.26 48.33 87.01 47.23 86.51 46.24C86.06 45.36 85.83 45.04 85.13 44.34C84.28 43.49 83.68 42.94 82.45 42.18C81.22 41.41 80.67 41.13 79.25 40.68C77.39 40.10 75.95 39.71 73.61 39.42C71.30 39.13 70.37 39.13 68.08 39.30C65.78 39.47 64.74 39.64 62.66 40.22C60.70 40.77 59.53 41.32 58.17 42.07Z";

const NOSTRIL_LEFT =
  "M58.22 46.56C58.56 46.13 58.71 45.95 59.20 45.72C59.74 45.48 60.11 45.38 60.79 45.41C61.48 45.43 61.82 45.53 62.49 45.84C63.21 46.17 63.63 46.46 64.24 46.99C64.82 47.48 65.01 47.71 65.43 48.34C65.87 49.03 66.10 49.55 66.38 50.25C66.60 50.81 66.68 51.05 66.72 51.66C66.77 52.43 66.64 53.32 66.61 53.90C64.58 53.07 60.72 51.76 58.83 50.71C58.02 50.26 57.85 49.50 57.59 48.89C57.41 48.47 57.47 48.24 57.59 47.80C57.72 47.31 57.89 46.99 58.22 46.56Z";

const NOSTRIL_RIGHT =
  "M82.13 47.77C82.41 48.45 82.43 49.12 82.28 49.79C82.14 50.37 81.84 50.53 81.41 50.94C80.98 51.35 80.78 51.51 80.23 51.74C79.27 52.16 78.30 52.56 76.83 52.90C74.74 53.38 71.97 53.75 70.26 54.05C70.23 53.51 70.02 52.78 70.15 51.97C70.27 51.18 70.44 50.88 70.87 50.19C71.34 49.43 71.66 49.01 72.40 48.34C73.13 47.68 73.47 47.47 74.36 47.02C75.26 46.57 75.71 46.40 76.69 46.18C77.64 45.97 78.10 45.90 78.99 45.98C79.85 46.06 80.29 46.18 80.95 46.56C81.57 46.91 81.86 47.11 82.13 47.77Z";

const NOSTRILS = NOSTRIL_LEFT + NOSTRIL_RIGHT;
const MUZZLE = MUZZLE_OUTER + NOSTRILS;
/** Eyes + joint cone + muzzle with carved nostrils (fill-rule / clip-rule = evenodd) */
const MARK_BODY = EYE_LEFT + EYE_RIGHT + CONE + MUZZLE;
/** Full mark including cherry tip */
const MARK_ALL = MARK_BODY + CHERRY;
/** Outer silhouettes without nostril holes — used for thick patch/sticker backing strokes */
const MARK_OUTER_SHELL = EYE_LEFT + EYE_RIGHT + CONE + MUZZLE_OUTER + CHERRY;

export type ApeMaterial =
  | "camo"
  | "camo-coin"
  | "chrome"
  | "stitch"
  | "neon"
  | "papercut"
  | "marble"
  | "riso"
  | "split"
  | "gold"
  | "tiger"
  | "damascus"
  | "porcelain"
  | "carbon"
  | "vinyl"
  | "holo"
  | "stamp"
  | "thermal";

const MATERIALS: readonly ApeMaterial[] = [
  "camo",
  "camo-coin",
  "chrome",
  "stitch",
  "neon",
  "papercut",
  "marble",
  "riso",
  "split",
  "gold",
  "tiger",
  "damascus",
  "porcelain",
  "carbon",
  "vinyl",
  "holo",
  "stamp",
  "thermal",
];

const LUXE_MATERIALS: readonly ApeMaterial[] = [
  "gold",
  "chrome",
  "holo",
  "marble",
  "porcelain",
  "damascus",
  "carbon",
];

const CAMO_MATERIALS: readonly ApeMaterial[] = [
  "camo",
  "camo-coin",
  "tiger",
  "stitch",
  "split",
  "stamp",
];

interface Colorway {
  id: string;
  darkBg: boolean;
  bg: string;
  bgDeep: string;
  fg: string;
  fgHi: string;
  fgShade: string;
  c1: string;
  c2: string;
  c3: string;
  c4: string;
  ember: string;
  emberHi: string;
  ink: string;
  rim: string;
}

const COLORWAYS: readonly Colorway[] = [
  {
    id: "tokyo-ink",
    darkBg: true,
    bg: "#1b202b",
    bgDeep: "#0e1118",
    fg: "#f7f4eb",
    fgHi: "#ffffff",
    fgShade: "#cfd5df",
    c1: "#3a4559",
    c2: "#70829e",
    c3: "#b8c5d9",
    c4: "#1e2533",
    ember: "#ff4d2a",
    emberHi: "#ffbe6b",
    ink: "#0c0f16",
    rim: "#d8dfe8",
  },
  {
    id: "woodland-street",
    darkBg: true,
    bg: "#26201b",
    bgDeep: "#14100d",
    fg: "#f4ead5",
    fgHi: "#fff9ec",
    fgShade: "#ccb997",
    c1: "#8c9c5a",
    c2: "#546938",
    c3: "#c9b382",
    c4: "#2f3822",
    ember: "#ff5722",
    emberHi: "#ffd166",
    ink: "#1a1410",
    rim: "#cbb692",
  },
  {
    id: "raw-denim",
    darkBg: true,
    bg: "#1e3252",
    bgDeep: "#101c30",
    fg: "#f5efe2",
    fgHi: "#ffffff",
    fgShade: "#d4c7b0",
    c1: "#2f5387",
    c2: "#5d87bf",
    c3: "#e0cbb0",
    c4: "#162947",
    ember: "#e85d2a",
    emberHi: "#ffba66",
    ink: "#0d1729",
    rim: "#e3c598",
  },
  {
    id: "riso-berry",
    darkBg: false,
    bg: "#f5efe6",
    bgDeep: "#e4dacb",
    fg: "#f72585",
    fgHi: "#ff7ab8",
    fgShade: "#b51763",
    c1: "#f72585",
    c2: "#00b4d8",
    c3: "#480ca8",
    c4: "#ffd166",
    ember: "#ff3b1f",
    emberHi: "#ffe07d",
    ink: "#1e162b",
    rim: "#2b213a",
  },
  {
    id: "kdeenoff-mascot",
    darkBg: true,
    bg: "#271352",
    bgDeep: "#14082e",
    fg: "#c7f928",
    fgHi: "#ecff94",
    fgShade: "#8ec20e",
    c1: "#7b2cbf",
    c2: "#c7f928",
    c3: "#5a189a",
    c4: "#f3effb",
    ember: "#ff4e26",
    emberHi: "#ffd670",
    ink: "#120629",
    rim: "#c7f928",
  },
  {
    id: "sakura-noir",
    darkBg: true,
    bg: "#241921",
    bgDeep: "#130c11",
    fg: "#ffb7ce",
    fgHi: "#ffe8f0",
    fgShade: "#e07a9b",
    c1: "#ff8fab",
    c2: "#fb6f92",
    c3: "#ffe5ec",
    c4: "#59253a",
    ember: "#ff477e",
    emberHi: "#fff0f5",
    ink: "#140a10",
    rim: "#ffb7ce",
  },
  {
    id: "arctic-camo",
    darkBg: true,
    bg: "#162433",
    bgDeep: "#0b141e",
    fg: "#eaf6ff",
    fgHi: "#ffffff",
    fgShade: "#9ec9eb",
    c1: "#569cd6",
    c2: "#9cdcfe",
    c3: "#2b5278",
    c4: "#e6f4ff",
    ember: "#ff6b35",
    emberHi: "#ffe28a",
    ink: "#0b1521",
    rim: "#9cdcfe",
  },
  {
    id: "cobalt-kiln",
    darkBg: false,
    bg: "#fbf7ef",
    bgDeep: "#ebe2d1",
    fg: "#1d4ed8",
    fgHi: "#60a5fa",
    fgShade: "#1e3a8a",
    c1: "#1d4ed8",
    c2: "#93c5fd",
    c3: "#dbeafe",
    c4: "#172554",
    ember: "#ea580c",
    emberHi: "#fed7aa",
    ink: "#172554",
    rim: "#1e40af",
  },
  {
    id: "tangerine-pop",
    darkBg: true,
    bg: "#291811",
    bgDeep: "#160b07",
    fg: "#ff8524",
    fgHi: "#ffc885",
    fgShade: "#cc5200",
    c1: "#ff7b00",
    c2: "#ffb703",
    c3: "#fb5607",
    c4: "#5c2608",
    ember: "#ff2a2a",
    emberHi: "#fff394",
    ink: "#1a0c06",
    rim: "#ff9f43",
  },
  {
    id: "crimson-seal",
    darkBg: false,
    bg: "#f7f1e5",
    bgDeep: "#e6dbc8",
    fg: "#c81e2b",
    fgHi: "#f25c66",
    fgShade: "#8a111b",
    c1: "#c81e2b",
    c2: "#f08080",
    c3: "#2b1d1d",
    c4: "#f7d6d0",
    ember: "#ff5500",
    emberHi: "#ffd27d",
    ink: "#261113",
    rim: "#a61924",
  },
  {
    id: "purple-camo",
    darkBg: true,
    bg: "#1f1530",
    bgDeep: "#100a1c",
    fg: "#eadcfb",
    fgHi: "#ffffff",
    fgShade: "#b998e8",
    c1: "#8b5cf6",
    c2: "#c084fc",
    c3: "#4c1d95",
    c4: "#e9d5ff",
    ember: "#ff5938",
    emberHi: "#ffd07b",
    ink: "#120921",
    rim: "#c084fc",
  },
  {
    id: "desert-sand",
    darkBg: false,
    bg: "#efe4cf",
    bgDeep: "#dcc9a9",
    fg: "#4a2f1d",
    fgHi: "#7d5538",
    fgShade: "#2e1b0f",
    c1: "#b08968",
    c2: "#7f5539",
    c3: "#ddb892",
    c4: "#432818",
    ember: "#e63946",
    emberHi: "#ffb703",
    ink: "#2b180c",
    rim: "#6f4528",
  },
  {
    id: "carrara-gold",
    darkBg: true,
    bg: "#261618",
    bgDeep: "#14090b",
    fg: "#f6f2eb",
    fgHi: "#ffffff",
    fgShade: "#d4c8b8",
    c1: "#e8e0d3",
    c2: "#d4a853",
    c3: "#8f8578",
    c4: "#2d2420",
    ember: "#ff4929",
    emberHi: "#ffe082",
    ink: "#1c0d0e",
    rim: "#e0b35a",
  },
  {
    id: "pink-bape-camo",
    darkBg: true,
    bg: "#2b1620",
    bgDeep: "#170a11",
    fg: "#ffeef3",
    fgHi: "#ffffff",
    fgShade: "#f5b8cb",
    c1: "#f26a8d",
    c2: "#cb2d6f",
    c3: "#f49cbb",
    c4: "#591532",
    ember: "#ff6d00",
    emberHi: "#ffe57f",
    ink: "#1a0911",
    rim: "#f49cbb",
  },
  {
    id: "liquid-cobalt",
    darkBg: true,
    bg: "#0f172a",
    bgDeep: "#060b16",
    fg: "#e2e8f0",
    fgHi: "#ffffff",
    fgShade: "#94a3b8",
    c1: "#38bdf8",
    c2: "#818cf8",
    c3: "#e2e8f0",
    c4: "#1e293b",
    ember: "#00f5d4",
    emberHi: "#ffffff",
    ink: "#050914",
    rim: "#60a5fa",
  },
  {
    id: "espresso-cream",
    darkBg: true,
    bg: "#331e16",
    bgDeep: "#1c0f0a",
    fg: "#fbf0dc",
    fgHi: "#fffdf7",
    fgShade: "#dec39b",
    c1: "#c69453",
    c2: "#8c5828",
    c3: "#f2dab4",
    c4: "#422415",
    ember: "#ff5426",
    emberHi: "#ffd479",
    ink: "#1d0e08",
    rim: "#e0b472",
  },
  {
    id: "cyber-acid",
    darkBg: true,
    bg: "#12131a",
    bgDeep: "#08090d",
    fg: "#00f5d4",
    fgHi: "#b8fff1",
    fgShade: "#00a896",
    c1: "#00f5d4",
    c2: "#f15bb5",
    c3: "#9b5de5",
    c4: "#1e2230",
    ember: "#f15bb5",
    emberHi: "#ffd6f0",
    ink: "#07080c",
    rim: "#00f5d4",
  },
  {
    id: "silver-chrome",
    darkBg: true,
    bg: "#171821",
    bgDeep: "#090a10",
    fg: "#edf2f7",
    fgHi: "#ffffff",
    fgShade: "#a0aec0",
    c1: "#cbd5e1",
    c2: "#60a5fa",
    c3: "#f472b6",
    c4: "#1e293b",
    ember: "#ff3d71",
    emberHi: "#ffc7d8",
    ink: "#090b12",
    rim: "#cbd5e1",
  },
  {
    id: "halftone-orange",
    darkBg: false,
    bg: "#f7f4ed",
    bgDeep: "#e6dfd1",
    fg: "#22252a",
    fgHi: "#495057",
    fgShade: "#111317",
    c1: "#ff5c00",
    c2: "#22252a",
    c3: "#ffb703",
    c4: "#d8d2c5",
    ember: "#ff5400",
    emberHi: "#ffd166",
    ink: "#16181d",
    rim: "#22252a",
  },
  {
    id: "neon-miami",
    darkBg: true,
    bg: "#160d24",
    bgDeep: "#0a0512",
    fg: "#ff2e93",
    fgHi: "#ffb8dc",
    fgShade: "#b81463",
    c1: "#ff2e93",
    c2: "#00e5ff",
    c3: "#7c4dff",
    c4: "#24133b",
    ember: "#00e5ff",
    emberHi: "#e0ffff",
    ink: "#090412",
    rim: "#ff2e93",
  },
  {
    id: "olympus-crimson",
    darkBg: true,
    bg: "#4a1719",
    bgDeep: "#26090b",
    fg: "#f7deb0",
    fgHi: "#fff7e0",
    fgShade: "#cf9e57",
    c1: "#ffd230",
    c2: "#b8292f",
    c3: "#f7deb0",
    c4: "#381012",
    ember: "#ff6d1f",
    emberHi: "#fff099",
    ink: "#240908",
    rim: "#f0be59",
  },
  {
    id: "jade-stone",
    darkBg: true,
    bg: "#162929",
    bgDeep: "#0b1616",
    fg: "#b8f2e6",
    fgHi: "#ecfffb",
    fgShade: "#5ec4b3",
    c1: "#2ec4b6",
    c2: "#cbf3f0",
    c3: "#1b7a72",
    c4: "#0f3835",
    ember: "#ff6b4a",
    emberHi: "#ffd6a5",
    ink: "#091717",
    rim: "#72efdd",
  },
  {
    id: "blue-street-camo",
    darkBg: true,
    bg: "#132038",
    bgDeep: "#091121",
    fg: "#f0f6ff",
    fgHi: "#ffffff",
    fgShade: "#acc8eb",
    c1: "#2b7de9",
    c2: "#6bb5ff",
    c3: "#1b4379",
    c4: "#d9ecff",
    ember: "#ff5526",
    emberHi: "#ffd06b",
    ink: "#0a1324",
    rim: "#6bb5ff",
  },
  {
    id: "papercut-bauhaus",
    darkBg: false,
    bg: "#f6f0e4",
    bgDeep: "#e6dcc8",
    fg: "#f4ebd9",
    fgHi: "#ffffff",
    fgShade: "#d9ccb4",
    c1: "#1d569e",
    c2: "#f26b4e",
    c3: "#1e2024",
    c4: "#f4ebd9",
    ember: "#f25c3d",
    emberHi: "#ffb499",
    ink: "#181a1f",
    rim: "#1d569e",
  },
  {
    id: "stealth-titanium",
    darkBg: true,
    bg: "#1e2026",
    bgDeep: "#101116",
    fg: "#d6dae3",
    fgHi: "#f8fafc",
    fgShade: "#8c95a6",
    c1: "#475569",
    c2: "#94a3b8",
    c3: "#cbd5e1",
    c4: "#1e293b",
    ember: "#ff3b1d",
    emberHi: "#ffae52",
    ink: "#0c0d12",
    rim: "#94a3b8",
  },
  {
    id: "grape-soda",
    darkBg: true,
    bg: "#261233",
    bgDeep: "#13071c",
    fg: "#c77dff",
    fgHi: "#f0d6ff",
    fgShade: "#7b2cbf",
    c1: "#9d4edd",
    c2: "#e0aaff",
    c3: "#ff9e00",
    c4: "#3c096c",
    ember: "#ff9e00",
    emberHi: "#fff1a8",
    ink: "#12061c",
    rim: "#e0aaff",
  },
  {
    id: "matcha-latte",
    darkBg: false,
    bg: "#f2efe4",
    bgDeep: "#dfd9c5",
    fg: "#4f6d3a",
    fgHi: "#84a868",
    fgShade: "#314722",
    c1: "#6a8e4e",
    c2: "#a3b88c",
    c3: "#3b5228",
    c4: "#e5dec9",
    ember: "#e76f51",
    emberHi: "#f4a261",
    ink: "#26361a",
    rim: "#4f6d3a",
  },
  {
    id: "desert-camo-coin",
    darkBg: true,
    bg: "#3b2c20",
    bgDeep: "#211710",
    fg: "#fff8eb",
    fgHi: "#ffffff",
    fgShade: "#e3d1b4",
    c1: "#d4a373",
    c2: "#8c5e3c",
    c3: "#e9edc9",
    c4: "#4a3525",
    ember: "#ff4d1c",
    emberHi: "#ffd166",
    ink: "#1f150e",
    rim: "#e6ccb2",
  },
  {
    id: "royal-bullion",
    darkBg: true,
    bg: "#361419",
    bgDeep: "#1c080b",
    fg: "#ffd23f",
    fgHi: "#fff7ad",
    fgShade: "#c9820c",
    c1: "#ffd23f",
    c2: "#f09819",
    c3: "#9e1b32",
    c4: "#290d12",
    ember: "#ff2e4c",
    emberHi: "#ffb3c1",
    ink: "#240b0e",
    rim: "#ffd23f",
  },
  {
    id: "urban-volt",
    darkBg: true,
    bg: "#1f2421",
    bgDeep: "#101412",
    fg: "#f8f9fa",
    fgHi: "#ffffff",
    fgShade: "#ced4da",
    c1: "#d9ed32",
    c2: "#52616b",
    c3: "#9ba6ad",
    c4: "#252b2e",
    ember: "#ff5400",
    emberHi: "#ffea70",
    ink: "#0f1214",
    rim: "#d9ed32",
  },
  {
    id: "rose-bullion",
    darkBg: true,
    bg: "#2b1921",
    bgDeep: "#170b11",
    fg: "#f6bd9e",
    fgHi: "#ffece0",
    fgShade: "#b86b52",
    c1: "#f6bd9e",
    c2: "#d9826c",
    c3: "#733646",
    c4: "#381c26",
    ember: "#ff4769",
    emberHi: "#ffd6de",
    ink: "#1c0c13",
    rim: "#f6bd9e",
  },
  {
    id: "coral-reef",
    darkBg: true,
    bg: "#132a3e",
    bgDeep: "#091622",
    fg: "#ff7557",
    fgHi: "#ffc2b3",
    fgShade: "#c94329",
    c1: "#ff7557",
    c2: "#2ec4b6",
    c3: "#ffbf69",
    c4: "#1b405e",
    ember: "#ffd166",
    emberHi: "#ffffff",
    ink: "#091724",
    rim: "#ff8c73",
  },
];

function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function createRng(seedStr: string): () => number {
  let state = (hashSeed(seedStr) || 0x9e3779b9) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

function hexLuma(hex: string): number {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return 0.5;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function normalizeAvatarSeed(raw: unknown): string {
  const cleaned = String(raw ?? "")
    .replace(/\.svg$/i, "")
    .trim()
    .toLowerCase()
    .slice(0, 80);
  return cleaned || "player";
}

export function buildLeaderboardAvatarUrl(seed: unknown, style?: unknown): string {
  const mode = String(style || "kdeenoff").trim().toLowerCase();
  if (mode === "none") return "";
  const cleanSeed = normalizeAvatarSeed(seed);
  const luxe = mode === "kdeenoff-luxe" || mode === "olympus-gold";
  const camo = mode === "kdeenoff-camo";
  const query = luxe
    ? "?v=ape3&preset=luxe"
    : camo
      ? "?v=ape3&preset=camo"
      : "?v=ape3";
  return `/api/leaderboards/avatar/${encodeURIComponent(cleanSeed)}.svg${query}`;
}

export function buildNeutralAvatarUrl(style?: unknown): string {
  const mode = String(style || "kdeenoff").trim().toLowerCase();
  if (mode === "none") return "";
  return "/api/leaderboards/avatar/neutral.svg?v=zeus1&preset=neutral";
}

export function normalizeKickHandle(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

/**
 * Returns normalized lowercase Kick handles that belong to accounts
 * authorized/registered on this site (`site_people` linked to `kick_accounts`).
 */
export function loadAuthorizedKickNames(
  db: DatabaseService,
  candidates?: readonly string[],
): Set<string> {
  if (candidates !== undefined) {
    const unique = Array.from(
      new Set(candidates.map(normalizeKickHandle).filter((n) => n.length > 0 && n.length <= 80)),
    ).slice(0, 200);
    if (unique.length === 0) return new Set();
    const placeholders = unique.map(() => "?").join(", ");
    const rows = db.all<{ uname: string }>(
      `SELECT LOWER(TRIM(ka.name)) AS uname
       FROM site_people sp
       JOIN kick_accounts ka ON ka.kick_user_id = sp.kick_user_id
       WHERE sp.kick_user_id IS NOT NULL
         AND TRIM(ka.name) != ''
         AND LOWER(TRIM(ka.name)) IN (${placeholders})`,
      ...unique,
    );
    return new Set(rows.map((r) => String(r.uname || "").trim().toLowerCase()).filter(Boolean));
  }

  const rows = db.all<{ uname: string }>(
    `SELECT LOWER(TRIM(ka.name)) AS uname
     FROM site_people sp
     JOIN kick_accounts ka ON ka.kick_user_id = sp.kick_user_id
     WHERE sp.kick_user_id IS NOT NULL AND TRIM(ka.name) != ''`,
  );
  return new Set(rows.map((r) => String(r.uname || "").trim().toLowerCase()).filter(Boolean));
}

/**
 * Seamless 64x64 organic street-camo pattern (edge-wrapped blobs so any angle tiles cleanly).
 */
function buildCamoPattern(
  id: string,
  cBase: string,
  cA: string,
  cB: string,
  cC: string,
  angle: number,
  ox: number,
  oy: number,
): string {
  const blob1 =
    "M14,10 C23,4 36,9 34,19 C32,27 42,31 37,40 C31,48 16,44 12,35 C8,26 5,16 14,10 Z";
  const blob2 =
    "M46,8 C55,5 62,15 58,24 C54,32 43,30 40,22 C37,15 39,10 46,8 Z";
  const blob3 =
    "M42,42 C52,36 63,44 59,55 C55,64 38,63 34,54 C31,47 35,46 42,42 Z";
  const blob4 =
    "M6,46 C15,41 26,48 24,57 C22,65 8,66 3,58 C-1,52 0,49 6,46 Z";

  // Wrap edge-crossing shapes so 64x64 tiling is 100% seamless
  return (
    `<pattern id="${id}" width="64" height="64" patternUnits="userSpaceOnUse" patternTransform="translate(${ox} ${oy}) rotate(${angle})">` +
      `<rect width="64" height="64" fill="${cBase}"/>` +
      `<path d="${blob1}" fill="${cA}"/>` +
      `<path d="${blob2}" fill="${cB}"/>` +
      `<path d="${blob3}" fill="${cC}"/>` +
      `<path d="${blob4}" fill="${cB}"/>` +
      `<path d="${blob4}" transform="translate(64 0)" fill="${cB}"/>` +
      `<path d="${blob4}" transform="translate(0 -64)" fill="${cB}"/>` +
      `<path d="${blob3}" transform="translate(0 -64)" fill="${cC}"/>` +
    `</pattern>`
  );
}

function renderLitCherry(uid: string, cw: Colorway, strokeWidth = 2.2): string {
  return (
    `<path d="${CHERRY}" fill="url(#em-${uid})" stroke="${cw.ink}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>` +
    `<circle cx="22.8" cy="53.2" r="2.1" fill="${cw.emberHi}" opacity="0.9"/>`
  );
}

export interface GeneratedAvatarOptions {
  preset?: "default" | "gold" | "luxe" | "camo" | "neutral";
}

export function renderNeutralAvatarSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" role="img" aria-label="">` +
    `<circle cx="64" cy="64" r="61.5" fill="#6b2e2b" stroke="#2c1208" stroke-width="4.5"/>` +
    `<circle cx="64" cy="64" r="50" fill="#461b1d" stroke="#b98252" stroke-width="2.8"/>` +
    `<path d="M40,54 C40,34 88,34 88,54 L91,84 L75,94 L70,69 L58,69 L53,94 L37,84 Z" fill="#f0c781" stroke="#2c1208" stroke-width="4" stroke-linejoin="round"/>` +
    `<path d="M48,55 H80 L75,64 H53 Z" fill="#2a0d0e"/>` +
    `</svg>`
  );
}

export function renderLeaderboardAvatarSvg(
  rawSeed: unknown,
  options: GeneratedAvatarOptions = {},
): string {
  if (options.preset === "neutral") {
    return renderNeutralAvatarSvg();
  }
  const seed = normalizeAvatarSeed(rawSeed);
  const isLuxe = options.preset === "gold" || options.preset === "luxe";
  const isCamo = options.preset === "camo";
  const rng = createRng(`kdeenoff-ape-9076:${seed}`);
  const modeTag = isLuxe ? "lx" : isCamo ? "cm" : "st";
  const uid = (hashSeed(`${modeTag}:${seed}`) & 0xffff)
    .toString(16)
    .padStart(4, "0");

  const rawMaterial = pick(rng, MATERIALS);
  const rawColorway = pick(rng, COLORWAYS);

  const darkColorways = COLORWAYS.filter((c) => c.darkBg);
  const material: ApeMaterial = isLuxe
    ? LUXE_MATERIALS[hashSeed(`lxm-98:${seed}`) % LUXE_MATERIALS.length]
    : isCamo
      ? CAMO_MATERIALS[hashSeed(`cmm:${seed}`) % CAMO_MATERIALS.length]
      : rawMaterial;
  const cw: Colorway = isLuxe
    ? darkColorways[hashSeed(`lxc-98:${seed}`) % darkColorways.length]
    : rawColorway;

  const angle = Math.round((rng() * 140 - 70) * 10) / 10;
  const ox = Math.round(rng() * 48);
  const oy = Math.round(rng() * 48);
  const rimMode = Math.floor(rng() * 4);

  let extraDefs = "";
  let groundMarkup = "";
  let markMarkup = "";

  // Shared radial background & lit-ember gradients
  const baseDefs =
    `<clipPath id="coin-${uid}"><circle cx="64" cy="64" r="62"/></clipPath>` +
    `<clipPath id="mk-${uid}"><path clip-rule="evenodd" d="${MARK_BODY}"/></clipPath>` +
    `<clipPath id="ma-${uid}"><path clip-rule="evenodd" d="${MARK_ALL}"/></clipPath>` +
    `<radialGradient id="bg-${uid}" cx="38%" cy="30%" r="75%">` +
      `<stop offset="0%" stop-color="${cw.bg}"/>` +
      `<stop offset="100%" stop-color="${cw.bgDeep}"/>` +
    `</radialGradient>` +
    `<radialGradient id="em-${uid}" cx="36%" cy="34%" r="68%">` +
      `<stop offset="0%" stop-color="${cw.emberHi}"/>` +
      `<stop offset="55%" stop-color="${cw.ember}"/>` +
      `<stop offset="100%" stop-color="${cw.ink}"/>` +
    `</radialGradient>`;

  switch (material) {
    case "camo": {
      // Organic street-camo clipped inside the KDeenOff monkey silhouette + die-cut sticker border
      extraDefs = buildCamoPattern(
        `cm-${uid}`,
        cw.c4,
        cw.c1,
        cw.c2,
        cw.c3,
        angle,
        ox,
        oy,
      );
      const stickerOutline = cw.darkBg ? cw.fgHi : cw.ink;
      groundMarkup =
        `<circle cx="64" cy="64" r="63" fill="url(#bg-${uid})"/>` +
        `<circle cx="64" cy="64" r="48" fill="${cw.c1}" opacity="0.10"/>`;
      markMarkup =
        `<path d="${MARK_OUTER_SHELL}" fill="none" stroke="${stickerOutline}" stroke-width="5.2" stroke-linejoin="round"/>` +
        `<g clip-path="url(#mk-${uid})">` +
          `<rect x="12" y="26" width="104" height="76" fill="url(#cm-${uid})"/>` +
          `<path d="M34,32 H110 V49 H34 Z" fill="#ffffff" opacity="0.10"/>` +
        `</g>` +
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="none" stroke="${cw.ink}" stroke-width="2.1" stroke-linejoin="round"/>` +
        renderLitCherry(uid, cw, 2.3);
      break;
    }

    case "camo-coin": {
      // Full-bleed street camo textile coin ground + high-contrast die-cut monkey patch
      extraDefs = buildCamoPattern(
        `cm-${uid}`,
        cw.c4,
        cw.c1,
        cw.c2,
        cw.c3,
        angle,
        ox,
        oy,
      );
      const monkeyFill = hexLuma(cw.fg) > 0.72 ? cw.fg : "#fffdf7";
      groundMarkup =
        `<rect x="0" y="0" width="128" height="128" fill="url(#cm-${uid})"/>` +
        `<circle cx="64" cy="64" r="63" fill="none" stroke="${cw.ink}" stroke-width="14" opacity="0.30"/>`;
      markMarkup =
        `<path d="${MARK_OUTER_SHELL}" fill="${cw.ink}" stroke="${cw.ink}" stroke-width="6.8" stroke-linejoin="round"/>` +
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="${monkeyFill}" stroke="${cw.ink}" stroke-width="2" stroke-linejoin="round"/>` +
        renderLitCherry(uid, cw, 2.4);
      break;
    }

    case "chrome": {
      // Y2K Liquid Mirror Chrome (sky-to-horizon metallic reflection across the monkey mark)
      const chromeSky = hexLuma(cw.c1) > 0.35 ? cw.c1 : "#60a5fa";
      const chromeGround = hexLuma(cw.c2) > 0.35 ? cw.c2 : "#f472b6";
      extraDefs =
        `<linearGradient id="ch-${uid}" x1="0" y1="0" x2="0.15" y2="1">` +
          `<stop offset="0%" stop-color="#ffffff"/>` +
          `<stop offset="28%" stop-color="${chromeSky}"/>` +
          `<stop offset="49%" stop-color="#f8fafc"/>` +
          `<stop offset="53%" stop-color="#0f172a"/>` +
          `<stop offset="74%" stop-color="${chromeGround}"/>` +
          `<stop offset="100%" stop-color="#ffffff"/>` +
        `</linearGradient>`;
      groundMarkup =
        `<circle cx="64" cy="64" r="63" fill="#0b0e17"/>` +
        `<circle cx="68" cy="64" r="46" fill="${chromeSky}" opacity="0.18"/>`;
      markMarkup =
        `<path d="${MARK_OUTER_SHELL}" fill="none" stroke="${chromeSky}" stroke-width="4.4" stroke-linejoin="round" opacity="0.58"/>` +
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="url(#ch-${uid})" stroke="#090d16" stroke-width="2.1" stroke-linejoin="round"/>` +
        `<g clip-path="url(#mk-${uid})">` +
          `<path d="M35,34 Q72,30 108,38" fill="none" stroke="#ffffff" stroke-width="3.2" opacity="0.75"/>` +
        `</g>` +
        `<path d="${CHERRY}" fill="url(#ch-${uid})" stroke="${cw.ember}" stroke-width="2.4"/>` +
        `<path d="M23.5,48.5 L24.6,52.6 L28.7,53.7 L24.6,54.8 L23.5,58.9 L22.4,54.8 L18.3,53.7 L22.4,52.6 Z" fill="#ffffff" opacity="0.9"/>`;
      break;
    }

    case "stitch": {
      // Varsity Chenille / Sashiko Embroidery Patch on woven diagonal twill/denim
      const twillBg = cw.darkBg ? cw.bg : "#1b2838";
      const twillRib = cw.darkBg ? cw.bgDeep : "#101926";
      const patchFelt = hexLuma(cw.c1) > 0.3 ? cw.c1 : cw.rim;
      const threadFill = hexLuma(cw.fg) > 0.65 ? cw.fg : "#f6efe2";
      extraDefs =
        `<pattern id="tw-${uid}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
          `<rect width="8" height="8" fill="${twillBg}"/>` +
          `<line x1="0" y1="0" x2="0" y2="8" stroke="${twillRib}" stroke-width="3.5"/>` +
        `</pattern>` +
        `<pattern id="th-${uid}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-22)">` +
          `<rect width="5" height="5" fill="${threadFill}"/>` +
          `<line x1="0" y1="0" x2="5" y2="0" stroke="${cw.fgShade}" stroke-width="1.3" opacity="0.55"/>` +
        `</pattern>`;
      groundMarkup =
        `<rect x="0" y="0" width="128" height="128" fill="url(#tw-${uid})"/>` +
        `<circle cx="64" cy="64" r="55.5" fill="none" stroke="${threadFill}" stroke-width="1.8" stroke-dasharray="4.5 3.5" opacity="0.65"/>`;
      markMarkup =
        `<path d="${MARK_OUTER_SHELL}" fill="${twillRib}" stroke="${cw.ink}" stroke-width="8.2" stroke-linejoin="round" opacity="0.65"/>` +
        `<path d="${MARK_OUTER_SHELL}" fill="none" stroke="${patchFelt}" stroke-width="5.8" stroke-linejoin="round"/>` +
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="url(#th-${uid})" stroke="${cw.ink}" stroke-width="1.7" stroke-linejoin="round"/>` +
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="none" stroke="#ffffff" stroke-width="1.1" stroke-dasharray="2.6 2.1" opacity="0.85"/>` +
        `<path d="${CHERRY}" fill="${cw.ember}" stroke="${cw.ink}" stroke-width="1.9"/>` +
        `<circle cx="24.2" cy="54.8" r="3.4" fill="none" stroke="${cw.emberHi}" stroke-width="1.1" stroke-dasharray="2 1.6"/>`;
      break;
    }

    case "neon": {
      // Glowing Arcade Glass Neon Tube Sign on dark night grid (guaranteed bright tube luminance)
      const candidates = [cw.c1, cw.c2, cw.fg, cw.rim, cw.emberHi];
      const neonMain = candidates.find((c) => hexLuma(c) >= 0.44) || "#00f5d4";
      const neonCherry = hexLuma(cw.ember) >= 0.3 ? cw.ember : "#ff4d2a";
      extraDefs =
        `<pattern id="ng-${uid}" width="12" height="12" patternUnits="userSpaceOnUse">` +
          `<rect width="12" height="12" fill="#0b0914"/>` +
          `<path d="M12,0 H0 V12" fill="none" stroke="#1b1630" stroke-width="1"/>` +
        `</pattern>`;
      groundMarkup =
        `<rect x="0" y="0" width="128" height="128" fill="url(#ng-${uid})"/>` +
        `<circle cx="66" cy="64" r="48" fill="${neonMain}" opacity="0.17"/>` +
        `<circle cx="24" cy="55" r="16" fill="${neonCherry}" opacity="0.28"/>`;
      markMarkup =
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="${neonMain}" fill-opacity="0.16" stroke="${neonMain}" stroke-width="6.2" stroke-linejoin="round" opacity="0.34"/>` +
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="none" stroke="${neonMain}" stroke-width="3.2" stroke-linejoin="round"/>` +
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linejoin="round" opacity="0.94"/>` +
        `<path d="${CHERRY}" fill="${neonCherry}" fill-opacity="0.30" stroke="${neonCherry}" stroke-width="5.6" opacity="0.40"/>` +
        `<path d="${CHERRY}" fill="none" stroke="${neonCherry}" stroke-width="3.1"/>` +
        `<path d="${CHERRY}" fill="none" stroke="#ffffff" stroke-width="1.25"/>`;
      break;
    }

    case "papercut": {
      // Multi-Layer Cut Cardstock Shadowbox (inspired by c10-papercut)
      const topCard =
        Math.abs(hexLuma(cw.fg) - hexLuma(cw.bg)) < 0.25
          ? cw.darkBg
            ? "#fbf7ef"
            : cw.c1
          : cw.fg;
      groundMarkup = `<circle cx="64" cy="64" r="63" fill="url(#bg-${uid})"/>`;
      markMarkup =
        `<g transform="translate(3.4 4.2)">` +
          `<path d="${MARK_OUTER_SHELL}" fill="${cw.ink}" opacity="0.55"/>` +
        `</g>` +
        `<g transform="translate(-2.4 -2.2)">` +
          `<path d="${MARK_OUTER_SHELL}" fill="${cw.c2}" stroke="${cw.ink}" stroke-width="1.6" stroke-linejoin="round"/>` +
        `</g>` +
        `<g transform="translate(1.8 2.0)">` +
          `<path d="${MARK_OUTER_SHELL}" fill="${cw.c1}" stroke="${cw.ink}" stroke-width="1.6" stroke-linejoin="round"/>` +
        `</g>` +
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="${topCard}" stroke="${cw.ink}" stroke-width="1.9" stroke-linejoin="round"/>` +
        `<path d="${CHERRY}" fill="${cw.ember}" stroke="${cw.ink}" stroke-width="2"/>` +
        `<circle cx="23.2" cy="53.6" r="2.2" fill="${cw.emberHi}" opacity="0.75"/>`;
      break;
    }

    case "marble": {
      // Sculpted Carrara (on dark) or Nero Marquina Obsidian (on light) Stone with Kintsugi Veins
      const stoneBase = cw.darkBg ? "#f7f4ee" : "#181a24";
      const veinPrimary = cw.darkBg ? cw.c2 : cw.emberHi;
      const veinSecondary = cw.darkBg ? cw.c3 : cw.c2;
      groundMarkup = `<circle cx="64" cy="64" r="63" fill="url(#bg-${uid})"/>`;
      markMarkup =
        `<g transform="translate(0 3)"><path fill-rule="evenodd" d="${MARK_ALL}" fill="${cw.ink}" opacity="0.5"/></g>` +
        `<g clip-path="url(#mk-${uid})">` +
          `<rect x="14" y="28" width="100" height="72" fill="${stoneBase}"/>` +
          `<g transform="rotate(${angle} 68 64)" fill="none" stroke-linecap="round">` +
            `<path d="M18,44 Q46,52 62,40 T108,54" stroke="${veinSecondary}" stroke-width="4.2" opacity="0.32"/>` +
            `<path d="M26,74 Q58,62 78,78 T112,68" stroke="${veinSecondary}" stroke-width="3.2" opacity="0.28"/>` +
            `<path d="M20,46 L42,53 L58,43 L80,55 L106,49" stroke="${veinPrimary}" stroke-width="2.0" opacity="0.9"/>` +
            `<path d="M46,84 L66,70 L84,79 L104,67" stroke="${veinPrimary}" stroke-width="1.7" opacity="0.85"/>` +
          `</g>` +
        `</g>` +
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="none" stroke="${cw.ink}" stroke-width="2.1" stroke-linejoin="round"/>` +
        renderLitCherry(uid, cw, 2.2);
      break;
    }

    case "riso": {
      // Misregistered Risograph / Halftone Screenprint (inspired by c03-riso & c05-halftone)
      const paperBg = "#f6f0e4";
      const inkA = hexLuma(cw.c1) <= 0.62 ? cw.c1 : cw.ember;
      const inkB = hexLuma(cw.c2) <= 0.68 ? cw.c2 : cw.ink;
      extraDefs =
        `<pattern id="ht-${uid}" width="5.5" height="5.5" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">` +
          `<circle cx="2.75" cy="2.75" r="1.85" fill="${inkA}"/>` +
        `</pattern>`;
      groundMarkup =
        `<circle cx="64" cy="64" r="63" fill="${paperBg}"/>` +
        `<circle cx="64" cy="64" r="56" fill="url(#ht-${uid})" opacity="0.11"/>`;
      markMarkup =
        `<g transform="translate(3.0 2.4)" opacity="0.84">` +
          `<path fill-rule="evenodd" d="${MARK_ALL}" fill="${inkB}"/>` +
        `</g>` +
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="${inkA}" opacity="0.30"/>` +
        `<g clip-path="url(#mk-${uid})">` +
          `<rect x="14" y="28" width="100" height="72" fill="url(#ht-${uid})"/>` +
        `</g>` +
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="none" stroke="${cw.ink}" stroke-width="2.1" stroke-linejoin="round"/>` +
        `<path d="${CHERRY}" fill="${cw.ember}" stroke="${cw.ink}" stroke-width="2.2"/>`;
      break;
    }

    case "split": {
      // Half-and-Half Dual Collector Split (left camo world vs right solid contrast world)
      const tilt = (Math.floor(rng() * 3) - 1) * 14;
      const rightSolid = hexLuma(cw.fg) > 0.65 ? cw.fg : "#fbf7ef";
      extraDefs =
        `<clipPath id="sl-${uid}"><rect x="-20" y="-20" width="84" height="168" transform="rotate(${tilt} 64 64)"/></clipPath>` +
        `<clipPath id="sr-${uid}"><rect x="64" y="-20" width="84" height="168" transform="rotate(${tilt} 64 64)"/></clipPath>` +
        buildCamoPattern(`sc-${uid}`, cw.c4, cw.c1, cw.c2, cw.c3, angle, ox, oy);
      groundMarkup =
        `<g clip-path="url(#sl-${uid})"><circle cx="64" cy="64" r="63" fill="${cw.bgDeep}"/></g>` +
        `<g clip-path="url(#sr-${uid})"><circle cx="64" cy="64" r="63" fill="${cw.c1}"/></g>` +
        `<line x1="64" y1="0" x2="64" y2="128" stroke="${cw.ink}" stroke-width="2.6" transform="rotate(${tilt} 64 64)"/>`;
      markMarkup =
        `<path d="${MARK_OUTER_SHELL}" fill="${cw.ink}" stroke="${cw.ink}" stroke-width="4.8" stroke-linejoin="round"/>` +
        `<g clip-path="url(#sl-${uid})">` +
          `<g clip-path="url(#mk-${uid})"><rect x="12" y="26" width="104" height="76" fill="url(#sc-${uid})"/></g>` +
        `</g>` +
        `<g clip-path="url(#sr-${uid})">` +
          `<path fill-rule="evenodd" d="${MARK_BODY}" fill="${rightSolid}"/>` +
        `</g>` +
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="none" stroke="${cw.ink}" stroke-width="2.1" stroke-linejoin="round"/>` +
        renderLitCherry(uid, cw, 2.3);
      break;
    }

    case "gold": {
      // 24K Mint Bullion / Royal Cast Metallic Relief
      const bullionGround = cw.darkBg ? `url(#bg-${uid})` : "#1c120c";
      extraDefs =
        `<linearGradient id="au-${uid}" x1="0" y1="0" x2="0.3" y2="1">` +
          `<stop offset="0%" stop-color="#fff9bd"/>` +
          `<stop offset="35%" stop-color="#ffd43b"/>` +
          `<stop offset="72%" stop-color="#d9820b"/>` +
          `<stop offset="100%" stop-color="#8c4a03"/>` +
        `</linearGradient>`;
      const rays: string[] = [];
      for (let i = 0; i < 12; i++) {
        rays.push(
          `<polygon points="64,64 56,4 72,4" fill="#ffd43b" opacity="0.11" transform="rotate(${i * 30} 64 64)"/>`,
        );
      }
      groundMarkup =
        `<circle cx="64" cy="64" r="63" fill="${bullionGround}"/>` +
        rays.join("");
      markMarkup =
        `<g transform="translate(0 3.2)"><path d="${MARK_OUTER_SHELL}" fill="#170804" opacity="0.65"/></g>` +
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="url(#au-${uid})" stroke="#3b1b06" stroke-width="2.3" stroke-linejoin="round"/>` +
        `<g clip-path="url(#mk-${uid})" transform="rotate(-28 68 64)">` +
          `<rect x="18" y="42" width="100" height="8" fill="#ffffff" opacity="0.42"/>` +
          `<rect x="18" y="55" width="100" height="3.5" fill="#ffffff" opacity="0.28"/>` +
        `</g>` +
        renderLitCherry(uid, cw, 2.3);
      break;
    }

    case "tiger": {
      // Bold Streetwear Tiger / Zebra Slashes Clipped Inside Logo
      const tigerCoat = hexLuma(cw.c1) >= 0.44 ? cw.c1 : cw.fgHi;
      extraDefs =
        `<pattern id="tg-${uid}" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})">` +
          `<rect width="22" height="22" fill="${tigerCoat}"/>` +
          `<path d="M0,3 Q6,0 11,4 T22,3 L22,12 Q15,15 10,11 T0,12 Z" fill="${cw.ink}"/>` +
        `</pattern>`;
      const halo = cw.darkBg ? cw.fgHi : cw.ink;
      groundMarkup = `<circle cx="64" cy="64" r="63" fill="url(#bg-${uid})"/>`;
      markMarkup =
        `<path d="${MARK_OUTER_SHELL}" fill="none" stroke="${halo}" stroke-width="5" stroke-linejoin="round"/>` +
        `<g clip-path="url(#mk-${uid})">` +
          `<rect x="12" y="26" width="104" height="76" fill="url(#tg-${uid})"/>` +
        `</g>` +
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="none" stroke="${cw.ink}" stroke-width="2" stroke-linejoin="round"/>` +
        renderLitCherry(uid, cw, 2.3);
      break;
    }

    case "damascus": {
      // Damascus Steel / Topographical Contour Rings Inside Logo
      const steelDark = hexLuma(cw.c4) < 0.32 ? cw.c4 : cw.ink;
      const steelBand = hexLuma(cw.c1) > 0.46 ? cw.c1 : cw.fgHi;
      const rings: string[] = [];
      for (let r = 8; r <= 68; r += 6) {
        rings.push(
          `<ellipse cx="${56 + (ox % 18)}" cy="${52 + (oy % 18)}" rx="${r * 1.18}" ry="${r * 0.82}" fill="none" stroke="${r % 12 === 0 ? "#ffffff" : steelBand}" stroke-width="2.5"/>`,
        );
      }
      groundMarkup = `<circle cx="64" cy="64" r="63" fill="url(#bg-${uid})"/>`;
      markMarkup =
        `<path d="${MARK_OUTER_SHELL}" fill="none" stroke="${cw.rim}" stroke-width="4.4" stroke-linejoin="round" opacity="0.85"/>` +
        `<g clip-path="url(#mk-${uid})">` +
          `<rect x="12" y="26" width="104" height="76" fill="${steelDark}"/>` +
          `<g transform="rotate(${angle} 68 64)">${rings.join("")}</g>` +
        `</g>` +
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="none" stroke="${cw.ink}" stroke-width="2.1" stroke-linejoin="round"/>` +
        renderLitCherry(uid, cw, 2.3);
      break;
    }

    case "porcelain": {
      // Glazed Kiln Ceramic / Crackle Porcelain (inspired by c01-porcelain)
      const glaze = cw.darkBg ? "#fcfaf4" : cw.ink;
      const crack = cw.darkBg ? cw.c1 : "#f7efe2";
      groundMarkup = `<circle cx="64" cy="64" r="63" fill="url(#bg-${uid})"/>`;
      markMarkup =
        `<g transform="translate(0 2.8)"><path d="${MARK_OUTER_SHELL}" fill="${cw.ink}" opacity="0.4"/></g>` +
        `<g clip-path="url(#mk-${uid})">` +
          `<rect x="12" y="26" width="104" height="76" fill="${glaze}"/>` +
          `<ellipse cx="62" cy="46" rx="28" ry="12" fill="#ffffff" opacity="${cw.darkBg ? "0.8" : "0.18"}"/>` +
          `<g fill="none" stroke="${crack}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
            `<path d="M36,55 L41,61 L38,66"/>` +
            `<path d="M63,75 L60,83 L65,90 L63,96"/>` +
            `<path d="M88,72 L92,80 L87,87"/>` +
            `<path d="M92,52 L98,58 L105,57"/>` +
          `</g>` +
        `</g>` +
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="none" stroke="${cw.ink}" stroke-width="2.3" stroke-linejoin="round"/>` +
        renderLitCherry(uid, cw, 2.3);
      break;
    }

    case "carbon": {
      // Forged Carbon-Fiber Weave + Anodized Titanium Accent
      extraDefs =
        `<pattern id="cb-${uid}" width="8" height="8" patternUnits="userSpaceOnUse">` +
          `<rect width="8" height="8" fill="#181b22"/>` +
          `<rect x="0" y="0" width="4" height="4" fill="#2d3340"/>` +
          `<rect x="4" y="4" width="4" height="4" fill="#2d3340"/>` +
          `<rect x="0" y="0" width="4" height="1.4" fill="#434c5e"/>` +
          `<rect x="4" y="4" width="4" height="1.4" fill="#434c5e"/>` +
        `</pattern>`;
      const markTone = hexLuma(cw.fg) >= 0.45 ? cw.fg : cw.fgHi;
      groundMarkup =
        `<rect x="0" y="0" width="128" height="128" fill="url(#cb-${uid})"/>` +
        `<circle cx="64" cy="64" r="56" fill="none" stroke="${cw.rim}" stroke-width="1.8" opacity="0.7"/>`;
      markMarkup =
        `<path d="${MARK_OUTER_SHELL}" fill="#090b10" stroke="#090b10" stroke-width="5.6" stroke-linejoin="round"/>` +
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="${markTone}" stroke="#090b10" stroke-width="2" stroke-linejoin="round"/>` +
        `<g clip-path="url(#mk-${uid})" transform="rotate(-24 68 64)">` +
          `<rect x="16" y="46" width="104" height="9" fill="#ffffff" opacity="0.45"/>` +
        `</g>` +
        renderLitCherry(uid, cw, 2.3);
      break;
    }

    case "holo": {
      // Prismatic Iridescent Foil Die-Cut Sticker on Matte Obsidian Coin
      extraDefs =
        `<linearGradient id="hl-${uid}" x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(${Math.round(angle / 2)} 0.5 0.5)">` +
          `<stop offset="0%" stop-color="#ff6bcb"/>` +
          `<stop offset="22%" stop-color="#ffd166"/>` +
          `<stop offset="46%" stop-color="#56f0c6"/>` +
          `<stop offset="70%" stop-color="#4cc9f0"/>` +
          `<stop offset="88%" stop-color="#b565ff"/>` +
          `<stop offset="100%" stop-color="#ffffff"/>` +
        `</linearGradient>`;
      groundMarkup =
        `<circle cx="64" cy="64" r="63" fill="#0d1018"/>` +
        `<circle cx="64" cy="64" r="53" fill="none" stroke="url(#hl-${uid})" stroke-width="1.6" opacity="0.65"/>`;
      markMarkup =
        `<path d="${MARK_OUTER_SHELL}" fill="#0d1018" stroke="#f8fafc" stroke-width="5.4" stroke-linejoin="round"/>` +
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="url(#hl-${uid})" stroke="#0b0e16" stroke-width="2.1" stroke-linejoin="round"/>` +
        `<g clip-path="url(#mk-${uid})" transform="rotate(-32 68 64)">` +
          `<rect x="14" y="44" width="104" height="6" fill="#ffffff" opacity="0.52"/>` +
          `<rect x="14" y="64" width="104" height="3" fill="#ffffff" opacity="0.35"/>` +
        `</g>` +
        renderLitCherry(uid, cw, 2.3);
      break;
    }

    case "stamp": {
      // Japanese Woodblock / Streetwear Distressed Ink Seal on Washi Cardstock (inspired by c09-stamp)
      const washiBg = "#f4ebdc";
      const stampInk = hexLuma(cw.c1) <= 0.45 ? cw.c1 : hexLuma(cw.fg) <= 0.45 ? cw.fg : "#c81e2b";
      groundMarkup =
        `<circle cx="64" cy="64" r="63" fill="${washiBg}"/>` +
        `<circle cx="64" cy="64" r="54.5" fill="none" stroke="${stampInk}" stroke-width="3.2" stroke-dasharray="28 3 18 2.5" opacity="0.88"/>`;
      markMarkup =
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="${stampInk}"/>` +
        `<path d="${CHERRY}" fill="${cw.ember}"/>` +
        `<g clip-path="url(#ma-${uid})" transform="rotate(${angle} 66 64)" stroke="${washiBg}" stroke-linecap="round">` +
          `<line x1="16" y1="42" x2="112" y2="42" stroke-width="1.5" stroke-dasharray="9 14 4 11" opacity="0.75"/>` +
          `<line x1="16" y1="58" x2="112" y2="58" stroke-width="1.3" stroke-dasharray="5 18 11 9" opacity="0.70"/>` +
          `<line x1="16" y1="74" x2="112" y2="74" stroke-width="1.6" stroke-dasharray="12 10 3 16" opacity="0.72"/>` +
          `<line x1="16" y1="88" x2="112" y2="88" stroke-width="1.4" stroke-dasharray="7 15 6 12" opacity="0.70"/>` +
        `</g>`;
      break;
    }

    case "thermal": {
      // Infrared FLIR Heat-Vision radiating from the burning joint cherry across the monkey muzzle
      extraDefs =
        `<radialGradient id="thrm-${uid}" cx="18%" cy="42%" r="86%">` +
          `<stop offset="0%" stop-color="#ffffff"/>` +
          `<stop offset="16%" stop-color="#fff05a"/>` +
          `<stop offset="40%" stop-color="#ff5400"/>` +
          `<stop offset="68%" stop-color="#e0007a"/>` +
          `<stop offset="100%" stop-color="#3a0ca3"/>` +
        `</radialGradient>`;
      groundMarkup =
        `<circle cx="64" cy="64" r="63" fill="#0b0620"/>` +
        `<circle cx="25" cy="55" r="26" fill="#ff5400" opacity="0.22"/>` +
        `<path d="M64,8 V15 M64,113 V120 M8,64 H15 M113,64 H120" stroke="#4cc9f0" stroke-width="1.6" opacity="0.55"/>`;
      markMarkup =
        `<path d="${MARK_OUTER_SHELL}" fill="none" stroke="#4cc9f0" stroke-width="3.6" stroke-linejoin="round" opacity="0.45"/>` +
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="url(#thrm-${uid})" stroke="#090418" stroke-width="2" stroke-linejoin="round"/>` +
        `<path d="${CHERRY}" fill="#ffffff" stroke="#ffbe0b" stroke-width="2.6"/>`;
      break;
    }

    case "vinyl":
    default: {
      // Glossy 3D Art-Toy / Lacquered Designer Vinyl
      const vinylMid =
        Math.abs(hexLuma(cw.c1) - hexLuma(cw.bg)) >= 0.22
          ? cw.c1
          : cw.darkBg
            ? cw.fg
            : cw.ink;
      extraDefs =
        `<radialGradient id="vn-${uid}" cx="35%" cy="28%" r="72%">` +
          `<stop offset="0%" stop-color="#ffffff"/>` +
          `<stop offset="48%" stop-color="${vinylMid}"/>` +
          `<stop offset="100%" stop-color="${cw.fgShade}"/>` +
        `</radialGradient>`;
      groundMarkup =
        `<circle cx="64" cy="64" r="63" fill="url(#bg-${uid})"/>` +
        `<circle cx="64" cy="64" r="49" fill="${vinylMid}" opacity="0.14"/>`;
      markMarkup =
        `<g transform="translate(0 3.4)"><path d="${MARK_OUTER_SHELL}" fill="${cw.ink}" opacity="0.52"/></g>` +
        `<path fill-rule="evenodd" d="${MARK_BODY}" fill="url(#vn-${uid})" stroke="${cw.ink}" stroke-width="2.3" stroke-linejoin="round"/>` +
        `<g clip-path="url(#mk-${uid})" fill="#ffffff">` +
          `<ellipse cx="64" cy="42.5" rx="7.5" ry="2.1" opacity="0.65"/>` +
          `<ellipse cx="94" cy="58" rx="6.5" ry="2.6" transform="rotate(28 94 58)" opacity="0.55"/>` +
          `<ellipse cx="44" cy="61" rx="8" ry="1.6" transform="rotate(29 44 61)" opacity="0.52"/>` +
        `</g>` +
        renderLitCherry(uid, cw, 2.3);
      break;
    }
  }

  // Crisp outer collector badge bezel so dark & light grounds read cleanly on every page
  let rimMarkup = "";
  if (rimMode === 0) {
    rimMarkup =
      `<circle cx="64" cy="64" r="59.5" fill="none" stroke="${cw.rim}" stroke-width="1.8" opacity="0.72"/>` +
      `<circle cx="64" cy="64" r="62" fill="none" stroke="${cw.ink}" stroke-width="3.6"/>`;
  } else if (rimMode === 1) {
    rimMarkup =
      `<circle cx="64" cy="64" r="60" fill="none" stroke="${cw.rim}" stroke-width="3.2"/>` +
      `<circle cx="64" cy="64" r="62.2" fill="none" stroke="${cw.ink}" stroke-width="3.2"/>`;
  } else if (rimMode === 2) {
    rimMarkup =
      `<circle cx="64" cy="64" r="58.5" fill="none" stroke="${cw.rim}" stroke-width="1.6" stroke-dasharray="5 4" opacity="0.78"/>` +
      `<circle cx="64" cy="64" r="62" fill="none" stroke="${cw.ink}" stroke-width="3.6"/>`;
  } else {
    rimMarkup = `<circle cx="64" cy="64" r="62" fill="none" stroke="${cw.ink}" stroke-width="3.8"/>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" role="img" aria-label="">` +
    `<defs>${baseDefs}${extraDefs}</defs>` +
    `<g clip-path="url(#coin-${uid})">` +
      groundMarkup +
      markMarkup +
    `</g>` +
    rimMarkup +
    `</svg>`
  );
}
