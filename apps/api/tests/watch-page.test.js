import { describe, expect, it, vi, afterAll, beforeAll } from "vitest";
import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { api, authHeader, createUser, createVideo } from "./helpers.js";
import Comment from "../Models/comment.js";
import Videofile from "../Models/videofile.js";
import Subscription from "../Models/Subscription.js";

// Watch page (backend): comment post fix, comment like/dislike,
// subscriptions, chapters, comment-list filtering. Nothing here
// touches apps/web.
//
// The upload test needs the same Cloudinary mock as video.test.js
// (per-file mock: it applies to this file only). Multer still writes
// the received file to apps/api/uploads; the file is a fake-mp4
// buffer, and the mocked upload returns a fixed duration.
vi.mock("../cloudinary.js", () => ({
  isCloudinaryConfigured: vi.fn(() => true),
  uploadOnCloudinary: vi.fn(async () => ({
    url: "https://res.cloudinary.com/test/video/upload/test.mp4",
    secure_url: "https://res.cloudinary.com/test/video/upload/test.mp4",
    duration: 42,
    thumbnail_url: "https://res.cloudinary.com/test/video/upload/test.jpg",
    eager: [],
  })),
  extractEagerThumbnailUrls: () => [],
}));

const CHAPTERS = [
  { title: "Intro", startSec: 0 },
  { title: "Deep dive", startSec: 120 },
  { title: "Wrap-up", startSec: 300 },
];

// Multer writes the uploaded file to apps/api/uploads even though the
// Cloudinary upload is mocked — clean up any files this suite creates
// (same pattern as video.test.js).
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

async function postCommentAs(user, body) {
  return api.post("/comment/post").set(authHeader(user)).send(body);
}

describe("Watch page — comment post fix (parentId: null)", () => {
  it("posts a top-level comment with the exact web payload (parentId: null) → 200", async () => {
    const user = await createUser();
    const video = await createVideo();
    const res = await postCommentAs(user, {
      videoid: String(video._id),
      userid: String(user._id),
      commentbody: "Top-level with null parent",
      usercommented: user.username,
      parentId: null,
    });
    expect(res.status).toBe(200);
    const saved = await Comment.findOne({
      commentbody: "Top-level with null parent",
    });
    expect(saved).not.toBeNull();
    expect(saved.parentId).toBeNull();
  });

  it("posts a top-level comment with parentId omitted → 200", async () => {
    const user = await createUser();
    const video = await createVideo();
    const res = await postCommentAs(user, {
      videoid: String(video._id),
      commentbody: "Top-level, no parentId key",
      usercommented: user.username,
    });
    expect(res.status).toBe(200);
  });

  it("posts a reply with a real parentId → 200", async () => {
    const user = await createUser();
    const video = await createVideo();
    const parent = await Comment.create({
      videoid: String(video._id),
      userid: String(user._id),
      commentbody: "Parent",
      usercommented: user.username,
      parentId: null,
    });
    const res = await postCommentAs(user, {
      videoid: String(video._id),
      commentbody: "Reply",
      usercommented: user.username,
      parentId: String(parent._id),
    });
    expect(res.status).toBe(200);
    const saved = await Comment.findOne({ commentbody: "Reply" });
    expect(String(saved.parentId)).toBe(String(parent._id));
  });

  it("rejects a reply to a parent on another video → 400", async () => {
    const user = await createUser();
    const videoA = await createVideo();
    const videoB = await createVideo();
    const parent = await Comment.create({
      videoid: String(videoA._id),
      userid: String(user._id),
      commentbody: "Parent on A",
      usercommented: user.username,
      parentId: null,
    });
    const res = await postCommentAs(user, {
      videoid: String(videoB._id),
      commentbody: "Reply to A's parent from B",
      usercommented: user.username,
      parentId: String(parent._id),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("Watch page — comment like / dislike", () => {
  async function seedComment() {
    const user = await createUser();
    const comment = await Comment.create({
      videoid: "v1",
      userid: String(user._id),
      commentbody: "React to me",
      usercommented: user.username,
    });
    return { user, comment };
  }

  it("POST /comment/:id/like toggles the caller's like on and off", async () => {
    const { user, comment } = await seedComment();
    const headers = authHeader(user);
    const on = await api.post(`/comment/${comment._id}/like`).set(headers);
    expect(on.status).toBe(200);
    expect(on.body).toEqual({ likes: 1, dislikes: 0, userReaction: "like" });
    const off = await api.post(`/comment/${comment._id}/like`).set(headers);
    expect(off.status).toBe(200);
    expect(off.body).toEqual({ likes: 0, dislikes: 0, userReaction: null });
    const stored = await Comment.findById(comment._id);
    expect(stored.likedBy).toEqual([]);
  });

  it("liking removes a dislike and vice versa (one reaction per user)", async () => {
    const { user, comment } = await seedComment();
    const headers = authHeader(user);
    const disliked = await api
      .post(`/comment/${comment._id}/dislike`)
      .set(headers);
    expect(disliked.body).toEqual({
      likes: 0,
      dislikes: 1,
      userReaction: "dislike",
    });
    const liked = await api.post(`/comment/${comment._id}/like`).set(headers);
    expect(liked.body).toEqual({
      likes: 1,
      dislikes: 0,
      userReaction: "like",
    });
    const dislikedAgain = await api
      .post(`/comment/${comment._id}/dislike`)
      .set(headers);
    expect(dislikedAgain.body).toEqual({
      likes: 0,
      dislikes: 1,
      userReaction: "dislike",
    });
    const stored = await Comment.findById(comment._id);
    expect(stored.likedBy).toEqual([]);
    expect(stored.dislikedBy).toHaveLength(1);
  });

  it("counts reactions across users honestly", async () => {
    const { user, comment } = await seedComment();
    const other = await createUser();
    await api.post(`/comment/${comment._id}/like`).set(authHeader(user));
    await api.post(`/comment/${comment._id}/like`).set(authHeader(other));
    await api.post(`/comment/${comment._id}/dislike`).set(authHeader(user));
    const res = await api
      .post(`/comment/${comment._id}/like`)
      .set(authHeader(user));
    // user: dislike -> like (switch); other: like. Totals: 2 likes.
    expect(res.body).toEqual({ likes: 2, dislikes: 0, userReaction: "like" });
  });

  it("requires auth (401) for like and dislike", async () => {
    const { comment } = await seedComment();
    expect((await api.post(`/comment/${comment._id}/like`)).status).toBe(401);
    expect((await api.post(`/comment/${comment._id}/dislike`)).status).toBe(
      401,
    );
  });

  it("returns 404 for an unknown id and for a malformed id", async () => {
    const { user } = await seedComment();
    const headers = authHeader(user);
    const missing = new mongoose.Types.ObjectId();
    expect(
      (await api.post(`/comment/${missing}/like`).set(headers)).status,
    ).toBe(404);
    expect(
      (await api.post(`/comment/${missing}/dislike`).set(headers)).status,
    ).toBe(404);
    expect(
      (await api.post("/comment/not-an-objectid/like").set(headers)).status,
    ).toBe(404);
    expect(
      (await api.post("/comment/not-an-objectid/dislike").set(headers))
        .status,
    ).toBe(404);
  });

  it("GET /comment/get includes likes, dislikes and userReaction (null when anonymous)", async () => {
    const user = await createUser();
    const other = await createUser();
    const video = await createVideo();
    const comment = await Comment.create({
      videoid: String(video._id),
      userid: String(user._id),
      commentbody: "List me with reactions",
      usercommented: user.username,
    });
    await api.post(`/comment/${comment._id}/like`).set(authHeader(user));
    await api
      .post(`/comment/${comment._id}/dislike`)
      .set(authHeader(other));

    const authed = await api
      .get(`/comment/get?videoid=${video._id}`)
      .set(authHeader(user));
    expect(authed.status).toBe(200);
    const mine = authed.body.items.find(
      (c) => String(c._id) === String(comment._id),
    );
    expect(mine.likes).toBe(1);
    expect(mine.dislikes).toBe(1);
    expect(mine.userReaction).toBe("like");

    const anon = await api.get(`/comment/get?videoid=${video._id}`);
    const anonItem = anon.body.items.find(
      (c) => String(c._id) === String(comment._id),
    );
    expect(anonItem.likes).toBe(1);
    expect(anonItem.dislikes).toBe(1);
    expect(anonItem.userReaction).toBeNull();
  });
});

describe("Watch page — subscriptions", () => {
  it("POST /subscriptions/:channelId/toggle subscribes and unsubscribes (idempotent)", async () => {
    const subscriber = await createUser();
    const channel = await createUser();
    const headers = authHeader(subscriber);

    const on = await api
      .post(`/subscriptions/${channel._id}/toggle`)
      .set(headers);
    expect(on.status).toBe(200);
    expect(on.body).toEqual({ subscribed: true, subscriberCount: 1 });
    expect(
      await Subscription.countDocuments({ channelId: String(channel._id) }),
    ).toBe(1);

    const off = await api
      .post(`/subscriptions/${channel._id}/toggle`)
      .set(headers);
    expect(off.status).toBe(200);
    expect(off.body).toEqual({ subscribed: false, subscriberCount: 0 });
    expect(
      await Subscription.countDocuments({ channelId: String(channel._id) }),
    ).toBe(0);
  });

  it("double-toggle never creates duplicate rows", async () => {
    const subscriber = await createUser();
    const channel = await createUser();
    const headers = authHeader(subscriber);
    for (let i = 0; i < 4; i += 1) {
      const res = await api
        .post(`/subscriptions/${channel._id}/toggle`)
        .set(headers);
      expect(res.status).toBe(200);
    }
    // on, off, on, off — back to zero rows, never two.
    expect(
      await Subscription.countDocuments({ channelId: String(channel._id) }),
    ).toBe(0);
    await api.post(`/subscriptions/${channel._id}/toggle`).set(headers);
    expect(
      await Subscription.countDocuments({ channelId: String(channel._id) }),
    ).toBe(1);
  });

  it("counts subscribers honestly across users", async () => {
    const a = await createUser();
    const b = await createUser();
    const channel = await createUser();
    await api
      .post(`/subscriptions/${channel._id}/toggle`)
      .set(authHeader(a));
    const second = await api
      .post(`/subscriptions/${channel._id}/toggle`)
      .set(authHeader(b));
    expect(second.body).toEqual({ subscribed: true, subscriberCount: 2 });
    const status = await api.get(`/subscriptions/${channel._id}`);
    expect(status.body.subscriberCount).toBe(2);
  });

  it("rejects subscribing to your own channel with 400", async () => {
    const user = await createUser();
    const res = await api
      .post(`/subscriptions/${user._id}/toggle`)
      .set(authHeader(user));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(
      await Subscription.countDocuments({ channelId: String(user._id) }),
    ).toBe(0);
  });

  it("returns 404 for an unknown channel and for a malformed id", async () => {
    const user = await createUser();
    const headers = authHeader(user);
    const missing = new mongoose.Types.ObjectId();
    expect(
      (await api.post(`/subscriptions/${missing}/toggle`).set(headers))
        .status,
    ).toBe(404);
    expect((await api.get(`/subscriptions/${missing}`)).status).toBe(404);
    expect(
      (await api.post("/subscriptions/not-an-objectid/toggle").set(headers))
        .status,
    ).toBe(404);
    expect((await api.get("/subscriptions/not-an-objectid")).status).toBe(
      404,
    );
  });

  it("toggle requires auth (401); GET status is public", async () => {
    const channel = await createUser();
    expect(
      (await api.post(`/subscriptions/${channel._id}/toggle`)).status,
    ).toBe(401);
    const res = await api.get(`/subscriptions/${channel._id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ subscribed: false, subscriberCount: 0 });
  });

  it("GET /subscriptions/:channelId reports subscribed for the caller only", async () => {
    const subscriber = await createUser();
    const stranger = await createUser();
    const channel = await createUser();
    await api
      .post(`/subscriptions/${channel._id}/toggle`)
      .set(authHeader(subscriber));

    const mine = await api
      .get(`/subscriptions/${channel._id}`)
      .set(authHeader(subscriber));
    expect(mine.body).toEqual({ subscribed: true, subscriberCount: 1 });
    const theirs = await api
      .get(`/subscriptions/${channel._id}`)
      .set(authHeader(stranger));
    expect(theirs.body).toEqual({ subscribed: false, subscriberCount: 1 });
    const anon = await api.get(`/subscriptions/${channel._id}`);
    expect(anon.body).toEqual({ subscribed: false, subscriberCount: 1 });
  });

  it("GET /user/getallchannel items carry subscriberCount + subscribed", async () => {
    const subscriber = await createUser();
    const channel = await createUser();
    const anon = await api.get("/user/getallchannel");
    const anonItem = anon.body.items.find(
      (c) => String(c._id) === String(channel._id),
    );
    expect(anonItem.subscriberCount).toBe(0);
    expect(anonItem.subscribed).toBe(false);

    await api
      .post(`/subscriptions/${channel._id}/toggle`)
      .set(authHeader(subscriber));
    const authed = await api
      .get("/user/getallchannel")
      .set(authHeader(subscriber));
    const item = authed.body.items.find(
      (c) => String(c._id) === String(channel._id),
    );
    expect(item.subscriberCount).toBe(1);
    expect(item.subscribed).toBe(true);
  });

  it("GET /video/:id carries subscriberCount + subscribed for its channel", async () => {
    const subscriber = await createUser();
    const owner = await createUser();
    const video = await createVideo({ videochanel: String(owner._id) });

    const anon = await api.get(`/video/${video._id}`);
    expect(anon.status).toBe(200);
    expect(anon.body.subscriberCount).toBe(0);
    expect(anon.body.subscribed).toBe(false);

    await api
      .post(`/subscriptions/${owner._id}/toggle`)
      .set(authHeader(subscriber));
    const authed = await api
      .get(`/video/${video._id}`)
      .set(authHeader(subscriber));
    expect(authed.body.subscriberCount).toBe(1);
    expect(authed.body.subscribed).toBe(true);

    const ownerView = await api
      .get(`/video/${video._id}`)
      .set(authHeader(owner));
    expect(ownerView.body.subscriberCount).toBe(1);
    expect(ownerView.body.subscribed).toBe(false);
  });
});

describe("Watch page — chapters", () => {
  it("PATCH /video/:id round-trips valid chapters and GET returns them", async () => {
    const owner = await createUser();
    const video = await createVideo({ videochanel: String(owner._id) });
    const res = await api
      .patch(`/video/${video._id}`)
      .set(authHeader(owner))
      .send({ chapters: CHAPTERS });
    expect(res.status).toBe(200);
    expect(res.body.chapters).toEqual(
      CHAPTERS.map((c) => expect.objectContaining(c)),
    );
    const fetched = await api.get(`/video/${video._id}`);
    expect(fetched.body.chapters).toEqual(
      CHAPTERS.map((c) => expect.objectContaining(c)),
    );
    const saved = await Videofile.findById(video._id);
    expect(saved.chapters.map((c) => c.toObject())).toEqual(
      CHAPTERS.map((c) => expect.objectContaining(c)),
    );
  });

  it("POST /video/uploadvideo persists chapters sent as a FormData JSON string", async () => {
    const user = await createUser();
    const res = await api
      .post("/video/uploadvideo")
      .set(authHeader(user))
      .attach("file", Buffer.from("fake-mp4-bytes"), {
        filename: "clip.mp4",
        contentType: "video/mp4",
      })
      .field("title", "Chaptered upload")
      .field("chanel", "test-channel")
      .field("chapters", JSON.stringify(CHAPTERS));
    expect(res.status).toBe(200);
    expect(res.body.video.chapters).toEqual(
      CHAPTERS.map((c) => expect.objectContaining(c)),
    );
    const saved = await Videofile.findOne({ videotitle: "Chaptered upload" });
    expect(saved.chapters.map((c) => c.toObject())).toEqual(
      CHAPTERS.map((c) => expect.objectContaining(c)),
    );
  });

  it.each([
    ["negative startSec", [{ title: "Bad", startSec: -1 }]],
    ["empty title", [{ title: "", startSec: 0 }]],
    [
      "title over 120 chars",
      [{ title: "x".repeat(121), startSec: 0 }],
    ],
    [
      "unsorted startSec",
      [
        { title: "Later", startSec: 120 },
        { title: "Earlier", startSec: 10 },
      ],
    ],
    [
      "duplicate startSec",
      [
        { title: "One", startSec: 60 },
        { title: "Two", startSec: 60 },
      ],
    ],
  ])("PATCH rejects invalid chapters (%s) with 400 VALIDATION_ERROR", async (_label, chapters) => {
    const owner = await createUser();
    const video = await createVideo({ videochanel: String(owner._id) });
    const res = await api
      .patch(`/video/${video._id}`)
      .set(authHeader(owner))
      .send({ chapters });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const saved = await Videofile.findById(video._id);
    expect(saved.chapters).toEqual([]);
  });

  it("a video without chapters returns an empty chapters list", async () => {
    const video = await createVideo();
    const res = await api.get(`/video/${video._id}`);
    expect(res.status).toBe(200);
    expect(res.body.chapters ?? []).toEqual([]);
  });

  it("PATCH with an empty chapters array clears chapters", async () => {
    const owner = await createUser();
    const video = await createVideo({
      videochanel: String(owner._id),
      chapters: CHAPTERS,
    });
    const res = await api
      .patch(`/video/${video._id}`)
      .set(authHeader(owner))
      .send({ chapters: [] });
    expect(res.status).toBe(200);
    expect(res.body.chapters).toEqual([]);
  });
});

describe("Watch page — comment list filtering (no change expected)", () => {
  it("GET /comment/get?videoid= returns only that video's comments", async () => {
    const user = await createUser();
    const videoA = await createVideo();
    const videoB = await createVideo();
    await Comment.create({
      videoid: String(videoA._id),
      userid: String(user._id),
      commentbody: "For A only",
    });
    await Comment.create({
      videoid: String(videoB._id),
      userid: String(user._id),
      commentbody: "For B only",
    });
    const res = await api.get(`/comment/get?videoid=${videoA._id}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].commentbody).toBe("For A only");
  });
});

// Watch page: >50-comments residual. The list sorts oldest-first
// with limit capped at 50, so a new comment past #50 sits on page 2
// and never appears after refetch (the client only fetches page 1).
// ?sort=newest flips the order; the default stays oldest-first so
// Studio is unaffected.
describe("Watch page — comment list newest-first sort", () => {
  it("GET /comment/get?sort=newest returns the newest comment first on page 1", async () => {
    const user = await createUser();
    const video = await createVideo();
    const base = Date.now();
    const rows = Array.from({ length: 51 }, (_, i) => ({
      videoid: String(video._id),
      userid: String(user._id),
      commentbody: `Comment ${i + 1} of 51`,
      usercommented: user.username,
      commentedon: new Date(base + i * 1000),
    }));
    await Comment.insertMany(rows);
    const res = await api.get(
      `/comment/get?videoid=${video._id}&limit=50&sort=newest`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(50);
    expect(res.body.items[0].commentbody).toBe("Comment 51 of 51");
    expect(res.body.items[49].commentbody).toBe("Comment 2 of 51");
  });

  it("GET /comment/get without sort still returns oldest-first (Studio default)", async () => {
    const user = await createUser();
    const video = await createVideo();
    const base = Date.now();
    const rows = Array.from({ length: 3 }, (_, i) => ({
      videoid: String(video._id),
      userid: String(user._id),
      commentbody: `Oldest-first ${i + 1}`,
      usercommented: user.username,
      commentedon: new Date(base + i * 1000),
    }));
    await Comment.insertMany(rows);
    const res = await api.get(`/comment/get?videoid=${video._id}`);
    expect(res.status).toBe(200);
    expect(res.body.items.map((c) => c.commentbody)).toEqual([
      "Oldest-first 1",
      "Oldest-first 2",
      "Oldest-first 3",
    ]);
  });

  it("GET /comment/get?sort=bogus is rejected (400)", async () => {
    const res = await api.get("/comment/get?sort=bogus");
    expect(res.status).toBe(400);
  });
});
