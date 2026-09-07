import fs from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// CRA -> Vite migration. Things this project needs that a stock Vite config
// does not give you:
//
//  1. 45 source files contain JSX but use a .js extension. esbuild refuses
//     JSX in .js by default, so the loader is widened below (both for the
//     dev/build transform and for dependency pre-bundling).
//  2. The deploy serves frontend/build (committed to git). Vite defaults to
//     dist/, so outDir is pinned back to build/ to keep that contract.
//  3. `clj-fuzzy` (a transitive dep of `words-to-numbers`, used by
//     src/pages/Retailers/posVoice.js) is a Google-Closure blob whose
//     top-level IIFE reads `this` expecting the sloppy-mode global object.
//     Under webpack that worked; under Vite every module is ESM/strict, so
//     `this` is `undefined` and the file throws on load
//     ("Cannot use 'in' operator to search for 'clj_fuzzy' in undefined"),
//     taking the whole app down. The one-line patch below restores the
//     global it expects, in both the dev pre-bundle and the rollup build.

const CLJ_FUZZY_BROKEN = "var f,ba=this;";
const CLJ_FUZZY_FIXED =
  'var f,ba=this||(typeof globalThis!=="undefined"?globalThis:window);';

const patchCljFuzzy = (code) => code.replace(CLJ_FUZZY_BROKEN, CLJ_FUZZY_FIXED);
const isCljFuzzy = (id) => id.replace(/\\/g, "/").includes("/clj-fuzzy/");

// esbuild plugin — runs during dependency pre-bundling (dev).
const cljFuzzyEsbuild = {
  name: "patch-clj-fuzzy",
  setup(build) {
    build.onLoad({ filter: /clj-fuzzy[\\/].*\.js$/ }, (args) => ({
      contents: patchCljFuzzy(fs.readFileSync(args.path, "utf8")),
      loader: "js",
    }));
  },
};

// Vite plugin — runs during the rollup build.
const cljFuzzyVite = {
  name: "patch-clj-fuzzy",
  enforce: "pre",
  transform(code, id) {
    if (isCljFuzzy(id) && code.includes(CLJ_FUZZY_BROKEN)) {
      return { code: patchCljFuzzy(code), map: null };
    }
  },
};

// The POS must load with no network (docs/16-offline-first.md). Workbox
// precaches the app shell so the counter opens from cache; the outbox in
// IndexedDB is what makes the sales survive.
//
// generateSW, not injectManifest: the only custom service-worker code needed
// is a Background Sync doorbell, and importScripts carries it without pulling
// the workbox runtime into application source. See public/sledje-sync-sw.js.
const pwa = VitePWA({
  registerType: "autoUpdate",
  injectRegister: "auto",
  manifest: false, // public/manifest.json is the manifest, and index.html links it
  includeAssets: ["favicon.ico", "logo192.png", "logo512.png", "manifest.json"],
  workbox: {
    importScripts: ["/sledje-sync-sw.js"],
    // Precache the SHELL, and only the shell.
    //
    // Two hard-won reasons this list is narrow rather than "**/*":
    //
    //  1. Workbox's install is ALL-OR-NOTHING. One entry that 404s or 500s and
    //     the whole service worker goes `redundant` - which means no offline
    //     app at all, silently, with a perfectly working online app to hide it.
    //     That is exactly what happened here: public/%PUBLIC_URL%/ is CRA-era
    //     junk holding a screenshot whose filename contains a U+202F narrow
    //     no-break space, which the static server answers with a 500. Every
    //     entry in this list is a way for the offline POS to stop existing, so
    //     it holds only what the counter actually needs.
    //  2. Weight. The marketing pages carry ~11 MB of PNGs. Precaching those
    //     means a shopkeeper on a weak connection never finishes the install,
    //     and an unfinished install is an uninstalled service worker.
    globPatterns: [
      "**/*.{js,css,html,ico,woff,woff2}",
      "logo192.png",
      "logo512.png",
      "manifest.json",
    ],
    globIgnores: ["**/%PUBLIC_URL%/**", "**/assets/*.png"],
    maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
    // Any in-app navigation resolves to the cached shell, so /retailer/pos
    // opens on a device that has never had a connection this session.
    navigateFallback: "/index.html",
    // The API is never precached and never served from cache. A stale shelf is
    // a cache we manage ourselves in IndexedDB, with a cursor and a merge
    // policy; a stale HTTP response is a lie we cannot reason about.
    navigateFallbackDenylist: [/^\/api/, /^\/sync/, /^\/sales/],
    cleanupOutdatedCaches: true,
  },
  devOptions: {
    // Off in dev: an aggressively caching service worker and HMR do not mix,
    // and the offline path is verified against the production build anyway.
    enabled: false,
  },
});

export default defineConfig({
  plugins: [react({ include: /\.(js|jsx)$/ }), cljFuzzyVite, pwa],
  server: { port: 3000 },
  build: {
    outDir: "build",
    emptyOutDir: true,
  },
  esbuild: {
    loader: "jsx",
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { ".js": "jsx" },
      plugins: [cljFuzzyEsbuild],
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.js",
  },
});
