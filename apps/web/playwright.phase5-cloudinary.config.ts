// Playwright Phase 5 config — upload wizard WITH Cloudinary
// credentials present (upload-wizard-cloudinary.spec.ts).
//
// Same production build + vite preview on :4173 and the same seeded
// API server as playwright.phase5.config.ts, except:
//  * CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
//    are set (obviously-fake placeholders — never real credentials),
//    so the API takes the Cloudinary path instead of the local fallback;
//  * the API runs with `node --import` of the cloudinary-mock
//    register (apps/api/tests/cloudinary-mock-register.mjs), which
//    redirects the `cloudinary` package to a mock SDK: no real network
//    call to Cloudinary ever happens, and every config()/upload() call
//    is recorded to CLOUDINARY_MOCK_OUT for the spec to assert on.
// The unconfigured (local-fallback) path is covered by the existing
// upload-wizard.spec.ts under playwright.phase5.config.ts.
//
// Run (from apps/web): pnpm test:e2e:phase5:cloudinary
import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const MOCK_OUT = path.join(os.tmpdir(), "acube-cloudinary-mock-out.json");

export default defineConfig({
  testDir: "./e2e-phase5",
  testMatch: "upload-wizard-cloudinary.spec.ts",
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
        `PHASE5_SEED=1 CLOUDINARY_CLOUD_NAME=test-cloud-name ` +
        `CLOUDINARY_API_KEY=test-key CLOUDINARY_API_SECRET=test-secret ` +
        `CLOUDINARY_MOCK_OUT=${MOCK_OUT} ` +
        `node --import ../api/tests/cloudinary-mock-register.mjs ../api/e2e-server.mjs`,
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
