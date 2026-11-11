// Unit tests for Helper/thumbnails.js (URL validation, ffmpeg
// extraction, Cloudinary derivation) and Helper/thumbnailBackfill.js.
// No network is touched: fetch is mocked per case, and the fixture
// video is generated with the bundled ffmpeg binary (see
// video-auto-thumbnails-local.test.js for the API-level proof).
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import {
  deriveCloudinaryThumbnailUrls,
  extractLocalThumbnails,
  probeVideoDurationSeconds,
  validateThumbnailUrl,
} from "../Helper/thumbnails.js";
import { backfillThumbnails } from "../Helper/thumbnailBackfill.js";
import { createVideo } from "./helpers.js";
import Videofile from "../Models/videofile.js";

const uploadsDir = path.join(process.cwd(), "uploads");
let beforeFiles = [];
let fixturePath = "";
let fixtureDir = "";

beforeAll(() => {
  beforeFiles = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "acube-thumb-unit-"));
  fixturePath = path.join(fixtureDir, "fixture.mp4");
  execFileSync(
    ffmpegPath,
    [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=10:size=320x240:rate=30",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      fixturePath,
    ],
    { timeout: 60000 },
  );
});

afterAll(() => {
  if (fixtureDir) {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
  if (!fs.existsSync(uploadsDir)) return;
  for (const file of fs.readdirSync(uploadsDir)) {
    if (!beforeFiles.includes(file)) {
      fs.unlinkSync(path.join(uploadsDir, file));
    }
  }
});

const imageHead = async () => ({
  ok: true,
  status: 200,
  headers: { get: () => "image/jpeg" },
});
const htmlHead = async () => ({
  ok: true,
  status: 200,
  headers: { get: () => "text/html; charset=utf-8" },
});

describe("validateThumbnailUrl()", () => {
  it("accepts an image content-type, HEAD only (no GET issued)", async () => {
    const calls = [];
    const fetchFn = async (url, options) => {
      calls.push(options?.method);
      return imageHead();
    };
    expect(
      await validateThumbnailUrl("https://example.com/t.jpg", fetchFn),
    ).toEqual({ ok: true });
    expect(calls).toEqual(["HEAD"]);
  });

  it("rejects HTML content-type", async () => {
    const result = await validateThumbnailUrl(
      "https://example.com/page",
      htmlHead,
    );
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Thumbnail URL must point to a reachable image");
  });

  it("rejects non-2xx responses", async () => {
    const fetchFn = async () => ({
      ok: false,
      status: 404,
      headers: { get: () => "image/jpeg" },
    });
    expect(
      (await validateThumbnailUrl("https://example.com/missing.jpg", fetchFn))
        .ok,
    ).toBe(false);
  });

  it("rejects network errors and non-http(s) URLs", async () => {
    const failing = async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    };
    expect(
      (await validateThumbnailUrl("https://unreachable.invalid/t.jpg", failing))
        .ok,
    ).toBe(false);
    expect(
      (await validateThumbnailUrl("ftp://example.com/t.jpg", imageHead)).ok,
    ).toBe(false);
    expect(
      (await validateThumbnailUrl("not-a-url", imageHead)).ok,
    ).toBe(false);
  });

  it("falls back to a ranged GET when the host rejects HEAD (405), and only then", async () => {
    const calls = [];
    const fetchFn = async (url, options) => {
      calls.push({ method: options?.method, range: options?.headers?.Range });
      if (options?.method === "HEAD") {
        return { ok: false, status: 405, headers: { get: () => "" } };
      }
      return {
        ok: true,
        status: 206,
        headers: { get: () => "image/png" },
        body: { cancel: async () => {} },
      };
    };
    expect(
      await validateThumbnailUrl("https://example.com/t.png", fetchFn),
    ).toEqual({ ok: true });
    expect(calls).toEqual([
      { method: "HEAD", range: undefined },
      { method: "GET", range: "bytes=0-0" },
    ]);
  });

  it("rejects when the ranged-GET fallback also answers non-image", async () => {
    const fetchFn = async (url, options) => {
      if (options?.method === "HEAD") {
        return { ok: false, status: 405, headers: { get: () => "" } };
      }
      return {
        ok: true,
        status: 206,
        headers: { get: () => "text/html" },
        body: { cancel: async () => {} },
      };
    };
    expect(
      (await validateThumbnailUrl("https://example.com/page", fetchFn)).ok,
    ).toBe(false);
  });
});

describe("probeVideoDurationSeconds() + extractLocalThumbnails()", () => {
  it("probes the 10s fixture duration", async () => {
    expect(await probeVideoDurationSeconds(fixturePath)).toBeCloseTo(10, 1);
  });

  it("extracts 3 valid JPEGs at 1280x720 into uploads/", async () => {
    const videoId = "unit1234567890abcdef1234";
    const { urls, durationSeconds } = await extractLocalThumbnails({
      videoPath: fixturePath,
      videoId,
      uploadsDir,
    });
    expect(durationSeconds).toBeCloseTo(10, 1);
    expect(urls).toEqual([
      `/uploads/${videoId}-thumb-1.jpg`,
      `/uploads/${videoId}-thumb-2.jpg`,
      `/uploads/${videoId}-thumb-3.jpg`,
    ]);
    for (const url of urls) {
      const bytes = fs.readFileSync(path.join(uploadsDir, path.basename(url)));
      expect(bytes[0]).toBe(0xff);
      expect(bytes[1]).toBe(0xd8);
      expect(bytes[2]).toBe(0xff);
      expect(bytes.length).toBeGreaterThan(1000);
    }
  });

  it("throws (and leaves no frames) for a non-video file", async () => {
    const fakePath = path.join(fixtureDir, "fake.mp4");
    fs.writeFileSync(fakePath, "fake-mp4-bytes");
    await expect(
      extractLocalThumbnails({
        videoPath: fakePath,
        videoId: "unitbad1234567890abcdef",
        uploadsDir,
      }),
    ).rejects.toThrow();
    expect(
      fs
        .readdirSync(uploadsDir)
        .some((f) => f.startsWith("unitbad1234567890abcdef-thumb-")),
    ).toBe(false);
  });
});

describe("deriveCloudinaryThumbnailUrls()", () => {
  it("derives 5/50/90 frame URLs from a versioned Cloudinary video URL", () => {
    expect(
      deriveCloudinaryThumbnailUrls(
        "https://res.cloudinary.com/demo-cloud/video/upload/v1753456789/folder/clip.mp4",
      ),
    ).toEqual({
      urls: [
        "https://res.cloudinary.com/demo-cloud/video/upload/c_fill,h_720,so_5p,w_1280/folder/clip.jpg",
        "https://res.cloudinary.com/demo-cloud/video/upload/c_fill,h_720,so_50p,w_1280/folder/clip.jpg",
        "https://res.cloudinary.com/demo-cloud/video/upload/c_fill,h_720,so_90p,w_1280/folder/clip.jpg",
      ],
    });
  });

  it("works without a version segment and returns null for non-Cloudinary URLs", () => {
    const derived = deriveCloudinaryThumbnailUrls(
      "https://res.cloudinary.com/demo-cloud/video/upload/clip.mp4",
    );
    expect(derived.urls[0]).toBe(
      "https://res.cloudinary.com/demo-cloud/video/upload/c_fill,h_720,so_5p,w_1280/clip.jpg",
    );
    expect(deriveCloudinaryThumbnailUrls("https://example.com/clip.mp4")).toBeNull();
    expect(deriveCloudinaryThumbnailUrls("/uploads/clip.mp4")).toBeNull();
    expect(deriveCloudinaryThumbnailUrls(null)).toBeNull();
  });
});

describe("backfillThumbnails()", () => {
  it("backfills a local video (real frames) and a Cloudinary video (derived URLs), skips the rest", async () => {
    // Local video: real fixture copied into uploads/.
    const localName = `backfill-${Date.now()}.mp4`;
    fs.copyFileSync(fixturePath, path.join(uploadsDir, localName));
    const localVideo = await createVideo({
      filepath: `/uploads/${localName}`,
      thumbnailUrl: null,
    });
    const cloudVideo = await createVideo({
      filepath:
        "https://res.cloudinary.com/demo-cloud/video/upload/v1753456789/backfill-clip.mp4",
      thumbnailUrl: null,
    });
    // Already has a thumbnail — untouched.
    const doneVideo = await createVideo({
      filepath:
        "https://res.cloudinary.com/demo-cloud/video/upload/v1753456789/done.mp4",
      thumbnailUrl: "https://example.com/keep.jpg",
    });
    // Local file missing — skipped, not failed.
    const missingVideo = await createVideo({
      filepath: "/uploads/does-not-exist.mp4",
      thumbnailUrl: null,
    });

    const summary = await backfillThumbnails();
    expect(summary.examined).toBe(3);
    expect(summary.updated).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(summary.failed).toBe(0);

    const local = await Videofile.findById(localVideo._id);
    expect(local.autoThumbnails).toHaveLength(3);
    expect(local.thumbnailUrl).toBe(local.autoThumbnails[1]);
    expect(local.duration).toBeCloseTo(10, 0);
    for (const url of local.autoThumbnails) {
      expect(
        fs.existsSync(path.join(uploadsDir, path.basename(url))),
      ).toBe(true);
    }
    const cloud = await Videofile.findById(cloudVideo._id);
    expect(cloud.autoThumbnails).toEqual([
      "https://res.cloudinary.com/demo-cloud/video/upload/c_fill,h_720,so_5p,w_1280/backfill-clip.jpg",
      "https://res.cloudinary.com/demo-cloud/video/upload/c_fill,h_720,so_50p,w_1280/backfill-clip.jpg",
      "https://res.cloudinary.com/demo-cloud/video/upload/c_fill,h_720,so_90p,w_1280/backfill-clip.jpg",
    ]);
    expect(cloud.thumbnailUrl).toBe(cloud.autoThumbnails[1]);
    const done = await Videofile.findById(doneVideo._id);
    expect(done.thumbnailUrl).toBe("https://example.com/keep.jpg");
    const missing = await Videofile.findById(missingVideo._id);
    expect(missing.thumbnailUrl).toBeNull();

    // Idempotent: a second run finds only the missing-file video
    // left, and updates nothing.
    const second = await backfillThumbnails();
    expect(second.examined).toBe(1);
    expect(second.updated).toBe(0);
    expect(second.skipped).toBe(1);
  });

  it("dry-run reports without writing", async () => {
    const cloudVideo = await createVideo({
      filepath:
        "https://res.cloudinary.com/demo-cloud/video/upload/v1753456789/dry.mp4",
      thumbnailUrl: null,
    });
    const summary = await backfillThumbnails({ dryRun: true });
    expect(summary.updated).toBe(1);
    expect(summary.dryRun).toBe(true);
    const untouched = await Videofile.findById(cloudVideo._id);
    expect(untouched.thumbnailUrl).toBeNull();
    expect(untouched.autoThumbnails).toEqual([]);
  });
});
