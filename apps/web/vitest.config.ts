import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Minimal Vitest setup for the web app (Phase 2a). The test worker owns
// the test files; the only test present is the stale CRA placeholder
// src/App.test.js, which is expected to fail until it is replaced.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.js"],
    // Unit tests only. Playwright specs live in e2e/ and run via
    // `pnpm test:e2e` — without this, Vitest's default include
    // (**/*.spec.ts) picks them up and fails on test.describe().
    include: ["src/**/*.test.{ts,tsx,js,jsx}"],
    // Test-only values. The OTP tests encrypt/decrypt the route param
    // with this key; the API base makes axios use absolute URLs so MSW
    // can match them. Neither is a real secret.
    env: {
      VITE_ENCRYPTED_KEY: "test-only-encryption-key",
      VITE_BACKEND_URL: "http://localhost:5000",
    },
  },
});
