// Studio Content edit modal — POST /video/:id/thumbnail (local file
// upload or pasted URL). Covers: multipart file sets thumbnailUrl
// (local /uploads/ fallback — Cloudinary env is deleted here, exactly
// like video-upload-fallback.test.js), file beats pasted URL, pasted
// URLs are validated server-side as reachable images (HEAD, ranged-GET
// fallback) against a local HTTP server — no real network — wrong MIME
// / oversize / non-owner / missing video / no token, and JSON-only
// PATCH /video/:id still working unchanged.
//
// Multer still writes received files to apps/api/uploads, so the suite
// cleans up any files it creates there.
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { api, authHeader, createUser, createVideo } from "./helpers.js";
import Videofile from "../Models/videofile.js";

// 1x1 transparent PNG (real PNG bytes).
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const uploadsDir = path.join(process.cwd(), "uploads");
let beforeFiles = [];
beforeAll(() => {
  beforeFiles = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
});
afterEach(() => {
  if (!fs.existsSync(uploadsDir)) return;
  for (const file of fs.readdirSync(uploadsDir)) {
    if (!beforeFiles.includes(file)) {
      fs.unlinkSync(path.join(uploadsDir, file));
    }
  }
});

// Silence the fallback console.warn in this file's output — the warn
// is the feature (explicit, never silent), the tests assert behaviour.
vi.spyOn(console, "warn").mockImplementation(() => {});

// Local image server for the pasted-URL checks. HEAD behaves like a
// normal image host on /ok.png; /head-405.png refuses HEAD (405) so
// the ranged-GET fallback is exercised; /page.html is a 200 non-image;
// /missing is a 404.
let server;
let baseUrl;
beforeAll(
  () =>
    new Promise((resolve) => {
      server = http.createServer((req, res) => {
        if (req.url === "/ok.png") {
          res.writeHead(200, { "content-type": "image/png" });
          if (req.method !== "HEAD") res.end(PNG_BYTES);
          else res.end();
        } else if (req.url === "/head-405.png") {
          if (req.method === "HEAD") {
            res.writeHead(405);
            res.end();
          } else {
            res.writeHead(200, { "content-type": "image/png" });
            res.end(PNG_BYTES);
          }
        } else if (req.url === "/page.html") {
          res.writeHead(200, { "content-type": "text/html" });
          if (req.method !== "HEAD") res.end("<html></html>");
          else res.end();
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      server.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    }),
);
afterAll(
  () =>
    new Promise((resolve) => {
      server.close(() => resolve());
    }),
);

async function ownVideo(user) {
  return createVideo({ videochanel: String(user._id) });
}

function uploadThumbnail(user, videoId, { filename = "thumb.png", contentType = "image/png", bytes = PNG_BYTES } = {}) {
  const req = api.post(`/video/${videoId}/thumbnail`);
  if (user) req.set(authHeader(user));
  return req.attach("thumbnail", bytes, { filename, contentType });
}

describe("POST /video/:id/thumbnail — local file upload", () => {
  it("multipart PNG sets thumbnailUrl to a local /uploads/ URL and returns the updated video", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    const res = await uploadThumbnail(owner, video._id);
    expect(res.status).toBe(200);
    expect(res.body.thumbnailUrl).toMatch(/^\/uploads\/[^/]+\.png$/);
    expect(String(res.body._id)).toBe(String(video._id));
    expect((await Videofile.findById(video._id)).thumbnailUrl).toBe(
      res.body.thumbnailUrl,
    );
  });

  it("a JPEG upload is stored with a .jpg extension", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    const res = await uploadThumbnail(owner, video._id, {
      filename: "photo.jpeg",
      contentType: "image/jpeg",
      bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    });
    expect(res.status).toBe(200);
    expect(res.body.thumbnailUrl).toMatch(/^\/uploads\/[^/]+\.jpg$/);
  });

  it("file beats pasted URL: an unreachable URL is never fetched when a file is attached", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    const req = api
      .post(`/video/${video._id}/thumbnail`)
      .set(authHeader(owner))
      .field("thumbnailUrl", "http://127.0.0.1:1/unreachable.png")
      .attach("thumbnail", PNG_BYTES, {
        filename: "thumb.png",
        contentType: "image/png",
      });
    const res = await req;
    expect(res.status).toBe(200);
    expect(res.body.thumbnailUrl).toMatch(/^\/uploads\//);
  });

  it("wrong MIME is 400 and the thumbnail is unchanged", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    const res = await uploadThumbnail(owner, video._id, {
      filename: "notes.txt",
      contentType: "text/plain",
      bytes: Buffer.from("not an image"),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect((await Videofile.findById(video._id)).thumbnailUrl).toBeNull();
  });

  it("oversize is 400 naming the 5 MB limit", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    const res = await uploadThumbnail(owner, video._id, {
      bytes: Buffer.alloc(5 * 1024 * 1024 + 1, 0),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toBe("File must be less than 5 MB");
    expect((await Videofile.findById(video._id)).thumbnailUrl).toBeNull();
  });

  it("multipart with no file and no URL is 400", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    const res = await api
      .post(`/video/${video._id}/thumbnail`)
      .set(authHeader(owner))
      .field("note", "nothing to upload");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /video/:id/thumbnail — pasted URL", () => {
  it("a reachable image URL (JSON body) is stored verbatim", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    const res = await api
      .post(`/video/${video._id}/thumbnail`)
      .set(authHeader(owner))
      .send({ thumbnailUrl: `${baseUrl}/ok.png` });
    expect(res.status).toBe(200);
    expect(res.body.thumbnailUrl).toBe(`${baseUrl}/ok.png`);
  });

  it("a reachable image URL (multipart text field) is stored verbatim", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    const res = await api
      .post(`/video/${video._id}/thumbnail`)
      .set(authHeader(owner))
      .field("thumbnailUrl", `${baseUrl}/ok.png`);
    expect(res.status).toBe(200);
    expect(res.body.thumbnailUrl).toBe(`${baseUrl}/ok.png`);
  });

  it("a host that refuses HEAD is accepted via the ranged-GET fallback", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    const res = await api
      .post(`/video/${video._id}/thumbnail`)
      .set(authHeader(owner))
      .send({ thumbnailUrl: `${baseUrl}/head-405.png` });
    expect(res.status).toBe(200);
    expect(res.body.thumbnailUrl).toBe(`${baseUrl}/head-405.png`);
  });

  it("a 200 non-image URL is 400 VALIDATION_ERROR", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    const res = await api
      .post(`/video/${video._id}/thumbnail`)
      .set(authHeader(owner))
      .send({ thumbnailUrl: `${baseUrl}/page.html` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toMatch(/not an image/);
    expect((await Videofile.findById(video._id)).thumbnailUrl).toBeNull();
  });

  it("a 404 URL is 400 VALIDATION_ERROR", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    const res = await api
      .post(`/video/${video._id}/thumbnail`)
      .set(authHeader(owner))
      .send({ thumbnailUrl: `${baseUrl}/missing` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toMatch(/not reachable \(HTTP 404\)/);
  });

  it("an unreachable host is 400 VALIDATION_ERROR", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    const res = await api
      .post(`/video/${video._id}/thumbnail`)
      .set(authHeader(owner))
      .send({ thumbnailUrl: "http://127.0.0.1:1/thumb.png" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toMatch(/could not be reached/);
  });

  it("a malformed URL is 400 VALIDATION_ERROR", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    const res = await api
      .post(`/video/${video._id}/thumbnail`)
      .set(authHeader(owner))
      .send({ thumbnailUrl: "not a url" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /video/:id/thumbnail — ownership and no-op", () => {
  it("a non-owner gets 403 for both file and URL", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const video = await ownVideo(owner);
    const fileRes = await uploadThumbnail(stranger, video._id);
    expect(fileRes.status).toBe(403);
    const urlRes = await api
      .post(`/video/${video._id}/thumbnail`)
      .set(authHeader(stranger))
      .send({ thumbnailUrl: `${baseUrl}/ok.png` });
    expect(urlRes.status).toBe(403);
    expect((await Videofile.findById(video._id)).thumbnailUrl).toBeNull();
  });

  it("a missing video is 404 and no token is 401", async () => {
    const owner = await createUser();
    const missing = "000000000000000000000001";
    const res = await api
      .post(`/video/${missing}/thumbnail`)
      .set(authHeader(owner))
      .send({ thumbnailUrl: `${baseUrl}/ok.png` });
    expect(res.status).toBe(404);
    const video = await ownVideo(owner);
    expect(
      (await api.post(`/video/${video._id}/thumbnail`).send({})).status,
    ).toBe(401);
  });

  it("a JSON call with neither file nor URL keeps the existing thumbnail (200 no-op)", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    await api
      .post(`/video/${video._id}/thumbnail`)
      .set(authHeader(owner))
      .send({ thumbnailUrl: `${baseUrl}/ok.png` });
    const res = await api
      .post(`/video/${video._id}/thumbnail`)
      .set(authHeader(owner))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.thumbnailUrl).toBe(`${baseUrl}/ok.png`);
  });
});

describe("PATCH /video/:id validates a pasted thumbnailUrl (PR #7 behaviour)", () => {
  it("JSON PATCH edits title and stores a reachable thumbnailUrl", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    const res = await api
      .patch(`/video/${video._id}`)
      .set(authHeader(owner))
      .send({
        title: "Renamed",
        thumbnailUrl: `${baseUrl}/ok.png`,
      });
    expect(res.status).toBe(200);
    expect(res.body.videotitle).toBe("Renamed");
    expect(res.body.thumbnailUrl).toBe(`${baseUrl}/ok.png`);
  });

  it("JSON PATCH with an unreachable thumbnailUrl is 400 (reachability is validated, not format-only)", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    const res = await api
      .patch(`/video/${video._id}`)
      .set(authHeader(owner))
      .send({
        title: "Renamed",
        thumbnailUrl: "http://127.0.0.1:1/unreachable-thumb.png",
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("PATCH /video/:id — multipart edit with a thumbnail file", () => {
  // Mirrors the web client's patchVideo: FormData when a file is
  // present (title/description/tags as text fields, tags
  // JSON-encoded, file part "thumbnail"); JSON otherwise.
  function multipartEdit(user, videoId, fields = {}) {
    const req = api.patch(`/video/${videoId}`);
    if (user) req.set(authHeader(user));
    if (fields.title !== undefined) req.field("title", fields.title);
    if (fields.description !== undefined)
      req.field("description", fields.description);
    if (fields.tags !== undefined)
      req.field("tags", JSON.stringify(fields.tags));
    if (fields.thumbnailUrl !== undefined)
      req.field("thumbnailUrl", fields.thumbnailUrl);
    if (fields.file !== undefined) {
      req.attach("thumbnail", fields.file.bytes, {
        filename: fields.file.filename ?? "thumb.png",
        contentType: fields.file.contentType ?? "image/png",
      });
    }
    return req;
  }

  it("multipart file + title + JSON-encoded tags sets the thumbnail and the fields", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    const res = await multipartEdit(owner, video._id, {
      title: "New title",
      description: "New desc",
      tags: ["react", "hooks"],
      file: { bytes: PNG_BYTES },
    });
    expect(res.status).toBe(200);
    expect(res.body.videotitle).toBe("New title");
    expect(res.body.description).toBe("New desc");
    expect(res.body.tags).toEqual(["react", "hooks"]);
    expect(res.body.thumbnailUrl).toMatch(/^\/uploads\/[^/]+\.png$/);
    expect((await Videofile.findById(video._id)).thumbnailUrl).toBe(
      res.body.thumbnailUrl,
    );
  });

  it("file beats a pasted thumbnailUrl sent in the same multipart request", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    const res = await multipartEdit(owner, video._id, {
      thumbnailUrl: "http://127.0.0.1:1/unreachable.png",
      file: { bytes: PNG_BYTES },
    });
    expect(res.status).toBe(200);
    expect(res.body.thumbnailUrl).toMatch(/^\/uploads\//);
  });

  it("a non-JSON tags string is 400 (Zod still validates the parsed body)", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    const res = await api
      .patch(`/video/${video._id}`)
      .set(authHeader(owner))
      .field("title", "x")
      .field("tags", "not json")
      .attach("thumbnail", PNG_BYTES, {
        filename: "thumb.png",
        contentType: "image/png",
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("wrong-MIME file in a multipart edit is 400 and nothing is stored", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    const res = await multipartEdit(owner, video._id, {
      title: "New title",
      file: {
        bytes: Buffer.from("not an image"),
        filename: "notes.txt",
        contentType: "text/plain",
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const after = await Videofile.findById(video._id);
    expect(after.videotitle).not.toBe("New title");
    expect(after.thumbnailUrl).toBeNull();
  });

  it("oversize file in a multipart edit is 400 naming the 5 MB limit", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    const res = await multipartEdit(owner, video._id, {
      file: { bytes: Buffer.alloc(5 * 1024 * 1024 + 1, 0) },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toBe("File must be less than 5 MB");
  });

  it("multipart edit by a non-owner is 403", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const video = await ownVideo(owner);
    // The modal always sends title + fields with the file; a
    // file-only PATCH is 400 ("at least one field is required")
    // before the owner check runs — same as JSON PATCH.
    const res = await multipartEdit(stranger, video._id, {
      title: "Hijack",
      file: { bytes: PNG_BYTES },
    });
    expect(res.status).toBe(403);
    expect((await Videofile.findById(video._id)).thumbnailUrl).toBeNull();
  });
});
