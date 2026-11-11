// Auto-thumbnails on the LOCAL fallback path (no Cloudinary).
//
// Deliberately does NOT mock ../cloudinary.js: these tests prove the
// real ffmpeg path (ffmpeg-static + ffprobe-static, the bundled
// binaries — never the system ffmpeg) generates three real JPG
// frames from an actual video, and that the upload still succeeds
// with no thumbnails when extraction cannot run (fake bytes).
// A deterministic 10s fixture video is generated with the bundled
// ffmpeg binary itself (testsrc), so no committed fixture file and
// no system ffmpeg are needed.
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
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { api, authHeader, createUser } from "./helpers.js";
import Videofile from "../Models/videofile.js";

const CLOUDINARY_VARS = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];
const savedEnv = {};
const uploadsDir = path.join(process.cwd(), "uploads");
let beforeFiles = [];
let fixturePath = "";

const ONE_PX_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

beforeAll(() => {
  for (const key of CLOUDINARY_VARS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  beforeFiles = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
  // Deterministic fixture: 10s, 320x240, 30fps test pattern.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acube-thumb-fixture-"));
  fixturePath = path.join(tmpDir, "fixture.mp4");
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
  for (const key of CLOUDINARY_VARS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  if (fixturePath) {
    fs.rmSync(path.dirname(fixturePath), { recursive: true, force: true });
  }
  if (!fs.existsSync(uploadsDir)) return;
  for (const file of fs.readdirSync(uploadsDir)) {
    if (!beforeFiles.includes(file)) {
      fs.unlinkSync(path.join(uploadsDir, file));
    }
  }
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "image/jpeg" },
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function isJpeg(buffer) {
  return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

describe("POST /video/uploadvideo — local ffmpeg thumbnails", () => {
  it("extracts 3 real JPG frames from a real video; middle frame is the thumbnail", async () => {
    const user = await createUser();
    const res = await api
      .post("/video/uploadvideo")
      .set(authHeader(user))
      .attach("file", fixturePath, { contentType: "video/mp4" })
      .field("title", "Real local video")
      .field("chanel", "test-channel");
    expect(res.status).toBe(200);
    const thumbs = res.body.video.autoThumbnails;
    expect(thumbs).toHaveLength(3);
    for (const url of thumbs) {
      expect(url).toMatch(/^\/uploads\/[0-9a-f]{24}-thumb-[123]\.jpg$/);
      const filePath = path.join(uploadsDir, path.basename(url));
      expect(fs.existsSync(filePath)).toBe(true);
      const bytes = fs.readFileSync(filePath);
      expect(isJpeg(bytes)).toBe(true);
      expect(bytes.length).toBeGreaterThan(1000);
      // The frame is served at its /uploads URL.
      const served = await api.get(url);
      expect(served.status).toBe(200);
      expect(served.headers["content-type"]).toMatch(/image\/jpeg/);
    }
    expect(res.body.video.thumbnailUrl).toBe(thumbs[1]);
    const saved = await Videofile.findById(res.body.video.id);
    expect(saved.autoThumbnails).toEqual(thumbs);
    expect(saved.thumbnailUrl).toBe(thumbs[1]);
    // The probe also stores the real duration (10s fixture).
    expect(saved.duration).toBeCloseTo(10, 0);
    expect(saved.durationSec).toBeCloseTo(10, 0);
  });

  it("upload still succeeds with thumbnailUrl null when extraction cannot run (fake bytes)", async () => {
    const user = await createUser();
    const res = await api
      .post("/video/uploadvideo")
      .set(authHeader(user))
      .attach("file", Buffer.from("fake-mp4-bytes"), {
        filename: "clip.mp4",
        contentType: "video/mp4",
      })
      .field("title", "Fake local video")
      .field("chanel", "test-channel");
    expect(res.status).toBe(200);
    expect(res.body.video.thumbnailUrl).toBeNull();
    expect(res.body.video.autoThumbnails).toEqual([]);
    const saved = await Videofile.findById(res.body.video.id);
    expect(saved.thumbnailUrl).toBeNull();
    expect(saved.duration).toBeNull();
  });

  it("a supplied thumbnail file wins locally and is stored under /uploads", async () => {
    const user = await createUser();
    const res = await api
      .post("/video/uploadvideo")
      .set(authHeader(user))
      .attach("file", fixturePath, { contentType: "video/mp4" })
      .attach("thumbnail", ONE_PX_PNG, {
        filename: "thumb.png",
        contentType: "image/png",
      })
      .field("title", "Local file wins")
      .field("chanel", "test-channel");
    expect(res.status).toBe(200);
    expect(res.body.video.thumbnailUrl).toMatch(
      /^\/uploads\/[^/]+\.png$/,
    );
    expect(
      fs.existsSync(
        path.join(uploadsDir, path.basename(res.body.video.thumbnailUrl)),
      ),
    ).toBe(true);
    // With a file supplied, no ffmpeg frames are generated.
    expect(res.body.video.autoThumbnails).toEqual([]);
  });

  it("a supplied URL wins locally (no ffmpeg frames generated)", async () => {
    const user = await createUser();
    const res = await api
      .post("/video/uploadvideo")
      .set(authHeader(user))
      .attach("file", fixturePath, { contentType: "video/mp4" })
      .field("title", "Local URL wins")
      .field("chanel", "test-channel")
      .field("thumbnailUrl", "https://example.com/pasted.jpg");
    expect(res.status).toBe(200);
    expect(res.body.video.thumbnailUrl).toBe("https://example.com/pasted.jpg");
    expect(res.body.video.autoThumbnails).toEqual([]);
  });

  it("rejects a non-JPG/PNG thumbnail file with 400", async () => {
    const user = await createUser();
    const res = await api
      .post("/video/uploadvideo")
      .set(authHeader(user))
      .attach("file", fixturePath, { contentType: "video/mp4" })
      .attach("thumbnail", Buffer.from("not an image"), {
        filename: "thumb.gif",
        contentType: "image/gif",
      })
      .field("title", "Bad thumb MIME local")
      .field("chanel", "test-channel");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toMatch(/JPG and PNG/);
  });

  it("rejects a thumbnail file over 5 MB with 400", async () => {
    const user = await createUser();
    const res = await api
      .post("/video/uploadvideo")
      .set(authHeader(user))
      .attach("file", fixturePath, { contentType: "video/mp4" })
      .attach("thumbnail", Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: "thumb.png",
        contentType: "image/png",
      })
      .field("title", "Big thumb local")
      .field("chanel", "test-channel");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toMatch(/5 MB/);
  });

  it("rejects an unreachable pasted thumbnail URL with 400", async () => {
    const user = await createUser();
    vi.stubGlobal("fetch", async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    });
    const res = await api
      .post("/video/uploadvideo")
      .set(authHeader(user))
      .attach("file", fixturePath, { contentType: "video/mp4" })
      .field("title", "Unreachable thumb URL local")
      .field("chanel", "test-channel")
      .field("thumbnailUrl", "https://unreachable.invalid/thumb.jpg");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toBe(
      "Thumbnail URL must point to a reachable image",
    );
  });
});

// Silence the fallback console.warn in this file's output — the warn
// is the feature (explicit, never silent), the test asserts behaviour.
vi.spyOn(console, "warn").mockImplementation(() => {});
