import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { execSync } from "child_process";

/**
 * A short, human-checkable marker for "which build is this?".
 *
 * Whether a change had actually reached Railway came up repeatedly while
 * debugging, and guessing cost more than showing it does. Falls back to the
 * build date when git is unavailable, as it is in some deploy images.
 */
function buildId(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return new Date().toISOString().slice(0, 16).replace("T", " ");
  }
}

export default defineConfig(async (): Promise<any> => {
  return {
    define: {
      __BUILD_ID__: JSON.stringify(buildId()),
    },
    plugins: [
      react(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    root: path.resolve(import.meta.dirname, "client"),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
      target: ['es2020', 'safari14'],
      rollupOptions: {
        output: {
          // Split long-lived third-party code out of the app chunk. These change
          // only on dependency upgrades, so returning visitors keep them cached
          // across deploys instead of refetching everything on each release.
          //
          // Only libraries that are genuinely imported at startup are named here.
          // A catch-all `return 'vendor'` must be avoided: it pulls
          // dynamically-imported packages (html2canvas) into a chunk that is
          // statically reachable from the entry, which silently cancels their
          // lazy loading. Everything unnamed falls through to Rollup's default
          // chunking, which keeps dynamic imports in their own on-demand chunks.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return;
            if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'vendor-firebase';
            if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) {
              return 'vendor-react';
            }
            if (id.includes('/@radix-ui/')) return 'vendor-radix';
            return;
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      allowedHosts: ['localhost', '127.0.0.1'],
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
