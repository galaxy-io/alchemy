import path from "node:path";

import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { galaxyDls } from "@galaxy-io/dls/vite";

// The standalone app. `vite.lib.config.ts` builds the same source as the `@galaxy-io/alchemy` module.
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    viteReact(),
    galaxyDls({ prefix: "alchemy" }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/functions.v1.FunctionsService": {
        target: "http://localhost:8780",
        changeOrigin: true,
      },
      "/metrics.v1.MetricsService": {
        target: "http://localhost:8780",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    outDir: "build",
    target: "esnext",
    rollupOptions: {
      onwarn(warning, warn) {
        if (
          warning.code === "PURE_COMMENT_POSITION" ||
          warning.message?.includes("contains an annotation that Rollup cannot interpret")
        ) {
          return;
        }
        warn(warning);
      },
    },
  },
});
