// Auto-thumbnails on the Cloudinary upload path (mocked SDK).
//
// Precedence under test — file > pasted URL > auto frame — plus the
// thumbnail-file validation (JPG/PNG, 5 MB, same rule as
// banner/avatar), the pasted-URL validation (mocked fetch, no real
// network), and the rule that a failed thumbnail generation never
// fails the upload. The local fallback path is covered separately in
// video-auto-thumbnails-local.test.js (this file mocks
// ../cloudinary.js, which is file-scoped in vitest).
import {
  describe,
  expect,
  it,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import fs from "node:fs";
import path from "node:path";
import { api, authHeader, createUser, createVideo } from "./helpers.js";
import Videofile from "../Models/videofile.js";

const MOCK_EAGER_URLS = [
  "https://res.cloudinary.com/test/video/upload/auto-1.jpg",
  "https://res.cloudinary.com/test/video/upload/auto-2.jpg",
  "https://res.cloudinary.com/test/video/upload/auto-3.jpg",
];
const MOCK_THUMBNAIL_FILE_URL =
  "https://res.cloudinary.com/test/image/upload/thumb-file.jpg";
const MOCK_VIDEO_URL =
  "https://res.cloudinary.com/test/video/upload/test.mp4";

// Mutable mock behaviour (toggled per test): includeEager /
// includeLegacyThumbnail control what the mocked upload response
// carries; imageUploadFails makes the thumbnail-file upload fail.
const cloudinaryState = vi.hoisted(() => ({
  includeEager: true,
  includeLegacyThumbnail: true,
  imageUploadFails: false,
}));

vi.mock("../cloudinary.js", () => ({
  isCloudinaryConfigured: vi.fn(() => true),
  uploadOnCloudinary: vi.fn(async (localFilePath, resourceType = "video") => {
    if (resourceType === "image") {
      if (cloudinaryState.imageUploadFails) return null;
      return {
        secure_url: MOCK_THUMBNAIL_FILE_URL,
        url: MOCK_THUMBNAIL_FILE_URL.replace("https://", "http://"),
      };
    }
    return {
      url: MOCK_VIDEO_URL.replace("https://", "http://"),
      secure_url: MOCK_VIDEO_URL,
      duration: 42,
      thumbnail_url: cloudinaryState.includeLegacyThumbnail
        ? "https://res.cloudinary.com/test/video/upload/test.jpg"
        : undefined,
      eager: cloudinaryState.includeEager
        ? MOCK_EAGER_URLS.map((secure_url) => ({ secure_url }))
        : undefined,
    };
  }),
  extractEagerThumbnailUrls: (response) => {
    const eager = response?.eager;
    if (!Array.isArray(eager)) return [];
    return eager
      .map((entry) => entry?.secure_url ?? entry?.url)
      .filter((url) => typeof url === "string" && /^https?:\/\//.test(url));
  },
}));

// A 1x1 PNG (valid bytes; multer/the controller only check MIME +
// size, but a real PNG keeps the test honest).
const ONE_PX_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const uploadsDir = path.join(process.cwd(), "uploads");
let beforeFiles = [];

beforeAll(() => {
  beforeFiles = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
});

afterAll(() => {
  if (!fs.existsSync(uploadsDir)) return;
  for (const file of fs.readdirSync(uploadsDir)) {
    if (!beforeFiles.includes(file)) {
      fs.unlinkSync(path.join(uploadsDir, file));
    }
  }
});

function stubFetchImage() {
  vi.stubGlobal(
    "fetch",
    async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "image/jpeg" },
    }),
  );
}

beforeEach(() => {
  cloudinaryState.includeEager = true;
  cloudinaryState.includeLegacyThumbnail = true;
  cloudinaryState.imageUploadFails = false;
  stubFetchImage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function uploadMp4(user, fields = {}, thumbnailAttach = null) {
  const req = api
    .post("/video/uploadvideo")
    .set(authHeader(user))
    .attach("file", Buffer.from("fake-mp4-bytes"), {
      filename: "clip.mp4",
      contentType: "video/mp4",
    });
  if (thumbnailAttach) {
    req.attach(
      "thumbnail",
      thumbnailAttach.buffer,
      {
        filename: thumbnailAttach.filename,
        contentType: thumbnailAttach.contentType,
      },
    );
  }
  for (const [key, value] of Object.entries(fields)) {
    req.field(key, value);
  }
  return req;
}

describe("POST /video/uploadvideo — thumbnail precedence (Cloudinary path)", () => {
  it("file beats URL beats auto: thumbnail file wins, eager stills still stored", async () => {
    const user = await createUser();
    const res = await uploadMp4(
      user,
      {
        title: "File wins",
        chanel: "test-channel",
        thumbnailUrl: "https://example.com/pasted.jpg",
      },
      { buffer: ONE_PX_PNG, filename: "thumb.png", contentType: "image/png" },
    );
    expect(res.status).toBe(200);
    expect(res.body.video.thumbnailUrl).toBe(MOCK_THUMBNAIL_FILE_URL);
    expect(res.body.video.autoThumbnails).toEqual(MOCK_EAGER_URLS);
    const saved = await Videofile.findById(res.body.video.id);
    expect(saved.thumbnailUrl).toBe(MOCK_THUMBNAIL_FILE_URL);
    expect(saved.autoThumbnails).toEqual(MOCK_EAGER_URLS);
  });

  it("file wins even when the pasted URL would fail validation (URL is ignored, not validated)", async () => {
    const user = await createUser();
    vi.stubGlobal("fetch", async () => {
      throw new Error("DNS failure");
    });
    const res = await uploadMp4(
      user,
      {
        title: "File wins over bad URL",
        chanel: "test-channel",
        thumbnailUrl: "https://unreachable.invalid/thumb.jpg",
      },
      { buffer: ONE_PX_PNG, filename: "thumb.png", contentType: "image/png" },
    );
    expect(res.status).toBe(200);
    expect(res.body.video.thumbnailUrl).toBe(MOCK_THUMBNAIL_FILE_URL);
  });

  it("URL beats auto: pasted URL is the thumbnail, eager stills are the candidates", async () => {
    const user = await createUser();
    const res = await uploadMp4(user, {
      title: "URL wins",
      chanel: "test-channel",
      thumbnailUrl: "https://example.com/pasted.jpg",
    });
    expect(res.status).toBe(200);
    expect(res.body.video.thumbnailUrl).toBe("https://example.com/pasted.jpg");
    expect(res.body.video.autoThumbnails).toEqual(MOCK_EAGER_URLS);
  });

  it("auto only: no file/URL → thumbnailUrl is the middle (50%) eager frame", async () => {
    const user = await createUser();
    const res = await uploadMp4(user, {
      title: "Auto only",
      chanel: "test-channel",
    });
    expect(res.status).toBe(200);
    expect(res.body.video.thumbnailUrl).toBe(MOCK_EAGER_URLS[1]);
    expect(res.body.video.autoThumbnails).toEqual(MOCK_EAGER_URLS);
  });

  it("no eager stills → legacy Cloudinary thumbnail_url is the fallback", async () => {
    cloudinaryState.includeEager = false;
    const user = await createUser();
    const res = await uploadMp4(user, {
      title: "Legacy fallback",
      chanel: "test-channel",
    });
    expect(res.status).toBe(200);
    expect(res.body.video.autoThumbnails).toEqual([]);
    expect(res.body.video.thumbnailUrl).toBe(
      "https://res.cloudinary.com/test/video/upload/test.jpg",
    );
  });

  it("upload still succeeds with thumbnailUrl null when NO thumbnail can be generated", async () => {
    cloudinaryState.includeEager = false;
    cloudinaryState.includeLegacyThumbnail = false;
    const user = await createUser();
    const res = await uploadMp4(user, {
      title: "No thumbnails at all",
      chanel: "test-channel",
    });
    expect(res.status).toBe(200);
    expect(res.body.video.thumbnailUrl).toBeNull();
    expect(res.body.video.autoThumbnails).toEqual([]);
    const saved = await Videofile.findById(res.body.video.id);
    expect(saved.thumbnailUrl).toBeNull();
    expect(saved.autoThumbnails).toEqual([]);
  });

  it("a failed thumbnail-file upload falls back to the auto frame, not a failed upload", async () => {
    cloudinaryState.imageUploadFails = true;
    const user = await createUser();
    const res = await uploadMp4(
      user,
      { title: "Thumb upload fails", chanel: "test-channel" },
      { buffer: ONE_PX_PNG, filename: "thumb.png", contentType: "image/png" },
    );
    expect(res.status).toBe(200);
    expect(res.body.video.thumbnailUrl).toBe(MOCK_EAGER_URLS[1]);
  });
});

describe("POST /video/uploadvideo — thumbnail file validation", () => {
  it("rejects a non-JPG/PNG thumbnail file with 400 VALIDATION_ERROR", async () => {
    const user = await createUser();
    const res = await uploadMp4(
      user,
      { title: "Bad thumb MIME", chanel: "test-channel" },
      {
        buffer: Buffer.from("not an image"),
        filename: "thumb.gif",
        contentType: "image/gif",
      },
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toMatch(/JPG and PNG/);
  });

  it("rejects a thumbnail file over 5 MB with 400", async () => {
    const user = await createUser();
    const res = await uploadMp4(
      user,
      { title: "Big thumb", chanel: "test-channel" },
      {
        buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
        filename: "thumb.png",
        contentType: "image/png",
      },
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toMatch(/5 MB/);
  });

  it("accepts a JPEG thumbnail file", async () => {
    const user = await createUser();
    const res = await uploadMp4(
      user,
      { title: "JPEG thumb", chanel: "test-channel" },
      {
        buffer: ONE_PX_PNG,
        filename: "thumb.jpg",
        contentType: "image/jpeg",
      },
    );
    expect(res.status).toBe(200);
    expect(res.body.video.thumbnailUrl).toBe(MOCK_THUMBNAIL_FILE_URL);
  });
});

describe("POST /video/uploadvideo — pasted thumbnailUrl validation", () => {
  it("rejects an unreachable thumbnail URL with 400", async () => {
    const user = await createUser();
    vi.stubGlobal("fetch", async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    });
    const res = await uploadMp4(user, {
      title: "Unreachable thumb URL",
      chanel: "test-channel",
      thumbnailUrl: "https://unreachable.invalid/thumb.jpg",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toBe(
      "Thumbnail URL must point to a reachable image",
    );
  });

  it("rejects a thumbnail URL that answers HTML with 400", async () => {
    const user = await createUser();
    vi.stubGlobal(
      "fetch",
      async () => ({
        ok: true,
        status: 200,
        headers: { get: () => "text/html; charset=utf-8" },
      }),
    );
    const res = await uploadMp4(user, {
      title: "HTML thumb URL",
      chanel: "test-channel",
      thumbnailUrl: "https://example.com/page",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toBe(
      "Thumbnail URL must point to a reachable image",
    );
  });

  it("rejects a thumbnail URL that answers non-2xx with 400", async () => {
    const user = await createUser();
    vi.stubGlobal(
      "fetch",
      async () => ({
        ok: false,
        status: 404,
        headers: { get: () => "image/jpeg" },
      }),
    );
    const res = await uploadMp4(user, {
      title: "404 thumb URL",
      chanel: "test-channel",
      thumbnailUrl: "https://example.com/missing.jpg",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("accepts a thumbnail URL that answers image/*", async () => {
    const user = await createUser();
    const res = await uploadMp4(user, {
      title: "Good thumb URL",
      chanel: "test-channel",
      thumbnailUrl: "https://example.com/thumb.png",
    });
    expect(res.status).toBe(200);
    expect(res.body.video.thumbnailUrl).toBe("https://example.com/thumb.png");
  });
});

describe("PATCH /video/:id — pasted thumbnailUrl validation", () => {
  it("rejects an HTML thumbnail URL with 400 and accepts an image URL", async () => {
    const user = await createUser();
    const video = await createVideo({ videochanel: String(user._id) });
    vi.stubGlobal(
      "fetch",
      async () => ({
        ok: true,
        status: 200,
        headers: { get: () => "text/html" },
      }),
    );
    const bad = await api
      .patch(`/video/${video._id}`)
      .set(authHeader(user))
      .send({ thumbnailUrl: "https://example.com/page" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");
    stubFetchImage();
    const good = await api
      .patch(`/video/${video._id}`)
      .set(authHeader(user))
      .send({ thumbnailUrl: "https://example.com/thumb.jpg" });
    expect(good.status).toBe(200);
    expect(good.body.thumbnailUrl).toBe("https://example.com/thumb.jpg");
  });
});
