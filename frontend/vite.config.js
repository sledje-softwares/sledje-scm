import fs from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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

export default defineConfig({
  plugins: [react({ include: /\.(js|jsx)$/ }), cljFuzzyVite],
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
