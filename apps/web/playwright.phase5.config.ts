// Playwright Phase 5 click-through config — same production build +
// vite preview on :4173 as the Phase 4 config, but the API server runs
// with PHASE5_SEED=1 (apps/api/e2e-server.mjs), which seeds the Creator
// Studio data for the fake e2e user (User row, own video, one
// ChannelDailyStat row, comment, history row, playlist, saved entry).
// The Phase 3c/4 specs keep their own config and unseeded server, so
// the premium test's "fake user has no DB row" behaviour is untouched.
//
// Run (from apps/web): pnpm test:e2e:phase5
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-phase5",
  // upload-wizard-cloudinary.spec.ts needs its own config
  // (playwright.phase5-cloudinary.config.ts): that server sets
  // CLOUDINARY_* and redirects the SDK to a mock. Under this config
  // the API has no Cloudinary credentials, so that spec's Cloudinary
  // assertions would fail on the (correct) local fallback.
  testIgnore: "upload-wizard-cloudinary.spec.ts",
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
      command: "PHASE5_SEED=1 node ../api/e2e-server.mjs",
      url: "http://localhost:5000/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "pnpm preview --port 4173 --strictPort",
      url: "http://localhost:4173",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
