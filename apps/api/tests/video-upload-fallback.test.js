// Upload-wizard fix — local-storage fallback (no Cloudinary).
//
// Deliberately does NOT mock ../cloudinary.js (unlike video.test.js):
// these tests prove the real controller succeeds when NO Cloudinary
// credentials are configured, which was the Step 2/3 400
// ("Failed to upload video to cloudinary"). The fallback stores the
// multer file under uploads/ and serves it at /uploads/<filename>.
// Multer still writes the received file to apps/api/uploads, so the
// suite cleans up any files it creates there.
import { describe, expect, it, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { api, authHeader, createUser } from "./helpers.js";
import Videofile from "../Models/videofile.js";
import { isCloudinaryConfigured } from "../cloudinary.js";

const uploadsDir = path.join(process.cwd(), "uploads");
let beforeFiles = [];

const CLOUDINARY_VARS = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];
const savedEnv = {};

beforeAll(() => {
  // The fallback only runs with no credentials at all — make the test
  // independent of whatever the developer's shell exports.
  for (const key of CLOUDINARY_VARS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  beforeFiles = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
  expect(isCloudinaryConfigured()).toBe(false);
});

afterAll(() => {
  for (const key of CLOUDINARY_VARS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  if (!fs.existsSync(uploadsDir)) return;
  for (const file of fs.readdirSync(uploadsDir)) {
    if (!beforeFiles.includes(file)) {
      fs.unlinkSync(path.join(uploadsDir, file));
    }
  }
});

// A pasted thumbnailUrl is validated server-side with a HEAD request
// (see Controllers/video.js): the example.com URL the tests below
// paste must answer as an image, so fetch is stubbed to an image
// response. URL-validation failures are covered with mocked fetch in
// video-auto-thumbnails.test.js.
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

function uploadMp4(user, fields) {
  const req = api
    .post("/video/uploadvideo")
    .set(authHeader(user))
    .attach("file", Buffer.from("fake-mp4-bytes"), {
      filename: "clip.mp4",
      contentType: "video/mp4",
    });
  for (const [key, value] of Object.entries(fields)) {
    req.field(key, value);
  }
  return req;
}

describe("POST /video/uploadvideo — local fallback (no Cloudinary)", () => {
  it("succeeds without Cloudinary env and stores a local /uploads filepath", async () => {
    const user = await createUser();
    const res = await uploadMp4(user, {
      title: "Local fallback upload",
      chanel: "someone-else-channel",
      description: "Stored locally, not on Cloudinary",
      tags: "local, fallback",
      visibility: "public",
      thumbnailUrl: "https://example.com/thumb.jpg",
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("File uploaded successfully");
    expect(typeof res.body.video?.id).toBe("string");
    const saved = await Videofile.findById(res.body.video.id);
    expect(saved).not.toBeNull();
    expect(saved.filepath).toMatch(/^\/uploads\/[^/]+\.mp4$/);
    // The file really is on disk under uploads/.
    expect(
      fs.existsSync(path.join(uploadsDir, path.basename(saved.filepath))),
    ).toBe(true);
    // Details from the wizard form are persisted.
    expect(saved.videotitle).toBe("Local fallback upload");
    expect(saved.description).toBe("Stored locally, not on Cloudinary");
    expect(saved.tags).toEqual(["local", "fallback"]);
    expect(saved.visibility).toBe("public");
    expect(saved.thumbnailUrl).toBe("https://example.com/thumb.jpg");
    // The pasted URL wins over auto generation, and these tests
    // upload fake bytes (not a real video), so ffmpeg extraction
    // cannot run — autoThumbnails stays empty and the upload still
    // succeeds. Real local extraction is covered in
    // video-auto-thumbnails.test.js with a generated fixture video.
    expect(saved.autoThumbnails).toEqual([]);
    // Duration is unknown without Cloudinary — left null, never invented.
    expect(saved.duration).toBeNull();
    expect(saved.durationSec).toBeNull();
    expect(saved.thumbnail).toBeNull();
  });

  it("overrides the client-supplied chanel with the authenticated user id", async () => {
    const user = await createUser();
    const res = await uploadMp4(user, {
      title: "Chanel override",
      chanel: "someone-else-channel",
    });
    expect(res.status).toBe(200);
    const saved = await Videofile.findById(res.body.video.id);
    expect(saved.videochanel).toBe(String(user._id));
    expect(saved.videochanel).not.toBe("someone-else-channel");
  });

  it("serves the stored file at its /uploads URL", async () => {
    const user = await createUser();
    const res = await uploadMp4(user, {
      title: "Served locally",
      chanel: "test-channel",
    });
    expect(res.status).toBe(200);
    const saved = await Videofile.findById(res.body.video.id);
    const served = await api.get(saved.filepath);
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toMatch(/video\/mp4/);
  });

  it("Save as draft via the fallback: stored as draft, hidden from the feed", async () => {
    const user = await createUser();
    const res = await uploadMp4(user, {
      title: "Local draft",
      chanel: String(user._id),
      visibility: "draft",
    });
    expect(res.status).toBe(200);
    const saved = await Videofile.findById(res.body.video.id);
    expect(saved.visibility).toBe("draft");
    const feed = await api.get("/video/getvideos?page=1&limit=50");
    expect(feed.body.items.map((v) => String(v._id))).not.toContain(
      String(saved._id),
    );
  });

  it("validation still rejects a missing title with field details", async () => {
    const user = await createUser();
    const res = await uploadMp4(user, { chanel: "test-channel" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "title" }),
      ]),
    );
  });

  it("validation still rejects a bad thumbnailUrl with field details", async () => {
    const user = await createUser();
    const res = await uploadMp4(user, {
      title: "Bad thumb",
      chanel: "test-channel",
      thumbnailUrl: "not-a-url",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "thumbnailUrl" }),
      ]),
    );
  });
});

describe("isCloudinaryConfigured()", () => {
  it("is false with no credentials and true only when all three are set", () => {
    expect(isCloudinaryConfigured()).toBe(false);
    process.env.CLOUDINARY_CLOUD_NAME = "demo-cloud";
    expect(isCloudinaryConfigured()).toBe(false);
    process.env.CLOUDINARY_API_KEY = "demo-key";
    expect(isCloudinaryConfigured()).toBe(false);
    process.env.CLOUDINARY_API_SECRET = "demo-secret";
    expect(isCloudinaryConfigured()).toBe(true);
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    expect(isCloudinaryConfigured()).toBe(false);
  });
});

// Silence the fallback console.warn in this file's output — the warn
// is the feature (explicit, never silent), the test asserts behaviour.
vi.spyOn(console, "warn").mockImplementation(() => {});
