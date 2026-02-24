import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Use relative base so Vite outputs src="./assets/..." rather than src="/clearskies/assets/...".
  // MyGeotab's add-in loader string-concatenates the add-in URL with script srcs, so an
  // absolute base would produce double-path URLs (clearskies//clearskies/assets/...).
  base: "./",
  // Build as a single HTML app — Geotab Add-In loads index.html and the
  // lifecycle callbacks (initialize/focus/blur) are registered globally.
  build: {
    outDir: "dist",
    sourcemap: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Split large vendor deps so the main chunk stays under 500 kB.
        manualChunks: {
          react: ["react", "react-dom"],
          leaflet: ["react-leaflet", "leaflet"],
          geotab: ["@geotab/zenith"],
        },
      },
    },
  },
  // Env prefix for Vite — VITE_* vars are exposed to the client bundle
  envPrefix: "VITE_",
});
