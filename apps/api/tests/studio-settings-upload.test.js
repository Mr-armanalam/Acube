// Settings polish — live handle check + banner/avatar uploads.
//
// Covers GET /studio/handle/available (available / taken / own handle
// / invalid format / 401) and POST /studio/banner + POST /studio/avatar
// with POST .../remove (local fallback + mocked-Cloudinary path,
// wrong MIME, oversize, no file, 401, remove clears the URL).
//
// Cloudinary is NEVER called for real: the SDK is mocked below (same
// faithful shape as video-upload-cloudinary-lazy-config.test.js —
// config() merges, upload() throws "Must supply api_key" unless
// configured). All credential values are obviously-fake placeholders.
// The local-fallback tests run with the Cloudinary env vars deleted,
// exactly like video-upload-fallback.test.js; multer still writes the
// received file to apps/api/uploads, so the suite cleans up any files
// it creates there.
import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { api, authHeader, createUser } from "./helpers.js";
import User from "../Models/Auth.js";

// 1x1 transparent PNG (real PNG bytes, so the served-file assertions
// check a genuine image, not an arbitrary buffer).
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const TEST_CLOUD_NAME = "test-cloud-name";
const TEST_API_KEY = "test-key";
const TEST_API_SECRET = "test-secret";

const cloudinaryMock = vi.hoisted(() => {
  let configured = {};
  let uploadCalls = [];
  return {
    config: (cfg) => {
      configured = { ...configured, ...(cfg ?? {}) };
    },
    upload: async (localFilePath, options) => {
      if (!configured.api_key) {
        throw new Error("Must supply api_key");
      }
      uploadCalls.push({ localFilePath, options: { ...(options ?? {}) } });
      const resourceType = options?.resource_type ?? "video";
      const folder = resourceType === "image" ? "image" : "video";
      const ext = resourceType === "image" ? "png" : "mp4";
      return {
        secure_url: `https://res.cloudinary.com/${configured.cloud_name ?? "test-cloud-name"}/${folder}/upload/v1/fake.${ext}`,
        url: `http://res.cloudinary.com/${configured.cloud_name ?? "test-cloud-name"}/${folder}/upload/v1/fake.${ext}`,
      };
    },
    getUploadCalls: () => [...uploadCalls],
    reset: () => {
      configured = {};
      uploadCalls = [];
    },
  };
});

vi.mock("cloudinary", () => ({
  v2: {
    config: cloudinaryMock.config,
    uploader: { upload: cloudinaryMock.upload },
  },
}));

const uploadsDir = path.join(process.cwd(), "uploads");
let beforeFiles = [];

const CLOUDINARY_VARS = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];
const savedEnv = {};

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

function uploadImage(user, route, { filename = "banner.png", contentType = "image/png", bytes = PNG_BYTES } = {}) {
  const req = api.post(route);
  if (user) req.set(authHeader(user));
  return req.attach("file", bytes, { filename, contentType });
}

// Silence the fallback console.warn in this file's output — the warn
// is the feature (explicit, never silent), the tests assert behaviour.
vi.spyOn(console, "warn").mockImplementation(() => {});

describe("GET /studio/handle/available", () => {
  it("returns available:true for a free handle", async () => {
    const user = await createUser();
    const res = await api
      .get("/studio/handle/available?handle=free-handle")
      .set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: true });
  });

  it("returns available:false + reason taken when another channel holds the handle", async () => {
    const user = await createUser();
    await createUser({ handle: "taken-handle" });
    const res = await api
      .get("/studio/handle/available?handle=taken-handle")
      .set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false, reason: "taken" });
  });

  it("is case-insensitive: a handle held in another case is taken", async () => {
    const user = await createUser();
    await createUser({ handle: "Taken-Handle" });
    const res = await api
      .get("/studio/handle/available?handle=taken-handle")
      .set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false, reason: "taken" });
  });

  it("the caller's own handle is available (owner-exempt, any case)", async () => {
    const user = await createUser({ handle: "my-handle" });
    const exact = await api
      .get("/studio/handle/available?handle=my-handle")
      .set(authHeader(user));
    expect(exact.status).toBe(200);
    expect(exact.body).toEqual({ available: true });
    const otherCase = await api
      .get("/studio/handle/available?handle=MY-HANDLE")
      .set(authHeader(user));
    expect(otherCase.status).toBe(200);
    expect(otherCase.body).toEqual({ available: true });
  });

  it("rejects invalid formats with 400 (too short, bad characters, missing)", async () => {
    const user = await createUser();
    for (const query of [
      "handle=ab",
      "handle=bad%20handle!",
      "handle=",
      "",
    ]) {
      const res = await api
        .get(`/studio/handle/available?${query}`)
        .set(authHeader(user));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    // Same rule as the save handler: 31 chars is too long.
    const tooLong = await api
      .get(`/studio/handle/available?handle=${"a".repeat(31)}`)
      .set(authHeader(user));
    expect(tooLong.status).toBe(400);
  });

  it("returns 401 without a token", async () => {
    const res = await api.get("/studio/handle/available?handle=free-handle");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("POST /studio/banner + /studio/avatar — local fallback (no Cloudinary)", () => {
  it("banner: valid PNG upload → 200 + user record updated + file served", async () => {
    const user = await createUser();
    const res = await uploadImage(user, "/studio/banner");
    expect(res.status).toBe(200);
    expect(res.body.bannerUrl).toMatch(/^\/uploads\/[^/]+\.png$/);
    const saved = await User.findById(user._id);
    expect(saved.bannerUrl).toBe(res.body.bannerUrl);
    // The file really is on disk under uploads/ and served at its URL.
    expect(
      fs.existsSync(path.join(uploadsDir, path.basename(saved.bannerUrl))),
    ).toBe(true);
    const served = await api.get(saved.bannerUrl);
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toMatch(/image\/png/);
    // Settings polish fix: uploads must load cross-origin — the web
    // runs on another origin, and Helmet's same-origin CORP made the
    // browser refuse the file (ERR_BLOCKED_BY_RESPONSE) even though
    // the upload succeeded.
    expect(served.headers["cross-origin-resource-policy"]).toBe(
      "cross-origin",
    );
    // GET /studio/settings reads the new banner back.
    const settings = await api.get("/studio/settings").set(authHeader(user));
    expect(settings.body.channel.bannerUrl).toBe(res.body.bannerUrl);
  });

  it("avatar: valid PNG upload → 200 + user record updated", async () => {
    const user = await createUser();
    const res = await uploadImage(user, "/studio/avatar", {
      filename: "me.png",
    });
    expect(res.status).toBe(200);
    expect(res.body.avatarUrl).toMatch(/^\/uploads\/[^/]+\.png$/);
    const saved = await User.findById(user._id);
    expect(saved.avatarUrl).toBe(res.body.avatarUrl);
    const served = await api.get(saved.avatarUrl);
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toMatch(/image\/png/);
    // Identity fix: the overview now carries the uploaded avatar (the
    // Studio identity header prefers it over the Google photo), and
    // the channel list carries it for the channel header.
    const overview = await api.get("/studio/overview").set(authHeader(user));
    expect(overview.body.channel.avatarUrl).toBe(res.body.avatarUrl);
    const channels = await api.get("/user/getallchannel");
    const listed = channels.body.items.find(
      (c) => String(c._id) === String(user._id),
    );
    expect(listed.avatarUrl).toBe(res.body.avatarUrl);
  });

  it("avatar: a JPEG upload is stored with a .jpg extension", async () => {
    const user = await createUser();
    const res = await uploadImage(user, "/studio/avatar", {
      filename: "photo.jpeg",
      contentType: "image/jpeg",
      bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    });
    expect(res.status).toBe(200);
    expect(res.body.avatarUrl).toMatch(/^\/uploads\/[^/]+\.jpg$/);
  });

  it("wrong MIME is 400: a .txt file and a video file are both rejected", async () => {
    const user = await createUser();
    const text = await uploadImage(user, "/studio/banner", {
      filename: "notes.txt",
      contentType: "text/plain",
      bytes: Buffer.from("not an image"),
    });
    expect(text.status).toBe(400);
    expect(text.body.error.code).toBe("VALIDATION_ERROR");
    const video = await uploadImage(user, "/studio/banner", {
      filename: "clip.mp4",
      contentType: "video/mp4",
      bytes: Buffer.from("fake-mp4-bytes"),
    });
    expect(video.status).toBe(400);
    expect(video.body.error.code).toBe("VALIDATION_ERROR");
    // Nothing was stored on the failed uploads.
    expect((await User.findById(user._id)).bannerUrl).toBeNull();
  });

  it("no file attached is 400", async () => {
    const user = await createUser();
    const res = await api.post("/studio/avatar").set(authHeader(user));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("oversize is 400 naming the 5 MB limit", async () => {
    const user = await createUser();
    const res = await uploadImage(user, "/studio/banner", {
      bytes: Buffer.alloc(5 * 1024 * 1024 + 1, 0),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toBe("File must be less than 5 MB");
    expect((await User.findById(user._id)).bannerUrl).toBeNull();
  });

  it("returns 401 without a token (upload + remove, banner + avatar)", async () => {
    expect((await api.post("/studio/banner")).status).toBe(401);
    expect((await api.post("/studio/avatar")).status).toBe(401);
    expect((await api.post("/studio/banner/remove")).status).toBe(401);
    expect((await api.post("/studio/avatar/remove")).status).toBe(401);
  });

  it("remove clears the URL (and is a 200 no-op when already unset)", async () => {
    const user = await createUser();
    const uploaded = await uploadImage(user, "/studio/banner");
    expect(uploaded.status).toBe(200);
    expect((await User.findById(user._id)).bannerUrl).not.toBeNull();

    const removed = await api
      .post("/studio/banner/remove")
      .set(authHeader(user));
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ bannerUrl: null });
    expect((await User.findById(user._id)).bannerUrl).toBeNull();
    const settings = await api.get("/studio/settings").set(authHeader(user));
    expect(settings.body.channel.bannerUrl).toBeNull();

    // Already unset → still 200 null, not an error.
    const again = await api
      .post("/studio/banner/remove")
      .set(authHeader(user));
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ bannerUrl: null });

    // Avatar remove behaves the same.
    await uploadImage(user, "/studio/avatar", { filename: "me.png" });
    expect((await User.findById(user._id)).avatarUrl).not.toBeNull();
    const avatarRemoved = await api
      .post("/studio/avatar/remove")
      .set(authHeader(user));
    expect(avatarRemoved.status).toBe(200);
    expect(avatarRemoved.body).toEqual({ avatarUrl: null });
    expect((await User.findById(user._id)).avatarUrl).toBeNull();
  });

  it("an upload only ever touches the caller's own record", async () => {
    const user = await createUser();
    const other = await createUser();
    const res = await uploadImage(user, "/studio/banner");
    expect(res.status).toBe(200);
    expect((await User.findById(other._id)).bannerUrl).toBeNull();
    expect((await User.findById(user._id)).bannerUrl).toBe(
      res.body.bannerUrl,
    );
  });
});

describe("POST /studio/banner — Cloudinary path (mocked SDK)", () => {
  it("uses Cloudinary with resource_type image when configured, and stores the secure URL", async () => {
    setTestCloudinaryEnv();
    const filesBefore = fs.existsSync(uploadsDir)
      ? fs.readdirSync(uploadsDir)
      : [];
    const user = await createUser();
    const res = await uploadImage(user, "/studio/banner");
    expect(res.status).toBe(200);
    expect(res.body.bannerUrl).toBe(
      "https://res.cloudinary.com/test-cloud-name/image/upload/v1/fake.png",
    );
    expect((await User.findById(user._id)).bannerUrl).toBe(
      res.body.bannerUrl,
    );
    // The image upload went to Cloudinary as an image, not a video.
    const calls = cloudinaryMock.getUploadCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].options).toMatchObject({ resource_type: "image" });
    // Cloudinary success removes the local temp file (uploadOnCloudinary).
    const filesAfter = fs.existsSync(uploadsDir)
      ? fs.readdirSync(uploadsDir)
      : [];
    expect(filesAfter).toEqual(filesBefore);
  });
});
