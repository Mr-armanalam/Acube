// Playwright Phase 5 config — feed personalization
// (feed-personalization.spec.ts).
//
// Same production build + vite preview on :4173 and the same seeded
// API server as playwright.phase5.config.ts, except the API also runs
// with DEMO_LOGIN_ENABLED=1: the spec signs in as the seeded demo
// channel (Code Streamer) through the real POST /auth/demo-login
// (local-only, demo-flagged accounts only, NODE_ENV=test here) and
// builds that account's watch history through the real
// PATCH /video/view/:id endpoint. No real credentials are involved.
//
// Run (from apps/web):
//   VITE_BACKEND_URL=http://localhost:5000 \
//   VITE_CLIENT_ID=e2e-test.apps.googleusercontent.com \
//   VITE_ENCRYPTED_KEY=e2e-test-key vite build && \
//   playwright test -c playwright.phase5-feed.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-phase5",
  testMatch: "feed-personalization.spec.ts",
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
      command:
        "DEMO_LOGIN_ENABLED=1 PHASE5_SEED=1 node ../api/e2e-server.mjs",
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
