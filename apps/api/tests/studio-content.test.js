// Content-page API contract (Studio Content cleanup): the list rows the
// table renders, the per-video analytics link target, and the
// non-owner 403 regression for every row action (edit / visibility /
// delete / restore / analytics). Nothing here touches apps/web.
import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { api, authHeader, createUser, createVideo } from "./helpers.js";
import Videofile from "../Models/videofile.js";
import ViewEvent from "../Models/ViewEvent.js";

const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () =>
  new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function ownVideo(user, overrides = {}) {
  return createVideo({ videochanel: String(user._id), ...overrides });
}

/** One counted view per (viewer, video, day) — the ViewEvent upsert key. */
async function seedView(video, channel, day, viewer, completed = false) {
  return ViewEvent.create({
    videoid: String(video._id),
    videochanel: String(channel._id),
    viewer,
    day,
    watchSeconds: 0,
    completed,
  });
}

describe("GET /studio/videos (Content table rows)", () => {
  it("lists only the caller's videos, newest first, with every field the table renders", async () => {
    const owner = await createUser();
    const other = await createUser();
    const live = await ownVideo(owner, {
      videotitle: "Live video",
      visibility: "public",
      views: 12,
      Like: 4,
      description: "A description",
      tags: ["react", "demo"],
      thumbnailUrl: "https://example.com/thumb.jpg",
    });
    const deleted = await ownVideo(owner, {
      videotitle: "Deleted video",
      visibility: "draft",
      deletedAt: new Date(),
    });
    await ownVideo(other, { videotitle: "Someone else's video" });

    const res = await api
      .get("/studio/videos?limit=10")
      .set(authHeader(owner));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    // Newest first: the deleted video was created second.
    expect(String(res.body.items[0]._id)).toBe(String(deleted._id));
    expect(String(res.body.items[1]._id)).toBe(String(live._id));
    const row = res.body.items[1];
    // Every column / affordance of the Content table reads one of these.
    expect(row).toMatchObject({
      videotitle: "Live video",
      visibility: "public",
      views: 12,
      Like: 4,
      description: "A description",
      tags: ["react", "demo"],
      thumbnailUrl: "https://example.com/thumb.jpg",
      deletedAt: null,
    });
    expect(row.createdAt).toBeTruthy();
    expect(row.thumbnail).toBeDefined();
    // A soft-deleted own video STAYS listed (with deletedAt) so its
    // owner can restore it from the table.
    expect(res.body.items[0].deletedAt).toBeTruthy();
    expect(res.body.items[0].visibility).toBe("draft");
  });

  it("returns 401 without a token", async () => {
    const res = await api.get("/studio/videos");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("GET /studio/videos/:id/analytics (per-video analytics)", () => {
  it("owner gets the daily view/completion series from ViewEvents, totals, and bestDay", async () => {
    const owner = await createUser();
    // 5-minute video: each completion contributes min(300, 600) / 60 = 5
    // watch minutes (same capped formula recordWatchComplete uses).
    const video = await ownVideo(owner, {
      views: 40,
      Like: 9,
      durationSec: 300,
      duration: 300,
    });
    await seedView(video, owner, today(), "viewer-a", true);
    await seedView(video, owner, today(), "viewer-b", true);
    await seedView(video, owner, today(), "viewer-c", false);
    await seedView(video, owner, yesterday(), "viewer-a", true);
    // Another creator's video with events the same days must not leak in.
    const otherVideo = await ownVideo(await createUser(), {});
    await seedView(otherVideo, owner, today(), "viewer-z", true);

    const res = await api
      .get(`/studio/videos/${video._id}/analytics`)
      .set(authHeader(owner));
    expect(res.status).toBe(200);
    expect(res.body.range).toBe(28);
    expect(res.body.days).toHaveLength(28);
    const todayRow = res.body.days.find((d) => d.date === today());
    const yRow = res.body.days.find((d) => d.date === yesterday());
    expect(todayRow).toMatchObject({
      views: 3,
      completions: 2,
      watchMinutes: 10,
    });
    expect(yRow).toMatchObject({
      views: 1,
      completions: 1,
      watchMinutes: 5,
    });
    expect(res.body.days[0]).toMatchObject({
      views: 0,
      completions: 0,
      watchMinutes: 0,
    });
    expect(res.body.totals).toMatchObject({
      views: 4,
      completions: 3,
      watchMinutes: 15,
    });
    expect(res.body.bestDay).toEqual({ date: today(), views: 3 });
    // The video block carries the all-time counters (the per-video
    // Like counter; there is no honest per-day like series).
    expect(res.body.video).toMatchObject({
      videotitle: video.videotitle,
      visibility: "public",
      views: 40,
      likes: 9,
    });
    expect(String(res.body.video._id)).toBe(String(video._id));
  });

  it("range=7 returns 7 days; a video with no events shows 0s and bestDay null", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner, {});
    const res = await api
      .get(`/studio/videos/${video._id}/analytics?range=7`)
      .set(authHeader(owner));
    expect(res.status).toBe(200);
    expect(res.body.days).toHaveLength(7);
    expect(res.body.totals).toMatchObject({
      views: 0,
      completions: 0,
      watchMinutes: 0,
    });
    expect(res.body.bestDay).toBeNull();
    expect(res.body.video).toMatchObject({ views: 0, likes: 0 });
  });

  it("rejects range=365 with 400 and a malformed id with 400", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner, {});
    const badRange = await api
      .get(`/studio/videos/${video._id}/analytics?range=365`)
      .set(authHeader(owner));
    expect(badRange.status).toBe(400);
    expect(badRange.body.error.code).toBe("VALIDATION_ERROR");
    const badId = await api
      .get("/studio/videos/not-an-objectid/analytics")
      .set(authHeader(owner));
    expect(badId.status).toBe(400);
    expect(badId.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("404s for a missing video and for a soft-deleted video (owner included)", async () => {
    const owner = await createUser();
    const missing = new mongoose.Types.ObjectId();
    const gone = await api
      .get(`/studio/videos/${missing}/analytics`)
      .set(authHeader(owner));
    expect(gone.status).toBe(404);
    expect(gone.body.error.code).toBe("NOT_FOUND");

    const deleted = await ownVideo(owner, { deletedAt: new Date() });
    const res = await api
      .get(`/studio/videos/${deleted._id}/analytics`)
      .set(authHeader(owner));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 401 without a token and 403 for a non-owner (even a public video)", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const video = await ownVideo(owner, { visibility: "public" });
    const anon = await api.get(`/studio/videos/${video._id}/analytics`);
    expect(anon.status).toBe(401);
    const forbidden = await api
      .get(`/studio/videos/${video._id}/analytics`)
      .set(authHeader(stranger));
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error).toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("non-owner 403 regression (Content row actions)", () => {
  it("edit, visibility change, delete, restore, and analytics on another user's video are all 403 and change nothing", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const video = await ownVideo(owner, {
      videotitle: "Original title",
      visibility: "public",
    });

    const edit = await api
      .patch(`/video/${video._id}`)
      .set(authHeader(stranger))
      .send({ title: "Hijacked title" });
    expect(edit.status).toBe(403);
    expect(edit.body.error).toMatchObject({ code: "FORBIDDEN" });

    const visibility = await api
      .patch(`/video/${video._id}`)
      .set(authHeader(stranger))
      .send({ visibility: "private" });
    expect(visibility.status).toBe(403);
    expect(visibility.body.error).toMatchObject({ code: "FORBIDDEN" });

    const del = await api
      .delete(`/video/${video._id}`)
      .set(authHeader(stranger));
    expect(del.status).toBe(403);
    expect(del.body.error).toMatchObject({ code: "FORBIDDEN" });

    // Restore is 403 for a non-owner even before any delete (the
    // ownership check runs before the not-deleted 400).
    const restore = await api
      .post(`/video/${video._id}/restore`)
      .set(authHeader(stranger));
    expect(restore.status).toBe(403);
    expect(restore.body.error).toMatchObject({ code: "FORBIDDEN" });

    const analytics = await api
      .get(`/studio/videos/${video._id}/analytics`)
      .set(authHeader(stranger));
    expect(analytics.status).toBe(403);
    expect(analytics.body.error).toMatchObject({ code: "FORBIDDEN" });

    // Nothing changed: title, visibility, and deletedAt are untouched.
    const kept = await Videofile.findById(video._id);
    expect(kept.videotitle).toBe("Original title");
    expect(kept.visibility).toBe("public");
    expect(kept.deletedAt).toBeNull();

    // The owner can still delete + restore the video afterwards.
    const ownerDelete = await api
      .delete(`/video/${video._id}`)
      .set(authHeader(owner));
    expect(ownerDelete.status).toBe(200);
    expect(ownerDelete.body.deletedAt).toBeTruthy();
    const ownerRestore = await api
      .post(`/video/${video._id}/restore`)
      .set(authHeader(owner));
    expect(ownerRestore.status).toBe(200);
    expect(ownerRestore.body.deletedAt).toBeNull();
  });
});
