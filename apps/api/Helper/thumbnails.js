"use strict";
// Auto-thumbnails — server-side helpers shared by the video upload
// controller, the PATCH /video/:id controller and the backfill script.
//
// Three pieces, all best-effort except URL validation:
//   1. validateThumbnailUrl() — a pasted thumbnailUrl must point at a
//      reachable image (HEAD, ~5s timeout; a ranged GET fallback when
//      a host rejects HEAD). The body is NEVER downloaded: HEAD only,
//      and the ranged GET reads one byte and cancels the stream.
//   2. extractLocalThumbnails() — the local-storage fallback path:
//      ffprobe-static for the duration, ffmpeg-static for three JPG
//      frames at 5% / 50% / 90%. ffmpeg-static ships ffmpeg only, so
//      ffprobe-static is a separate dependency (both are bundled
//      binaries — the system ffmpeg in this VM and Arman's Windows
//      machine are never relied on, and prod has neither).
//   3. deriveCloudinaryThumbnailUrls() — backfill only: build the
//      three frame URLs for an already-hosted Cloudinary video from
//      its stored video URL (cloud name + public id parsed out of the
//      URL). URL generation is local string building — no network
//      call, no re-upload, no SDK config.
//
// RULE: thumbnail generation must never fail a video upload. The
// controller calls extractLocalThumbnails() inside try/catch and
// continues with no thumbnails when it throws; validateThumbnailUrl()
// is the only piece that rejects a request, and only when the user
// explicitly pasted a thumbnailUrl (a bad pasted URL is a 400, a
// failed auto-generation is not).
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import {
  AUTO_THUMBNAIL_FRACTIONS,
  AUTO_THUMBNAIL_HEIGHT,
  AUTO_THUMBNAIL_WIDTH,
  THUMBNAIL_URL_CHECK_TIMEOUT_MS,
} from "@acube/shared";

// ffmpeg-static's default export is the binary path string;
// ffprobe-static's default export is { path }. Both are resolved
// once here so a missing binary fails loudly at import time in dev,
// not silently per upload.
export const FFMPEG_PATH =
  typeof ffmpegStatic === "string" ? ffmpegStatic : ffmpegStatic?.path;
export const FFPROBE_PATH = ffprobeStatic?.path;

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------- URL check

const THUMBNAIL_URL_ERROR =
  "Thumbnail URL must point to a reachable image";

function isImageResponse(response) {
  if (!response || response.ok !== true) return false;
  const contentType =
    response.headers?.get?.("content-type") ?? "";
  return contentType.toLowerCase().startsWith("image/");
}

// Validate a pasted thumbnail URL. Returns { ok: true } or
// { ok: false, message } — the message is the exact 400 text the
// controller returns, so the wizard's apiError util shows it verbatim.
// `fetchFn` is injectable so tests can mock fetch without touching
// the network; production passes nothing and uses the global fetch.
export async function validateThumbnailUrl(url, fetchFn = globalThis.fetch) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, message: THUMBNAIL_URL_ERROR };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, message: THUMBNAIL_URL_ERROR };
  }
  const timeoutSignal = () =>
    AbortSignal.timeout(THUMBNAIL_URL_CHECK_TIMEOUT_MS);
  let headResponse;
  try {
    headResponse = await fetchFn(url, {
      method: "HEAD",
      signal: timeoutSignal(),
    });
  } catch {
    // Network error / DNS failure / timeout — not a reachable image.
    return { ok: false, message: THUMBNAIL_URL_ERROR };
  }
  if (headResponse.status === 405 || headResponse.status === 501) {
    // The host rejects HEAD (some CDNs / S3 presigned URLs do).
    // Fall back to a ranged GET for a single byte — never the body.
    try {
      const getResponse = await fetchFn(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        signal: timeoutSignal(),
      });
      try {
        await getResponse.body?.cancel?.();
      } catch {
        // Cancelling a finished/failed stream is not a validation
        // failure — the headers already told us what we need.
      }
      return isImageResponse(getResponse)
        ? { ok: true }
        : { ok: false, message: THUMBNAIL_URL_ERROR };
    } catch {
      return { ok: false, message: THUMBNAIL_URL_ERROR };
    }
  }
  return isImageResponse(headResponse)
    ? { ok: true }
    : { ok: false, message: THUMBNAIL_URL_ERROR };
}

// ------------------------------------------------------- local ffmpeg path

// Duration in seconds, via the bundled ffprobe binary. Throws when
// ffprobe cannot read the file or reports no usable duration — the
// caller treats that as "no thumbnails", never as an upload failure.
export async function probeVideoDurationSeconds(
  videoPath,
  { ffprobePath = FFPROBE_PATH } = {},
) {
  if (!ffprobePath) {
    throw new Error("ffprobe binary is not available");
  }
  const { stdout } = await execFileAsync(
    ffprobePath,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      videoPath,
    ],
    { timeout: 15000 },
  );
  const duration = Number(JSON.parse(stdout)?.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`No usable duration for ${videoPath}`);
  }
  return duration;
}

function isJpegFile(filePath) {
  try {
    const header = fs.readFileSync(filePath);
    return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  } catch {
    return false;
  }
}

// Extract three JPG frames from a local video file into uploadsDir.
// Returns { urls, durationSeconds } with urls in 5% / 50% / 90% order
// ("/uploads/<videoId>-thumb-<n>.jpg"). Frames are scaled (aspect
// preserved) + padded to exactly 1280x720. Throws on any failure —
// including a partially-written frame set, which is cleaned up — and
// the caller must catch it and continue the upload without thumbnails.
export async function extractLocalThumbnails({
  videoPath,
  videoId,
  uploadsDir,
  ffmpegPath = FFMPEG_PATH,
  ffprobePath = FFPROBE_PATH,
}) {
  if (!ffmpegPath) {
    throw new Error("ffmpeg binary is not available");
  }
  const durationSeconds = await probeVideoDurationSeconds(videoPath, {
    ffprobePath,
  });
  const written = [];
  try {
    const urls = [];
    for (let i = 0; i < AUTO_THUMBNAIL_FRACTIONS.length; i += 1) {
      const timestamp = Math.max(
        0,
        durationSeconds * AUTO_THUMBNAIL_FRACTIONS[i],
      );
      const filename = `${videoId}-thumb-${i + 1}.jpg`;
      const outPath = path.join(uploadsDir, filename);
      await execFileAsync(
        ffmpegPath,
        [
          "-y",
          "-ss",
          String(timestamp),
          "-i",
          videoPath,
          "-frames:v",
          "1",
          "-vf",
          `scale=${AUTO_THUMBNAIL_WIDTH}:${AUTO_THUMBNAIL_HEIGHT}:force_original_aspect_ratio=decrease,pad=${AUTO_THUMBNAIL_WIDTH}:${AUTO_THUMBNAIL_HEIGHT}:(ow-iw)/2:(oh-ih)/2`,
          outPath,
        ],
        { timeout: 30000 },
      );
      if (!isJpegFile(outPath)) {
        throw new Error(`Frame ${i + 1} for ${videoId} is not a JPEG`);
      }
      written.push(outPath);
      urls.push(`/uploads/${filename}`);
    }
    return { urls, durationSeconds };
  } catch (error) {
    // Never leave a half-generated frame set behind.
    for (const filePath of written) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Best-effort cleanup only.
      }
    }
    throw error;
  }
}

// -------------------------------------------- Cloudinary derivation (backfill)

// Build the three frame URLs for a video ALREADY hosted on Cloudinary,
// from its stored video URL — no re-upload, no network call, no SDK
// config needed (the cloud name and public id are parsed out of the
// URL itself). The transformation string is the same one the eager
// transforms produce (verified against the installed SDK: `c_fill,
// h_720, so_<n>p, w_1280` + `.jpg`). Returns { urls } or null when
// the URL is not a recognisable Cloudinary video URL.
export function deriveCloudinaryThumbnailUrls(videoUrl) {
  if (typeof videoUrl !== "string") return null;
  // https://res.cloudinary.com/<cloud>/video/upload/[v<version>/]<public-id>.mp4
  // (public-id may contain folders, i.e. slashes; the version segment
  // is optional and is dropped — the derived URL carries no version).
  const match = videoUrl.match(
    /^https?:\/\/res\.cloudinary\.com\/([^/]+)\/video\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z0-9]+)?$/i,
  );
  if (!match) return null;
  const [, cloudName, publicId] = match;
  if (!cloudName || !publicId) return null;
  const urls = AUTO_THUMBNAIL_FRACTIONS.map(
    (fraction) =>
      `https://res.cloudinary.com/${cloudName}/video/upload/` +
      `c_fill,h_${AUTO_THUMBNAIL_HEIGHT},so_${Math.round(fraction * 100)}p,` +
      `w_${AUTO_THUMBNAIL_WIDTH}/${publicId}.jpg`,
  );
  return { urls };
}
