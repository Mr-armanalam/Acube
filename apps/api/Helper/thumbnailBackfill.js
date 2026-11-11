"use strict";
// Backfill auto-thumbnails for videos uploaded before the feature
// landed (see scripts/backfill-thumbnails.mjs — this module is the
// testable core, the script is the CLI wrapper).
//
// Only videos with NO thumbnailUrl are touched (deleted videos are
// skipped). Per video:
//   * Cloudinary-hosted (filepath is a res.cloudinary.com video URL):
//     derive the three frame URLs from the stored URL — no re-upload,
//     no network call (see deriveCloudinaryThumbnailUrls).
//   * Locally stored (filepath is /uploads/<file>): run the ffmpeg
//     path on the file on disk — same helper the upload controller
//     uses. A missing/corrupt file skips that video, it never aborts
//     the run.
//   * Anything else (unknown host, unparsable URL): skipped.
// thumbnailUrl is set to the middle candidate (index 1). Every video
// is independent: one failure is counted and the run continues.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Videofile from "../Models/videofile.js";
import {
  deriveCloudinaryThumbnailUrls,
  extractLocalThumbnails,
} from "./thumbnails.js";
import { AUTO_THUMBNAIL_DEFAULT_INDEX } from "@acube/shared";

export const uploadsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "uploads",
);

export async function backfillThumbnails({ limit = 0, dryRun = false } = {}) {
  const query = Videofile.find({
    thumbnailUrl: null,
    deletedAt: null,
  }).sort({ createdAt: 1, _id: 1 });
  if (limit > 0) query.limit(limit);
  const videos = await query.lean();
  const summary = {
    examined: videos.length,
    updated: 0,
    skipped: 0,
    failed: 0,
    dryRun,
    failures: [],
  };
  for (const video of videos) {
    const videoId = String(video._id);
    try {
      let autoThumbnails = null;
      let durationSeconds = null;
      if (
        typeof video.filepath === "string" &&
        video.filepath.startsWith("/uploads/")
      ) {
        const videoPath = path.join(
          uploadsDir,
          path.basename(video.filepath),
        );
        if (!fs.existsSync(videoPath)) {
          summary.skipped += 1;
          continue;
        }
        const extracted = await extractLocalThumbnails({
          videoPath,
          videoId,
          uploadsDir,
        });
        autoThumbnails = extracted.urls;
        durationSeconds = extracted.durationSeconds;
      } else {
        const derived = deriveCloudinaryThumbnailUrls(video.filepath);
        if (!derived) {
          summary.skipped += 1;
          continue;
        }
        autoThumbnails = derived.urls;
      }
      const thumbnailUrl =
        autoThumbnails[AUTO_THUMBNAIL_DEFAULT_INDEX] ??
        autoThumbnails[0] ??
        null;
      if (!thumbnailUrl) {
        summary.skipped += 1;
        continue;
      }
      if (!dryRun) {
        const update = {
          autoThumbnails,
          thumbnailUrl,
        };
        if (durationSeconds != null) {
          update.duration = durationSeconds;
          update.durationSec = durationSeconds;
        }
        await Videofile.findByIdAndUpdate(video._id, { $set: update });
      }
      summary.updated += 1;
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({ videoId, error: error.message });
    }
  }
  return summary;
}
