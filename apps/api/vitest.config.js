import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Starts one in-memory mongod for the whole run (binary cached in
    // ~/.cache/mongodb-binaries; first run downloads ~128 MB).
    globalSetup: "./tests/globalSetup.js",
    setupFiles: ["./tests/setup.js"],
    testTimeout: 120000,
    hookTimeout: 120000,
    // One worker for all files: tests share a single mongoose connection
    // and run sequentially, so DB state is deterministic.
    // (Vitest 4+ name for the old poolOptions.forks.singleFork.)
    pool: "forks",
    fileParallelism: false,
  },
});
