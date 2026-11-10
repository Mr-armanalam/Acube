import { describe, expect, it, vi, afterAll, beforeAll } from "vitest";
import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { api, authHeader, createUser, createVideo } from "./helpers.js";
import Videofile from "../Models/videofile.js";

// Cloudinary is mocked: no real account or upload is needed. Multer still
// writes the received file to apps/api/uploads, so the suite cleans up any
// files it creates there.
vi.mock("../cloudinary.js", () => ({
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
    expect(res.text).toBe("File uploaded successfully");
    const saved = await Videofile.findOne({ videotitle: "Mocked upload" });
    expect(saved).not.toBeNull();
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

  it("returns 401 without a token", async () => {
    const res = await api.post("/video/uploadvideo").field("title", "x").field("chanel", "y");
    expect(res.status).toBe(401);
  });
});
