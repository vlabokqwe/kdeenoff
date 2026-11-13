import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * Admin panel build (separate React SPA under /admin/).
 * Output: dist/admin — the backend serves it only after the Cloudflare Access check,
 * so admin code and assets (/admin/assets/*) never load without Access.
 */
const root = fileURLToPath(new URL("./admin", import.meta.url));

export default defineConfig({
  plugins: [react()],
  root,
  base: "/admin/",
  publicDir: false,
  build: {
    outDir: fileURLToPath(new URL("./dist/admin", import.meta.url)),
    // Same as the public build: do not wipe dist during `vite build --watch`.
    emptyOutDir: !process.argv.includes("--watch"),
    target: "es2020",
    sourcemap: false,
  },
});

