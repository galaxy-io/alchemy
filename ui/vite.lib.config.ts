import path from "node:path";

import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

import { galaxyDls } from "@galaxy-io/dls/vite";

// The `@galaxy-io/alchemy` module: the screens, hooks and route contents a host mounts under its own
// router and providers. dist/ mirrors src/ so a host tree-shakes per file through the subpath
// exports in package.json, which list exactly these entries.
const ENTRIES = {
  "module/routes": "src/module/routes.tsx",
  "module/hooks": "src/module/hooks.ts",
  "module/nav": "src/module/nav.ts",
  "module/commands": "src/module/commands.ts",
  "module/schemas": "src/module/schemas.ts",
  "module/types": "src/module/types.ts",
  "module/AlchemyLayout": "src/module/AlchemyLayout.tsx",
  "layouts/ErrorLayout": "src/layouts/ErrorLayout.tsx",
  "layouts/PendingLayout": "src/layouts/PendingLayout.tsx",
  "layouts/EmptyLayout": "src/layouts/EmptyLayout.tsx",
  "pages/observability/ObservabilityPage": "src/pages/observability/ObservabilityPage.tsx",
  "pages/functions/FunctionsPage": "src/pages/functions/FunctionsPage.tsx",
  "pages/functions/FunctionPage": "src/pages/functions/FunctionPage.tsx",
  "pages/functions/FunctionOverviewPage": "src/pages/functions/FunctionOverviewPage.tsx",
  "pages/functions/FunctionWorkbenchPage": "src/pages/functions/FunctionWorkbenchPage.tsx",
  "pages/functions/FunctionContractPage": "src/pages/functions/FunctionContractPage.tsx",
  "pages/functions/FunctionVersionsPage": "src/pages/functions/FunctionVersionsPage.tsx",
  "pages/functions/FunctionInvocationsPage": "src/pages/functions/FunctionInvocationsPage.tsx",
  "pages/functions/FunctionSettingsPage": "src/pages/functions/FunctionSettingsPage.tsx",
  "pages/invocations/InvocationsPage": "src/pages/invocations/InvocationsPage.tsx",
  "pages/hosts/HostsPage": "src/pages/hosts/HostsPage.tsx",
};

// The standalone host. Never reachable from an entry above; see the biome override that enforces it.
const HOST_FILES = [
  "src/main.tsx",
  "src/App.tsx",
  "src/router.tsx",
  "src/routeTree.gen.ts",
  "src/routes/**",
  "src/layouts/app/**",
  "src/api/transport.ts",
  "src/api/queryClient.ts",
  "src/api/TransportQueryClientProvider.tsx",
  "src/pages/NotFoundPage.tsx",
];

const isBareImport = (id: string) =>
  !id.startsWith(".") &&
  !id.startsWith("/") &&
  !id.startsWith("@/") &&
  !id.startsWith("\0") &&
  !id.endsWith(".css");

export default defineConfig({
  plugins: [
    viteReact(),
    galaxyDls({ prefix: "alchemy" }),
    dts({
      tsconfigPath: "./tsconfig.json",
      entryRoot: "src",
      exclude: HOST_FILES,
      compilerOptions: { allowImportingTsExtensions: false },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    target: "esnext",
    lib: {
      entry: ENTRIES,
      formats: ["es"],
      cssFileName: "styles",
    },
    cssCodeSplit: false,
    minify: false,
    rollupOptions: {
      external: (id, _importer, isResolved) => !isResolved && isBareImport(id),
      output: {
        preserveModules: true,
        preserveModulesRoot: "src",
        entryFileNames: "[name].js",
      },
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
