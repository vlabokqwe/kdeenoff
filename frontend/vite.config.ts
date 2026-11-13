import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Public site build (React SPA).
 * Output: dist/public — served by the NestJS backend for every non-admin page.
 * `public/` (css, fonts, img) is copied as-is, so /css, /fonts and /img URLs stay unchanged.
 *
 * `npm run dev -w frontend` starts the Vite dev server on :5173 with HMR and proxies /api
 * to the NestJS backend on :8080. Acceptance is still http://localhost:8080/ (`npm run serve`).
 */
export default defineConfig({
  plugins: [react()],
  base: "/",
  publicDir: "public",
  build: {
    outDir: "dist/public",
    // Watch rebuilds must not delete dist while Nest is serving it. On Windows
    // that delete fails with EPERM and leaves the site without index.html.
    emptyOutDir: !process.argv.includes("--watch"),
    target: "es2020",
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: false },
    },
  },
});

