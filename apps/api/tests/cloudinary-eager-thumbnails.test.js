// Cloudinary eager thumbnails (SDK level).
//
// Proves, against a mocked `cloudinary` npm package (same pattern as
// video-upload-cloudinary-lazy-config.test.js — the real SDK would hit
// api.cloudinary.com, which no test may do):
//   * a video upload passes exactly three eager transforms (JPG
//     1280x720 crop-fill at start_offset 5% / 50% / 90%);
//   * an image upload (banner/avatar) passes NO eager;
//   * an eager failure never fails the upload: the upload is retried
//     once without eager and still succeeds;
//   * extractEagerThumbnailUrls() reads the eager array off the
//     upload response (the shape the real SDK returns — `eager` is
//     NOT in the typed UploadApiResponse, so this is verified here
//     against the mocked response, not assumed from the typings).
import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cloudinaryMock = vi.hoisted(() => {
  let configured = {};
  let uploadCalls = [];
  // failEagerOnce: the next upload WITH eager throws (simulating a
  // bad eager transform); uploads without eager always succeed.
  let failEagerOnce = false;
  return {
    config: (cfg) => {
      configured = { ...configured, ...(cfg ?? {}) };
    },
    upload: async (localFilePath, options) => {
      uploadCalls.push({ localFilePath, options: { ...(options ?? {}) } });
      if (!configured.api_key) {
        throw new Error("Must supply api_key");
      }
      if (options?.eager && failEagerOnce) {
        failEagerOnce = false;
        throw new Error("Invalid eager transformation");
      }
      return {
        secure_url: "https://res.cloudinary.com/test/video/upload/v1/fake.mp4",
        url: "http://res.cloudinary.com/test/video/upload/v1/fake.mp4",
        duration: 12.5,
        thumbnail_url:
          "https://res.cloudinary.com/test/image/upload/v1/fake.jpg",
        eager: [
          { secure_url: "https://res.cloudinary.com/test/eager-1.jpg" },
          { secure_url: "https://res.cloudinary.com/test/eager-2.jpg" },
          { secure_url: "https://res.cloudinary.com/test/eager-3.jpg" },
        ],
      };
    },
    getUploadCalls: () => [...uploadCalls],
    setFailEagerOnce: () => {
      failEagerOnce = true;
    },
    reset: () => {
      configured = {};
      uploadCalls = [];
      failEagerOnce = false;
    },
  };
});

vi.mock("cloudinary", () => ({
  v2: {
    config: cloudinaryMock.config,
    uploader: { upload: cloudinaryMock.upload },
  },
}));

const TEST_ENV = {
  CLOUDINARY_CLOUD_NAME: "test-cloud-name",
  CLOUDINARY_API_KEY: "test-api-key",
  CLOUDINARY_API_SECRET: "test-api-secret",
};

beforeEach(() => {
  cloudinaryMock.reset();
  for (const [key, value] of Object.entries(TEST_ENV)) {
    process.env[key] = value;
  }
});

function tmpVideoFile() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acube-eager-"));
  const tmpFile = path.join(tmpDir, "clip.mp4");
  fs.writeFileSync(tmpFile, "fake-mp4-bytes");
  return { tmpDir, tmpFile };
}

describe("uploadOnCloudinary — eager thumbnails", () => {
  it("passes three eager JPG 1280x720 transforms at 5% / 50% / 90% for video", async () => {
    const { uploadOnCloudinary } = await import("../cloudinary.js");
    const { tmpDir, tmpFile } = tmpVideoFile();
    try {
      const result = await uploadOnCloudinary(tmpFile);
      expect(result).not.toBeNull();
      const calls = cloudinaryMock.getUploadCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].options.resource_type).toBe("video");
      expect(calls[0].options.eager).toEqual([
        {
          width: 1280,
          height: 720,
          crop: "fill",
          format: "jpg",
          start_offset: "5%",
        },
        {
          width: 1280,
          height: 720,
          crop: "fill",
          format: "jpg",
          start_offset: "50%",
        },
        {
          width: 1280,
          height: 720,
          crop: "fill",
          format: "jpg",
          start_offset: "90%",
        },
      ]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("passes NO eager for image uploads (banner/avatar)", async () => {
    const { uploadOnCloudinary } = await import("../cloudinary.js");
    const { tmpDir, tmpFile } = tmpVideoFile();
    try {
      const result = await uploadOnCloudinary(tmpFile, "image");
      expect(result).not.toBeNull();
      const calls = cloudinaryMock.getUploadCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].options.resource_type).toBe("image");
      expect(calls[0].options.eager).toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("retries once without eager when eager generation fails — the upload still succeeds", async () => {
    const { uploadOnCloudinary } = await import("../cloudinary.js");
    const { tmpDir, tmpFile } = tmpVideoFile();
    try {
      cloudinaryMock.setFailEagerOnce();
      const result = await uploadOnCloudinary(tmpFile);
      expect(result).not.toBeNull();
      expect(result.secure_url).toMatch(/res\.cloudinary\.com/);
      const calls = cloudinaryMock.getUploadCalls();
      expect(calls).toHaveLength(2);
      expect(calls[0].options.eager).toHaveLength(3);
      expect(calls[1].options.eager).toBeUndefined();
      expect(calls[1].options.resource_type).toBe("video");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns null when the upload itself fails (no eager to blame)", async () => {
    const { uploadOnCloudinary } = await import("../cloudinary.js");
    const { tmpDir, tmpFile } = tmpVideoFile();
    try {
      delete process.env.CLOUDINARY_API_KEY;
      const result = await uploadOnCloudinary(tmpFile, "image");
      expect(result).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("extractEagerThumbnailUrls()", () => {
  it("reads secure_url entries from the eager array, in order", async () => {
    const { extractEagerThumbnailUrls } = await import("../cloudinary.js");
    expect(
      extractEagerThumbnailUrls({
        eager: [
          { secure_url: "https://a/1.jpg", url: "http://a/1.jpg" },
          { url: "http://b/2.jpg" },
          { secure_url: "https://c/3.jpg" },
          {},
          { secure_url: 42 },
        ],
      }),
    ).toEqual(["https://a/1.jpg", "http://b/2.jpg", "https://c/3.jpg"]);
  });

  it("returns [] when the response has no eager array", async () => {
    const { extractEagerThumbnailUrls } = await import("../cloudinary.js");
    expect(extractEagerThumbnailUrls({})).toEqual([]);
    expect(extractEagerThumbnailUrls(null)).toEqual([]);
    expect(extractEagerThumbnailUrls({ eager: "not-an-array" })).toEqual([]);
  });
});
