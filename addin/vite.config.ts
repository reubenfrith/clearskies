import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the app from /clearskies/ — base must match the repo name.
  base: "/clearskies/",
  // Build as a single HTML app — Geotab Add-In loads index.html and the
  // lifecycle callbacks (initialize/focus/blur) are registered globally.
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  // Env prefix for Vite — VITE_* vars are exposed to the client bundle
  envPrefix: "VITE_",
});
