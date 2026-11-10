// Playwright smoke tests (Phase 3c) — headless Chromium against the
// production build (`vite preview` on :4173) plus the real API backed
// by an in-memory MongoDB (apps/api/e2e-server.mjs, seeded with one
// video). Run with:
//
//   pnpm --filter @acube/web test:e2e
//
// That script rebuilds the web app first with VITE_BACKEND_URL pointed
// at the e2e API and a dummy VITE_ENCRYPTED_KEY (used by the StreamRoom
// test to build a room URL). No real credentials are involved: Google
// sign-in, Stripe Checkout, Cloudinary upload, and actual video
// playback with sound are NOT covered here — see PHASE3_REPORT.md.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      // Real API, in-memory MongoDB, one seeded video.
      command: "node ../api/e2e-server.mjs",
      url: "http://localhost:5000/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Production build of the web app (built by `pnpm test:e2e`).
      command: "pnpm preview --port 4173 --strictPort",
      url: "http://localhost:4173",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
