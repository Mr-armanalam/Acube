import { describe, expect, it, vi, afterAll, beforeAll } from "vitest";
import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { api, authHeader, createUser, createVideo } from "./helpers.js";
import Videofile from "../Models/videofile.js";

// Cloudinary is mocked: no real account or upload is needed. Multer still
// writes the received file to apps/api/uploads, so the suite cleans up any
// files it creates there. isCloudinaryConfigured is mocked true here so
// these tests exercise the Cloudinary path; the local fallback (env
// unset) is covered separately in video-upload-fallback.test.js.
vi.mock("../cloudinary.js", () => ({
  isCloudinaryConfigured: vi.fn(() => true),
  uploadOnCloudinary: vi.fn(async () => ({
    url: "https://res.cloudinary.com/test/video/upload/test.mp4",
    secure_url: "https://res.cloudinary.com/test/video/upload/test.mp4",
    duration: 42,
    thumbnail_url: "https://res.cloudinary.com/test/video/upload/test.jpg",
  })),
}));

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

describe("like / view counters (Phase 3b: toggles + $inc)", () => {
  it("PATCH /video/view/:id increments views by 1 per call (auth required)", async () => {
    const user = await createUser();
    const video = await createVideo({ views: 0 });
    const first = await api.patch(`/video/view/${video._id}`).set(authHeader(user));
    expect(first.status).toBe(200);
    const second = await api.patch(`/video/view/${video._id}`).set(authHeader(user));
    expect(second.status).toBe(200);
    const updated = await Videofile.findById(video._id);
    expect(updated.views).toBe(2);
  });

  it("PATCH /video/view/:id returns 401 without a token", async () => {
    const video = await createVideo();
    const res = await api.patch(`/video/view/${video._id}`);
    expect(res.status).toBe(401);
  });

  it("PATCH /video/view/:id returns 404 for a valid id with no video", async () => {
    const user = await createUser();
    const missing = new mongoose.Types.ObjectId();
    const res = await api.patch(`/video/view/${missing}`).set(authHeader(user));
    expect(res.status).toBe(404);
  });

  it("PATCH /video/view/:id rejects a malformed id with 400", async () => {
    const user = await createUser();
    const res = await api.patch("/video/view/not-an-objectid").set(authHeader(user));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("PATCH /video/like/:id toggles Like +1 / -1 (auth required)", async () => {
    const user = await createUser();
    const video = await createVideo({ Like: 0 });
    const liked = await api
      .patch(`/video/like/${video._id}`)
      .set(authHeader(user))
      .send({ action: "like" });
    expect(liked.status).toBe(200);
    expect((await Videofile.findById(video._id)).Like).toBe(1);
    const unliked = await api
      .patch(`/video/like/${video._id}`)
      .set(authHeader(user))
      .send({ action: "unlike" });
    expect(unliked.status).toBe(200);
    expect((await Videofile.findById(video._id)).Like).toBe(0);
  });

  it("PATCH /video/like/:id never drives Like below 0", async () => {
    const user = await createUser();
    const video = await createVideo({ Like: 0 });
    const res = await api
      .patch(`/video/like/${video._id}`)
      .set(authHeader(user))
      .send({ action: "unlike" });
    expect(res.status).toBe(200);
    expect((await Videofile.findById(video._id)).Like).toBe(0);
  });

  it("PATCH /video/like/:id rejects an absolute count with 400", async () => {
    const user = await createUser();
    const video = await createVideo({ Like: 0 });
    const res = await api
      .patch(`/video/like/${video._id}`)
      .set(authHeader(user))
      .send({ Like: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect((await Videofile.findById(video._id)).Like).toBe(0);
  });

  it("PATCH /video/like/:id returns 401 without a token", async () => {
    const video = await createVideo();
    const res = await api.patch(`/video/like/${video._id}`).send({ action: "like" });
    expect(res.status).toBe(401);
  });

  it("PATCH /video/like/:id rejects a missing action with 400", async () => {
    const user = await createUser();
    const video = await createVideo();
    const res = await api
      .patch(`/video/like/${video._id}`)
      .set(authHeader(user))
      .send({});
    expect(res.status).toBe(400);
  });
});

describe("GET /video/getvideos (Phase 3b: paginated)", () => {
  it("lists uploaded videos in the paginated shape", async () => {
    const video = await createVideo();
    const res = await api.get("/video/getvideos");
    expect(res.status).toBe(200);
    expect(res.body.items.some((v) => v._id === String(video._id))).toBe(true);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
    expect(res.body.totalPages).toBe(1);
  });

  it("page 2 differs from page 1 and limit is capped at 50", async () => {
    await createVideo({ videotitle: "page-video-1" });
    await createVideo({ videotitle: "page-video-2" });
    await createVideo({ videotitle: "page-video-3" });
    const first = await api.get("/video/getvideos?page=1&limit=2");
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.total).toBe(3);
    expect(first.body.totalPages).toBe(2);
    const second = await api.get("/video/getvideos?page=2&limit=2");
    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0]._id).not.toBe(first.body.items[0]._id);
    expect(second.body.items[0]._id).not.toBe(first.body.items[1]._id);

    const capped = await api.get("/video/getvideos?limit=500");
    expect(capped.status).toBe(200);
    expect(capped.body.limit).toBe(50);
  });
});

describe("POST /video/uploadvideo", () => {
  it("returns 404 when no file is attached but title/chanel are present", async () => {
    const user = await createUser();
    const res = await api
      .post("/video/uploadvideo")
      .set(authHeader(user))
      .field("title", "No file video")
      .field("chanel", "test-channel")
      .field("uploader", "tester");
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/mp.4 video file only/);
  });

  it("rejects a missing title with 400 (validation runs after multer)", async () => {
    const user = await createUser();
    const res = await api
      .post("/video/uploadvideo")
      .set(authHeader(user))
      .attach("file", Buffer.from("fake-mp4-bytes"), {
        filename: "clip.mp4",
        contentType: "video/mp4",
      })
      .field("chanel", "test-channel");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a non-mp4 file (multer filter drops it, controller 404s)", async () => {
    const user = await createUser();
    const res = await api
      .post("/video/uploadvideo")
      .set(authHeader(user))
      .attach("file", Buffer.from("not a video"), {
        filename: "notes.txt",
        contentType: "text/plain",
      })
      .field("title", "Text file")
      .field("chanel", "test-channel");
    expect(res.status).toBe(404);
  });

  it("uploads an mp4 with mocked Cloudinary and creates the video record", async () => {
    const user = await createUser();
    const res = await api
      .post("/video/uploadvideo")
      .set(authHeader(user))
      .attach("file", Buffer.from("fake-mp4-bytes"), {
        filename: "clip.mp4",
        contentType: "video/mp4",
      })
      .field("title", "Mocked upload")
      .field("chanel", "test-channel")
      .field("uploader", "tester");
    expect(res.status).toBe(200);
    // Phase 5 fix: JSON response carrying the created video id (the
    // wizard links to it); the old bare-text response is gone.
    expect(res.body.message).toBe("File uploaded successfully");
    expect(typeof res.body.video?.id).toBe("string");
    const saved = await Videofile.findOne({ videotitle: "Mocked upload" });
    expect(saved).not.toBeNull();
    expect(String(saved._id)).toBe(res.body.video.id);
    expect(saved.filepath).toBe("https://res.cloudinary.com/test/video/upload/test.mp4");
    // Phase 3b: secure_url + duration/thumbnail stored; the uploader
    // comes from the signed-in user, NOT the body's "tester".
    expect(saved.duration).toBe(42);
    expect(saved.thumbnail).toBe("https://res.cloudinary.com/test/video/upload/test.jpg");
    expect(saved.uploader).toBe(user.username);
    // The stored filename is sanitised — it never equals the raw
    // originalname and never contains a path separator.
    expect(saved.filename).not.toBe("clip.mp4");
    expect(saved.filename).not.toMatch(/[\\/]/);
    expect(saved.filename.endsWith(".mp4")).toBe(true);
  });

  it("persists description/tags/visibility/thumbnailUrl from the upload form", async () => {
    const user = await createUser();
    const res = await api
      .post("/video/uploadvideo")
      .set(authHeader(user))
      .attach("file", Buffer.from("fake-mp4-bytes"), {
        filename: "clip.mp4",
        contentType: "video/mp4",
      })
      .field("title", "Detailed upload")
      .field("chanel", "test-channel")
      .field("description", "A detailed description")
      .field("tags", "planning, productivity,, routine ")
      .field("visibility", "unlisted")
      .field("thumbnailUrl", "https://example.com/thumb.jpg");
    expect(res.status).toBe(200);
    expect(res.body.video.visibility).toBe("unlisted");
    expect(res.body.video.description).toBe("A detailed description");
    expect(res.body.video.tags).toEqual(["planning", "productivity", "routine"]);
    expect(res.body.video.thumbnailUrl).toBe("https://example.com/thumb.jpg");
    const saved = await Videofile.findById(res.body.video.id);
    expect(saved.description).toBe("A detailed description");
    expect(saved.tags).toEqual(["planning", "productivity", "routine"]);
    expect(saved.visibility).toBe("unlisted");
    expect(saved.thumbnailUrl).toBe("https://example.com/thumb.jpg");
  });

  it("upload without description/tags/visibility defaults to public with empty details", async () => {
    const user = await createUser();
    const res = await api
      .post("/video/uploadvideo")
      .set(authHeader(user))
      .attach("file", Buffer.from("fake-mp4-bytes"), {
        filename: "clip.mp4",
        contentType: "video/mp4",
      })
      .field("title", "Plain upload")
      .field("chanel", "test-channel");
    expect(res.status).toBe(200);
    expect(typeof res.body.video?.id).toBe("string");
    expect(res.body.video.visibility).toBe("public");
    expect(res.body.video.description).toBe("");
    expect(res.body.video.tags).toEqual([]);
    expect(res.body.video.thumbnailUrl).toBeNull();
    const saved = await Videofile.findById(res.body.video.id);
    expect(saved.visibility).toBe("public");
    expect(saved.description).toBe("");
    expect(saved.tags).toEqual([]);
    expect(saved.thumbnailUrl).toBeNull();
    // A default-public upload DOES appear in the public feed.
    const feed = await api.get("/video/getvideos?page=1&limit=50");
    expect(feed.body.items.map((v) => String(v._id))).toContain(
      String(saved._id),
    );
  });

  it("Save as draft: visibility=draft is stored, hidden from the feed, owner-only", async () => {
    const user = await createUser();
    const res = await api
      .post("/video/uploadvideo")
      .set(authHeader(user))
      .attach("file", Buffer.from("fake-mp4-bytes"), {
        filename: "clip.mp4",
        contentType: "video/mp4",
      })
      .field("title", "Draft upload")
      .field("chanel", String(user._id))
      .field("description", "Not ready yet")
      .field("visibility", "draft");
    expect(res.status).toBe(200);
    expect(res.body.video.visibility).toBe("draft");
    const saved = await Videofile.findById(res.body.video.id);
    expect(saved.visibility).toBe("draft");
    expect(saved.description).toBe("Not ready yet");
    // A draft never appears in the public feed…
    const feed = await api.get("/video/getvideos?page=1&limit=50");
    expect(feed.body.items.map((v) => String(v._id))).not.toContain(
      String(saved._id),
    );
    // …and is 404 for anonymous readers, but readable by its owner.
    const anon = await api.get(`/video/${saved._id}`);
    expect(anon.status).toBe(404);
    const owner = await api
      .get(`/video/${saved._id}`)
      .set(authHeader(user));
    expect(owner.status).toBe(200);
    expect(owner.body.visibility).toBe("draft");
  });

  it("rejects an invalid visibility and an invalid thumbnailUrl with 400", async () => {
    const user = await createUser();
    const badVisibility = await api
      .post("/video/uploadvideo")
      .set(authHeader(user))
      .attach("file", Buffer.from("fake-mp4-bytes"), {
        filename: "clip.mp4",
        contentType: "video/mp4",
      })
      .field("title", "Bad visibility")
      .field("chanel", "test-channel")
      .field("visibility", "everyone");
    expect(badVisibility.status).toBe(400);
    expect(badVisibility.body.error.code).toBe("VALIDATION_ERROR");
    const badThumb = await api
      .post("/video/uploadvideo")
      .set(authHeader(user))
      .attach("file", Buffer.from("fake-mp4-bytes"), {
        filename: "clip.mp4",
        contentType: "video/mp4",
      })
      .field("title", "Bad thumb")
      .field("chanel", "test-channel")
      .field("thumbnailUrl", "not-a-url");
    expect(badThumb.status).toBe(400);
    expect(badThumb.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 without a token", async () => {
    const res = await api.post("/video/uploadvideo").field("title", "x").field("chanel", "y");
    expect(res.status).toBe(401);
  });
});
