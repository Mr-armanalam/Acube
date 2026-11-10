import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Acube client — Vite 7 + React 19 (migrated from CRA in Phase 2a).
//
// Backend: the app calls the API through an absolute base URL
// (VITE_BACKEND_URL, default http://localhost:5000) via the axios instance
// in src/Api/index.ts, so there is no dev-server proxy. No relative /api
// calls exist in src/ (verified 2026-11-10).
export default defineConfig({
  plugins: [
    react(),
    // simple-peer (StreamRoom) depends on Node built-ins (buffer, stream,
    // process) via readable-stream. Vite does not polyfill those; this
    // plugin provides them. Revisit if simple-peer is ever replaced.
    //
    // The `crypto` override is Phase 3c (see src/shims/crypto-shim.ts):
    // crypto-js only needs crypto.getRandomValues / randomBytes, but the
    // plugin's default mapping points Node `crypto` at crypto-browserify
    // and Rollup then bundles its ~400 kB tree (elliptic, bn.js,
    // browserify-sign/aes/des/rsa, ...) even though the browser never
    // executes it. The override forwards to the Web Crypto API instead.
    nodePolyfills({
      overrides: {
        crypto: fileURLToPath(
          new URL("./src/shims/crypto-shim.ts", import.meta.url),
        ),
      },
    }),
  ],
  // videoPlayer imports a .vtt subtitle file, which is not in Vite's
  // default asset list.
  assetsInclude: ["**/*.vtt"],
  // Phase 3c: vendor split. Before this, the whole vendor bundle shipped
  // in the initial chunk (1,113.73 kB / gzip 343.34 kB). Third-party code
  // is now split by family so the browser caches each family separately
  // and the entry chunk holds app code only.
  //
  // modulePreload is OFF on purpose: Vite's default preload list
  // includes the dependencies of lazy routes, which would pull the
  // simple-peer chunk (peer-polyfills) into the initial load and
  // erase the split. With it off, the initial load is only the
  // entry's static imports; lazy chunks and their deps load when the
  // route is visited.
  //
  // Chunking rule (learned the hard way): there is NO catch-all
  // bucket. A catch-all swallowed every small shared library
  // (react-router's @remix-run/route-pattern + cookie-es, redux-thunk,
  // the whole crypto-browserify tree behind crypto-js,
  // engine.io-parser, ...), so every initial vendor chunk depended on
  // it and Rollup hoisted it into the entry chunk's static imports —
  // the "split" changed nothing. Shared low-level modules are
  // therefore routed to the INITIAL family that needs them, so the
  // lazy chunk imports the initial chunk (already loaded), never the
  // reverse. That includes readable-stream: it looks lazy-only, but
  // the crypto tree's hash-base / browserify-sign import it too, so
  // keeping it in the lazy chunk created a circular chunk warning.
  build: {
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          if (!id.includes("node_modules")) return undefined;
          // Modules used ONLY by the lazy StreamRoom route:
          // simple-peer + recordrtc (+ get-browser-rtc, used by
          // simple-peer). Nothing in the initial bundle may import
          // these — if it does, the entry chunk ends up importing
          // peer-polyfills.
          if (
            id.includes("node_modules/simple-peer/") ||
            id.includes("node_modules/recordrtc/") ||
            id.includes("node_modules/get-browser-rtc/")
          ) {
            return "peer-polyfills";
          }
          if (
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/react/") ||
            id.includes("node_modules/scheduler/") ||
            id.includes("node_modules/react-router/") ||
            // react-router's own deps — NOT lazy, they ship with it.
            id.includes("node_modules/@remix-run/") ||
            id.includes("node_modules/cookie-es/") ||
            // use-sync-external-store ships React's external-store hook
            // (used by react-redux); it requires React, so it belongs
            // here.
            id.includes("node_modules/use-sync-external-store/") ||
            // react-dom's CJS build reads process.env.NODE_ENV (and
            // references the `global` shim), so those two plugin shims
            // must live in this chunk — otherwise this chunk imports
            // another chunk and that chunk imports this one (circular
            // chunk warning).
            id.includes("node_modules/process/") ||
            id.includes(
              "vite-plugin-node-polyfills/shims/process/dist/index.js",
            ) ||
            id.includes(
              "vite-plugin-node-polyfills/shims/global/dist/index.js",
            )
          ) {
            return "react-vendor";
          }
          if (
            id.includes("node_modules/@reduxjs/") ||
            id.includes("node_modules/react-redux/") ||
            id.includes("node_modules/redux/") ||
            id.includes("node_modules/redux-thunk/") ||
            id.includes("node_modules/immer/") ||
            id.includes("node_modules/reselect/")
          ) {
            return "redux-vendor";
          }
          if (id.includes("node_modules/@tanstack/")) {
            return "query-vendor";
          }
          if (id.includes("node_modules/react-icons/")) {
            return "icons-vendor";
          }
          if (
            id.includes("node_modules/socket.io-client/") ||
            id.includes("node_modules/socket.io-parser/") ||
            id.includes("node_modules/engine.io-client/") ||
            id.includes("node_modules/engine.io-parser/") ||
            id.includes("node_modules/@socket.io/component-emitter/") ||
            // engine.io-client's debug logging.
            id.includes("node_modules/debug/") ||
            id.includes("node_modules/ms/")
          ) {
            return "socket-vendor";
          }
          if (
            id.includes("node_modules/axios/") ||
            id.includes("node_modules/crypto-js/") ||
            id.includes("node_modules/date-fns/") ||
            id.includes("node_modules/jwt-decode/") ||
            id.includes("node_modules/@react-oauth/") ||
            // The stream/buffer/util helpers are shared between the
            // initial crypto path and the lazy StreamRoom tree — they
            // live here (initial) so the lazy chunk imports this
            // chunk, never the reverse.
            id.includes("node_modules/readable-stream/") ||
            id.includes("node_modules/stream-browserify/") ||
            id.includes("node_modules/events/") ||
            id.includes("node_modules/isarray/") ||
            id.includes("node_modules/core-util-is/") ||
            id.includes("node_modules/util-deprecate/") ||
            id.includes("node_modules/queue-microtask/") ||
            id.includes("node_modules/process-nextick-args/") ||
            id.includes("node_modules/err-code/") ||
            id.includes("node_modules/crypto-browserify/") ||
            id.includes("node_modules/safe-buffer/") ||
            id.includes("node_modules/inherits/") ||
            id.includes("node_modules/string_decoder/") ||
            id.includes("node_modules/randombytes/") ||
            id.includes("node_modules/randomfill/") ||
            id.includes("node_modules/util/") ||
            id.includes("vite-plugin-node-polyfills/shims/buffer/")
          ) {
            return "misc-vendor";
          }
          // No catch-all: anything unlisted lets Rollup decide. In
          // practice that is web-vitals (only dynamically imported,
          // so it gets its own chunk).
          return undefined;
        },
      },
    },
  },
  server: {
    port: 3000,
  },
});
