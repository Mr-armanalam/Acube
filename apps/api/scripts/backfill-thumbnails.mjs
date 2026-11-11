#!/usr/bin/env node
// Backfill auto-thumbnails for videos that have no thumbnailUrl yet
// (uploaded before the feature landed).
//
//   DB_URL=mongodb://127.0.0.1:27017/acube pnpm --filter @acube/api seed:thumbnails
//   DB_URL=... pnpm --filter @acube/api seed:thumbnails -- --dry-run
//   DB_URL=... pnpm --filter @acube/api seed:thumbnails -- --limit 50
//
// Cloudinary-hosted videos get their three frame URLs derived from
// the stored video URL (no re-upload, no network). Locally stored
// videos get real ffmpeg frames extracted from the file on disk.
// Videos whose file is missing, whose URL is unparsable, or whose
// extraction fails are skipped/counted, never fatal. Prints a JSON
// summary. Idempotent: re-running it only touches videos that still
// have no thumbnailUrl.
//
// Safety (same rule as seed:demo): a DB_URL containing "atlas" or
// "prod" is REFUSED unless SEED_THUMBNAILS_ALLOW_REMOTE=1 is set.
// Backfill data must never land in a production database by accident.
import dotenv from "dotenv";
import mongoose from "mongoose";
import { backfillThumbnails } from "../Helper/thumbnailBackfill.js";

dotenv.config();

const DB_URL = process.env.DB_URL ?? process.env.MONGODB_URI;
if (!DB_URL) {
  console.error(
    "seed:thumbnails needs a database URL: set DB_URL (or MONGODB_URI), e.g.\n" +
      "  DB_URL=mongodb://127.0.0.1:27017/acube pnpm --filter @acube/api seed:thumbnails",
  );
  process.exit(1);
}
if (
  /atlas|prod/i.test(DB_URL) &&
  process.env.SEED_THUMBNAILS_ALLOW_REMOTE !== "1"
) {
  console.error(
    "Refusing to backfill thumbnails into what looks like a remote/production " +
      `database (${DB_URL}).\n` +
      "If you really mean it, re-run with SEED_THUMBNAILS_ALLOW_REMOTE=1.",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

try {
  await mongoose.connect(DB_URL);
  const summary = await backfillThumbnails({ limit, dryRun });
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(`seed:thumbnails failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
