#!/usr/bin/env node
// Demo seed CLI (Phase 5 fix) — TEST-ONLY demo data.
//
//   DB_URL=mongodb://127.0.0.1:27017/acube pnpm --filter @acube/api seed:demo
//
// The database comes from DB_URL (or MONGODB_URI). The seed is
// idempotent: it clears demo:true rows first, then re-inserts, so
// re-running it produces the same counts and never touches real data.
//
// Safety: a DB_URL containing "atlas" or "prod" is REFUSED unless
// SEED_DEMO_ALLOW_REMOTE=1 is set in the environment. Demo data must
// never land in a production database by accident.
//
// Prints a JSON summary with the verified totals (1,503 views /
// 113 likes, aggregated from the seeded events — see seedDemo.js).
import mongoose from "mongoose";
import { seedDemoData } from "./seedDemo.js";

const DB_URL = process.env.DB_URL ?? process.env.MONGODB_URI;
if (!DB_URL) {
  console.error(
    "seed:demo needs a database URL: set DB_URL (or MONGODB_URI), e.g.\n" +
      "  DB_URL=mongodb://127.0.0.1:27017/acube pnpm --filter @acube/api seed:demo",
  );
  process.exit(1);
}
if (
  /atlas|prod/i.test(DB_URL) &&
  process.env.SEED_DEMO_ALLOW_REMOTE !== "1"
) {
  console.error(
    "Refusing to seed demo data into what looks like a remote/production " +
      `database (${DB_URL}). Demo data is test-only.\n` +
      "If you really mean it, re-run with SEED_DEMO_ALLOW_REMOTE=1.",
  );
  process.exit(1);
}

try {
  await mongoose.connect(DB_URL);
  const summary = await seedDemoData();
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(`seed:demo failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
