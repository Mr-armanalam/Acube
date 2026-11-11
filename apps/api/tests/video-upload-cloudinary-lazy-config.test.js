// Regression test — lazy Cloudinary configuration (upload 400).
//
// THE BUG: cloudinary.js used to call cloudinary.config() at module
// import time. ES imports are hoisted, so the chain app.js →
// Routes/video.js → Controllers/video.js → cloudinary.js ran BEFORE
// app.js's dotenv.config() body line, and the SDK was configured once
// with undefined credentials. isCloudinaryConfigured() reads
// process.env at REQUEST time (after dotenv loaded), so it returned
// true, the code took the Cloudinary path, and the SDK threw
// "Must supply api_key" → 400 {"message":"Failed to upload video to
// cloudinary"} on EVERY upload, even with a correct .env.
//
// THE FIX (apps/api/cloudinary.js): configure the SDK lazily, inside
// uploadOnCloudinary, after dotenv has loaded.
//
// HOW THIS TEST REPRODUCES IT: it never statically imports the app
// chain. Each test deletes the Cloudinary env vars FIRST, then
// dynamically imports the module under test (exactly the production
// order: import runs before dotenv/env is available), and only then
// sets the credentials — as dotenv.config() does in production. The
// mocked SDK below mirrors the real one's behaviour: uploader.upload
// throws "Must supply api_key" unless config() was called with an
// api_key. So on the import-time code the upload 400s (test fails);
// on the lazy code the upload succeeds (test passes).
//
// Never calls the real Cloudinary API; all credential values below
// are obviously-fake placeholders.
import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_CLOUD_NAME = "test-cloud-name";
const TEST_API_KEY = "test-key";
const TEST_API_SECRET = "test-secret";
const FAKE_SECURE_URL =
  "https://res.cloudinary.com/test-cloud-name/video/upload/v1/fake.mp4";

// Faithful simulation of the cloudinary v2 SDK surface this codebase
// uses: config() merges into the SDK's global config, and
// uploader.upload() throws "Must supply api_key" when no api_key was
// ever configured — the exact error the real SDK threw in production.
const cloudinaryMock = vi.hoisted(() => {
  let configured = {};
  let configCalls = [];
  let uploadCalls = 0;
  return {
    config: (cfg) => {
      configCalls.push(cfg === undefined ? undefined : { ...cfg });
      configured = { ...configured, ...(cfg ?? {}) };
    },
    upload: async () => {
      uploadCalls += 1;
      if (!configured.api_key) {
        throw new Error("Must supply api_key");
      }
      return {
        secure_url: FAKE_SECURE_URL,
        url: "http://res.cloudinary.com/test-cloud-name/video/upload/v1/fake.mp4",
        duration: 12.5,
        thumbnail_url:
          "https://res.cloudinary.com/test-cloud-name/image/upload/v1/fake.jpg",
      };
    },
    getConfigured: () => ({ ...configured }),
    getConfigCalls: () => [...configCalls],
    getUploadCalls: () => uploadCalls,
    reset: () => {
      configured = {};
      configCalls = [];
      uploadCalls = 0;
    },
  };
});

vi.mock("cloudinary", () => ({
  v2: {
    config: cloudinaryMock.config,
    uploader: { upload: cloudinaryMock.upload },
  },
}));

const CLOUDINARY_VARS = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];
const savedEnv = {};
const uploadsDir = path.join(process.cwd(), "uploads");
let beforeFiles = [];

function clearCloudinaryEnv() {
  for (const key of CLOUDINARY_VARS) delete process.env[key];
}

function setTestCloudinaryEnv() {
  process.env.CLOUDINARY_CLOUD_NAME = TEST_CLOUD_NAME;
  process.env.CLOUDINARY_API_KEY = TEST_API_KEY;
  process.env.CLOUDINARY_API_SECRET = TEST_API_SECRET;
}

beforeAll(() => {
  for (const key of CLOUDINARY_VARS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  beforeFiles = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
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

beforeEach(() => {
  cloudinaryMock.reset();
  clearCloudinaryEnv();
});

describe("Cloudinary lazy configuration (import-order regression)", () => {
  it("uploadOnCloudinary configures the SDK with credentials set AFTER import", async () => {
    // Import runs with NO credentials in env — the production order
    // (dotenv loads later). Only then do the credentials appear.
    const { uploadOnCloudinary } = await import("../cloudinary.js");
    expect(cloudinaryMock.getConfigured().api_key).toBeUndefined();
    setTestCloudinaryEnv();

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acube-cloudinary-"));
    const tmpFile = path.join(tmpDir, "clip.mp4");
    fs.writeFileSync(tmpFile, "fake-mp4-bytes");

    const result = await uploadOnCloudinary(tmpFile);

    // The SDK must have been configured at upload time with the
    // credentials as they are NOW — on the import-time code this is
    // still { cloud_name: undefined, api_key: undefined, ... } and
    // the upload throws "Must supply api_key", so result is null.
    expect(cloudinaryMock.getConfigured()).toEqual({
      cloud_name: TEST_CLOUD_NAME,
      api_key: TEST_API_KEY,
      api_secret: TEST_API_SECRET,
    });
    expect(cloudinaryMock.getConfigCalls()).toContainEqual({
      cloud_name: TEST_CLOUD_NAME,
      api_key: TEST_API_KEY,
      api_secret: TEST_API_SECRET,
    });
    expect(result).not.toBeNull();
    expect(result.secure_url).toBe(FAKE_SECURE_URL);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("POST /video/uploadvideo succeeds via Cloudinary when credentials appear only after import", async () => {
    // First import of the app chain in this file happens here, with
    // NO credentials in env — the production import order. The
    // credentials are set only after the import, as dotenv does.
    const { api, authHeader, createUser } = await import("./helpers.js");
    const { isCloudinaryConfigured } = await import("../cloudinary.js");
    expect(isCloudinaryConfigured()).toBe(false);
    setTestCloudinaryEnv();
    expect(isCloudinaryConfigured()).toBe(true);

    const user = await createUser();
    const res = await api
      .post("/video/uploadvideo")
      .set(authHeader(user))
      .attach("file", Buffer.from("fake-mp4-bytes"), {
        filename: "clip.mp4",
        contentType: "video/mp4",
      })
      .field("title", "Cloudinary path upload")
      .field("chanel", String(user._id));

    // On the import-time code the SDK was configured with undefined
    // credentials, the mocked upload throws "Must supply api_key",
    // and this is the production 400.
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("File uploaded successfully");
    expect(cloudinaryMock.getUploadCalls()).toBe(1);
    expect(cloudinaryMock.getConfigCalls()).toContainEqual({
      cloud_name: TEST_CLOUD_NAME,
      api_key: TEST_API_KEY,
      api_secret: TEST_API_SECRET,
    });

    const { default: Videofile } = await import("../Models/videofile.js");
    const saved = await Videofile.findById(res.body.video.id);
    expect(saved).not.toBeNull();
    expect(saved.filepath).toBe(FAKE_SECURE_URL);
    expect(saved.duration).toBe(12.5);
    expect(saved.thumbnail).toMatch(/res\.cloudinary\.com/);
  });

  it("unconfigured uploads still fall back to local storage", async () => {
    // No credentials at all: the local fallback must carry the
    // upload, and the Cloudinary SDK must never be touched.
    const { api, authHeader, createUser } = await import("./helpers.js");
    const { isCloudinaryConfigured } = await import("../cloudinary.js");
    expect(isCloudinaryConfigured()).toBe(false);

    const user = await createUser();
    const res = await api
      .post("/video/uploadvideo")
      .set(authHeader(user))
      .attach("file", Buffer.from("fake-mp4-bytes"), {
        filename: "clip.mp4",
        contentType: "video/mp4",
      })
      .field("title", "Still local without Cloudinary")
      .field("chanel", String(user._id));

    expect(res.status).toBe(200);
    expect(cloudinaryMock.getUploadCalls()).toBe(0);
    const { default: Videofile } = await import("../Models/videofile.js");
    const saved = await Videofile.findById(res.body.video.id);
    expect(saved.filepath).toMatch(/^\/uploads\/[^/]+\.mp4$/);
  });
});
