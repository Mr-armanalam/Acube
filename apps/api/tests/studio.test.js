// Phase 5 tests: Creator Studio backend — overview/analytics from
// seeded event rows, visibility rules, owner-only edit/delete,
// view dedup, like/watch-complete daily stats, playlists, library,
// nested comments. Nothing here touches apps/web.
import { describe, expect, it, beforeEach } from "vitest";
import mongoose from "mongoose";
import { api, authHeader, createUser, createVideo } from "./helpers.js";
import Videofile from "../Models/videofile.js";
import Comment from "../Models/comment.js";
import ChannelDailyStat from "../Models/ChannelDailyStat.js";
import ViewEvent from "../Models/ViewEvent.js";
import Playlist from "../Models/Playlist.js";
import LibraryEntry from "../Models/LibraryEntry.js";
import History from "../Models/history.js";
import Watchlater from "../Models/watchlater.js";
import Likedvideo from "../Models/likevideo.js";
import { clearStudioCache } from "../utils/studioCache.js";

const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () =>
  new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function ownVideo(user, overrides = {}) {
  return createVideo({ videochanel: String(user._id), ...overrides });
}

async function seedStat(channel, day, fields) {
  // channel is a User document — its _id, not String(doc), is the
  // channel id (String() on a Mongoose document is not the _id).
  return ChannelDailyStat.create({
    videochanel: String(channel._id ?? channel),
    day,
    ...fields,
  });
}

// The overview/analytics cache is module-level, so clear it between
// tests (user ids are unique per test, but the cache test itself needs
// a known-empty start).
beforeEach(() => {
  clearStudioCache();
});

describe("GET /studio/overview", () => {
  it("totals come from seeded ChannelDailyStat rows, not the video counters", async () => {
    const owner = await createUser();
    const other = await createUser();
    const v1 = await ownVideo(owner, { views: 10, Like: 3 });
    const v2 = await ownVideo(owner, { views: 4, Like: 1 });
    await ownVideo(other, { views: 999, Like: 999 });
    await seedStat(owner, today(), {
      views: 7,
      likes: 2,
      watchMinutes: 12.5,
      completions: 3,
    });
    await seedStat(owner, yesterday(), {
      views: 3,
      likes: 1,
      watchMinutes: 4,
      completions: 1,
    });
    await seedStat(other, today(), { views: 500, likes: 500 });
    await Comment.create({
      videoid: String(v1._id),
      userid: String(owner._id),
      commentbody: "First!",
      usercommented: owner.username,
      commentedon: new Date("2026-11-10T10:00:00Z"),
    });
    await Comment.create({
      videoid: String(v2._id),
      userid: String(other._id),
      commentbody: "Second!",
      usercommented: other.username,
      commentedon: new Date("2026-11-10T11:00:00Z"),
    });
    await Comment.create({
      videoid: "someone-elses-video",
      userid: String(other._id),
      commentbody: "Not mine",
      usercommented: other.username,
    });

    const res = await api.get("/studio/overview").set(authHeader(owner));
    expect(res.status).toBe(200);
    // Event-log totals only — the other creator's 500s are not counted.
    expect(res.body.totals).toMatchObject({
      totalViews: 10,
      totalLikes: 3,
      totalVideos: 2,
      totalComments: 2,
      watchMinutes: 16.5,
      completions: 4,
    });
    // Fallback label: sums of the per-video counters (raw hits).
    expect(res.body.allTime).toMatchObject({ views: 14, likes: 4 });
    expect(res.body.statsSince).toBe(yesterday());
    expect(res.body.topVideos).toHaveLength(2);
    expect(String(res.body.topVideos[0]._id)).toBe(String(v1._id));
    expect(res.body.latestComments).toHaveLength(2);
    expect(res.body.latestComments[0].commentbody).toBe("Second!");
    expect(res.body.latestComments[0].videotitle).toBe(v2.videotitle);
    expect(res.body.channel.email).toBe(owner.email);
  });

  it("a channel with no events shows 0s and statsSince null", async () => {
    const owner = await createUser();
    const res = await api.get("/studio/overview").set(authHeader(owner));
    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({
      totalViews: 0,
      totalLikes: 0,
      totalVideos: 0,
      totalComments: 0,
      watchMinutes: 0,
      completions: 0,
    });
    expect(res.body.statsSince).toBeNull();
    expect(res.body.topVideos).toEqual([]);
    expect(res.body.latestComments).toEqual([]);
  });

  it("overview is cached for 60s per channel and invalidated by an edit", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    const first = await api.get("/studio/overview").set(authHeader(owner));
    expect(first.body.totals.totalVideos).toBe(1);

    await seedStat(owner, today(), { views: 42, likes: 0 });
    const cached = await api.get("/studio/overview").set(authHeader(owner));
    expect(cached.body.totals.totalViews).toBe(0);

    // The creator's own edit invalidates their cache entry.
    const edited = await api
      .patch(`/video/${video._id}`)
      .set(authHeader(owner))
      .send({ title: "Renamed" });
    expect(edited.status).toBe(200);
    const fresh = await api.get("/studio/overview").set(authHeader(owner));
    expect(fresh.body.totals.totalViews).toBe(42);
  });

  it("returns 401 without a token", async () => {
    const res = await api.get("/studio/overview");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("GET /studio/analytics", () => {
  it("defaults to 28 days, returns the daily series + totals + bestDay", async () => {
    const owner = await createUser();
    await seedStat(owner, today(), {
      views: 5,
      likes: 2,
      watchMinutes: 9.5,
      completions: 2,
    });
    await seedStat(owner, yesterday(), {
      views: 3,
      likes: 1,
      watchMinutes: 4,
      completions: 1,
    });

    const res = await api.get("/studio/analytics").set(authHeader(owner));
    expect(res.status).toBe(200);
    expect(res.body.range).toBe(28);
    expect(res.body.days).toHaveLength(28);
    const todayRow = res.body.days.find((d) => d.date === today());
    const yRow = res.body.days.find((d) => d.date === yesterday());
    expect(todayRow).toMatchObject({ views: 5, watchMinutes: 9.5, likes: 2 });
    expect(yRow).toMatchObject({ views: 3, watchMinutes: 4, likes: 1 });
    // Days with no events are zeros, not missing.
    expect(res.body.days[0]).toMatchObject({ views: 0, watchMinutes: 0, likes: 0 });
    expect(res.body.totals).toMatchObject({
      views: 8,
      watchMinutes: 13.5,
      likes: 3,
      completions: 3,
    });
    expect(res.body.bestDay).toEqual({ date: today(), views: 5 });
  });

  it("range=7 returns 7 days, range=90 returns 90", async () => {
    const owner = await createUser();
    const seven = await api
      .get("/studio/analytics?range=7")
      .set(authHeader(owner));
    expect(seven.status).toBe(200);
    expect(seven.body.days).toHaveLength(7);
    const ninety = await api
      .get("/studio/analytics?range=90")
      .set(authHeader(owner));
    expect(ninety.status).toBe(200);
    expect(ninety.body.days).toHaveLength(90);
  });

  it("bestDay is null when there are no views", async () => {
    const owner = await createUser();
    const res = await api
      .get("/studio/analytics?range=7")
      .set(authHeader(owner));
    expect(res.status).toBe(200);
    expect(res.body.bestDay).toBeNull();
    expect(res.body.totals).toMatchObject({ views: 0, likes: 0 });
  });

  it("rejects range=365 with 400", async () => {
    const owner = await createUser();
    const res = await api
      .get("/studio/analytics?range=365")
      .set(authHeader(owner));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 without a token", async () => {
    const res = await api.get("/studio/analytics?range=7");
    expect(res.status).toBe(401);
  });
});

describe("visibility rules", () => {
  it("the feed lists public videos only — unlisted and private excluded", async () => {
    const pub = await createVideo({ videotitle: "public-one" });
    await createVideo({ videotitle: "unlisted-one", visibility: "unlisted" });
    await createVideo({ videotitle: "private-one", visibility: "private" });
    const res = await api.get("/video/getvideos");
    expect(res.status).toBe(200);
    const titles = res.body.items.map((v) => v.videotitle);
    expect(titles).toContain("public-one");
    expect(titles).not.toContain("unlisted-one");
    expect(titles).not.toContain("private-one");
    expect(res.body.items.some((v) => String(v._id) === String(pub._id))).toBe(true);
  });

  it("a legacy video with no visibility field is treated as public in the feed", async () => {
    await Videofile.collection.insertOne({
      videotitle: "legacy-no-field",
      filename: "legacy.mp4",
      filetype: "video/mp4",
      filepath: "https://example.com/legacy.mp4",
      filesize: "1",
      videochanel: "test-channel",
      Like: 0,
      views: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const res = await api.get("/video/getvideos");
    expect(res.body.items.map((v) => v.videotitle)).toContain("legacy-no-field");
  });

  it("GET /video/:id: public and unlisted for anyone, private 404s for non-owners", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const pub = await ownVideo(owner);
    const unl = await ownVideo(owner, { visibility: "unlisted" });
    const priv = await ownVideo(owner, { visibility: "private" });

    expect((await api.get(`/video/${pub._id}`)).status).toBe(200);
    expect((await api.get(`/video/${unl._id}`)).status).toBe(200);
    expect((await api.get(`/video/${priv._id}`)).status).toBe(404);
    expect(
      (await api.get(`/video/${priv._id}`).set(authHeader(stranger))).status,
    ).toBe(404);
    expect(
      (await api.get(`/video/${priv._id}`).set(authHeader(owner))).status,
    ).toBe(200);

    const missing = new mongoose.Types.ObjectId();
    expect((await api.get(`/video/${missing}`)).status).toBe(404);
    const malformed = await api.get("/video/not-an-objectid");
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("PATCH / DELETE /video/:id", () => {
  it("owner edits title and visibility; unknown fields and empty bodies are 400", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner, { videotitle: "Before" });
    const edited = await api
      .patch(`/video/${video._id}`)
      .set(authHeader(owner))
      .send({ title: "After", visibility: "unlisted" });
    expect(edited.status).toBe(200);
    expect(edited.body.videotitle).toBe("After");
    expect(edited.body.visibility).toBe("unlisted");

    const forged = await api
      .patch(`/video/${video._id}`)
      .set(authHeader(owner))
      .send({ views: 9999 });
    expect(forged.status).toBe(400);
    expect((await Videofile.findById(video._id)).views).toBe(0);

    const empty = await api
      .patch(`/video/${video._id}`)
      .set(authHeader(owner))
      .send({});
    expect(empty.status).toBe(400);

    const tooLong = await api
      .patch(`/video/${video._id}`)
      .set(authHeader(owner))
      .send({ title: "x".repeat(101) });
    expect(tooLong.status).toBe(400);

    const badVisibility = await api
      .patch(`/video/${video._id}`)
      .set(authHeader(owner))
      .send({ visibility: "friends-only" });
    expect(badVisibility.status).toBe(400);
  });

  it("non-owner edit is 403, missing video 404, no token 401", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const video = await ownVideo(owner, { videotitle: "Untouched" });
    const res = await api
      .patch(`/video/${video._id}`)
      .set(authHeader(stranger))
      .send({ title: "Hijacked" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect((await Videofile.findById(video._id)).videotitle).toBe("Untouched");

    const missing = new mongoose.Types.ObjectId();
    expect(
      (await api.patch(`/video/${missing}`).set(authHeader(owner)).send({ title: "x" })).status,
    ).toBe(404);
    expect(
      (await api.patch(`/video/${video._id}`).send({ title: "x" })).status,
    ).toBe(401);
  });

  it("owner delete soft-deletes: the row stays with deletedAt, per-video rows are kept, feed/GET hide it, restore brings it back", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const video = await ownVideo(owner);
    const vid = String(video._id);
    await History.create({ videoid: vid, viewer: String(viewer._id) });
    await Watchlater.create({ videoid: vid, viewer: String(viewer._id) });
    await Likedvideo.create({ videoid: vid, viewer: String(viewer._id) });
    await Comment.create({
      videoid: vid,
      userid: String(viewer._id),
      commentbody: "kept for restore",
    });
    await ViewEvent.create({
      videoid: vid,
      videochanel: String(owner._id),
      viewer: String(viewer._id),
      day: today(),
    });
    await seedStat(owner, today(), { views: 1 });
    const playlist = await Playlist.create({
      owner: String(owner._id),
      title: "Keeps the playlist",
      videoIds: [vid],
    });

    const res = await api
      .delete(`/video/${video._id}`)
      .set(authHeader(owner));
    expect(res.status).toBe(200);
    expect(res.body.deletedAt).toBeTruthy();
    // Phase 5 fix: soft delete — the video row stays, with deletedAt.
    const kept = await Videofile.findById(video._id);
    expect(kept).not.toBeNull();
    expect(kept.deletedAt).not.toBeNull();
    // Per-video rows are KEPT so restore brings the video back whole.
    expect(await History.countDocuments({ videoid: vid })).toBe(1);
    expect(await Watchlater.countDocuments({ videoid: vid })).toBe(1);
    expect(await Likedvideo.countDocuments({ videoid: vid })).toBe(1);
    expect(await Comment.countDocuments({ videoid: vid })).toBe(1);
    expect(await ViewEvent.countDocuments({ videoid: vid })).toBe(1);
    expect(await LibraryEntry.countDocuments({ videoid: vid })).toBe(0);
    expect((await Playlist.findById(playlist._id)).videoIds).toEqual([vid]);
    // Historical aggregates are kept, not rewritten.
    expect(
      await ChannelDailyStat.findOne({
        videochanel: String(owner._id),
        day: today(),
      }),
    ).not.toBeNull();
    // The feed and the single-video read hide it — even for the owner.
    const feed = await api.get("/video/getvideos");
    expect(feed.body.items.some((v) => String(v._id) === vid)).toBe(false);
    expect((await api.get(`/video/${video._id}`)).status).toBe(404);
    expect(
      (await api.get(`/video/${video._id}`).set(authHeader(owner))).status,
    ).toBe(404);
    // A second delete is a 200 no-op, not an error.
    expect(
      (await api.delete(`/video/${video._id}`).set(authHeader(owner))).status,
    ).toBe(200);
    // Restore brings it back, rows and all.
    const restored = await api
      .post(`/video/${video._id}/restore`)
      .set(authHeader(owner));
    expect(restored.status).toBe(200);
    expect(restored.body.deletedAt).toBeNull();
    expect((await Videofile.findById(video._id)).deletedAt).toBeNull();
    expect((await api.get(`/video/${video._id}`)).status).toBe(200);
    expect(await History.countDocuments({ videoid: vid })).toBe(1);
    // Restoring a live video is 400.
    expect(
      (await api.post(`/video/${video._id}/restore`).set(authHeader(owner)))
        .status,
    ).toBe(400);
  });

  it("non-owner delete is 403, missing video 404, no token 401", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const video = await ownVideo(owner);
    expect(
      (await api.delete(`/video/${video._id}`).set(authHeader(stranger))).status,
    ).toBe(403);
    expect(await Videofile.findById(video._id)).not.toBeNull();
    const missing = new mongoose.Types.ObjectId();
    expect(
      (await api.delete(`/video/${missing}`).set(authHeader(owner))).status,
    ).toBe(404);
    expect((await api.delete(`/video/${video._id}`)).status).toBe(401);
  });
});

describe("view dedup + like / watch-complete daily stats", () => {
  it("one counted view per viewer per video per day (video counter still raw)", async () => {
    const viewerA = await createUser();
    const viewerB = await createUser();
    const video = await createVideo({ views: 0 });
    await api.patch(`/video/view/${video._id}`).set(authHeader(viewerA));
    await api.patch(`/video/view/${video._id}`).set(authHeader(viewerA));
    await api.patch(`/video/view/${video._id}`).set(authHeader(viewerB));
    // Raw hit count on the video: 3 calls.
    expect((await Videofile.findById(video._id)).views).toBe(3);
    // Deduped daily stat: A once + B once.
    const stat = await ChannelDailyStat.findOne({
      videochanel: "test-channel",
      day: today(),
    });
    expect(stat.views).toBe(2);
    expect(await ViewEvent.countDocuments({ videoid: String(video._id) })).toBe(2);
  });

  it("like toggle moves daily likes +1/-1, clamped at 0", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner, { Like: 0 });
    const user = await createUser();
    const statOf = () =>
      ChannelDailyStat.findOne({
        videochanel: String(owner._id),
        day: today(),
      });

    await api
      .patch(`/video/like/${video._id}`)
      .set(authHeader(user))
      .send({ action: "like" });
    expect((await statOf()).likes).toBe(1);
    await api
      .patch(`/video/like/${video._id}`)
      .set(authHeader(user))
      .send({ action: "unlike" });
    expect((await statOf()).likes).toBe(0);
    // Unlike at 0 stays 0 — the stat never goes negative.
    await api
      .patch(`/video/like/${video._id}`)
      .set(authHeader(user))
      .send({ action: "unlike" });
    expect((await statOf()).likes).toBe(0);
  });

  it("watch-complete writes completions + capped watchMinutes", async () => {
    const owner = await createUser();
    const watcher = await createUser();
    const short = await ownVideo(owner, { duration: 300 });
    const long = await ownVideo(owner, { duration: 900 });
    const statOf = () =>
      ChannelDailyStat.findOne({
        videochanel: String(owner._id),
        day: today(),
      });

    const first = await api
      .post("/user/watch-complete")
      .set(authHeader(watcher))
      .send({ videoid: String(short._id) });
    expect(first.status).toBe(200);
    expect(await statOf()).toMatchObject({ completions: 1, watchMinutes: 5 });

    // 900s video caps at 600s = 10 minutes.
    await api
      .post("/user/watch-complete")
      .set(authHeader(watcher))
      .send({ videoid: String(long._id) });
    expect(await statOf()).toMatchObject({ completions: 2, watchMinutes: 15 });
  });
});

describe("GET /studio/videos + /studio/comments", () => {
  it("videos lists only the caller's videos, newest first, paginated", async () => {
    const owner = await createUser();
    const other = await createUser();
    await ownVideo(owner, {
      videotitle: "older",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    await ownVideo(owner, {
      videotitle: "newer",
      createdAt: new Date("2026-02-01T00:00:00Z"),
    });
    await ownVideo(other, { videotitle: "not-mine" });

    const res = await api.get("/studio/videos").set(authHeader(owner));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((v) => v.videotitle)).toEqual([
      "newer",
      "older",
    ]);
    expect(res.body).toMatchObject({ page: 1, totalPages: 1 });

    const page2 = await api
      .get("/studio/videos?page=2&limit=1")
      .set(authHeader(owner));
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.items[0].videotitle).toBe("older");
  });

  it("comments lists only comments on the caller's videos, newest first, with videotitle", async () => {
    const owner = await createUser();
    const other = await createUser();
    const mine = await ownVideo(owner);
    const theirs = await ownVideo(other);
    await Comment.create({
      videoid: String(mine._id),
      userid: String(other._id),
      commentbody: "Old comment",
      commentedon: new Date("2026-11-09T10:00:00Z"),
    });
    await Comment.create({
      videoid: String(mine._id),
      userid: String(other._id),
      commentbody: "New comment",
      commentedon: new Date("2026-11-10T10:00:00Z"),
    });
    await Comment.create({
      videoid: String(theirs._id),
      userid: String(owner._id),
      commentbody: "On their video",
    });

    const res = await api.get("/studio/comments").set(authHeader(owner));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items[0].commentbody).toBe("New comment");
    expect(res.body.items[0].videotitle).toBe(mine.videotitle);
    expect(res.body.items[1].commentbody).toBe("Old comment");
  });

  it("studio videos/comments are 401 without a token", async () => {
    expect((await api.get("/studio/videos")).status).toBe(401);
    expect((await api.get("/studio/comments")).status).toBe(401);
  });
});

describe("GET / PATCH /studio/settings", () => {
  it("reads and updates the caller's own channel, including video uploader names", async () => {
    const owner = await createUser({ name: "Old Name", desc: "Old desc" });
    const video = await ownVideo(owner, { uploader: "Old Name" });
    const got = await api.get("/studio/settings").set(authHeader(owner));
    expect(got.status).toBe(200);
    expect(got.body.channel).toMatchObject({
      name: "Old Name",
      desc: "Old desc",
      email: owner.email,
    });

    const patched = await api
      .patch("/studio/settings")
      .set(authHeader(owner))
      .send({ name: "New Name", desc: "New desc" });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe("New Name");
    expect(patched.body.desc).toBe("New desc");
    expect((await Videofile.findById(video._id)).uploader).toBe("New Name");
  });

  it("empty body is 400 and no token is 401", async () => {
    const owner = await createUser();
    expect(
      (await api.patch("/studio/settings").set(authHeader(owner)).send({})).status,
    ).toBe(400);
    expect((await api.get("/studio/settings")).status).toBe(401);
    expect((await api.patch("/studio/settings").send({ name: "x" })).status).toBe(401);
  });
});

describe("playlists", () => {
  it("CRUD: create, list own only, read by visibility, patch add/remove, delete", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const v1 = await ownVideo(owner);
    const v2 = await ownVideo(owner);
    const otherVideo = await ownVideo(stranger);

    const created = await api
      .post("/studio/playlists")
      .set(authHeader(owner))
      .send({ title: "My list", videoIds: [String(v1._id), String(v1._id)] });
    expect(created.status).toBe(201);
    expect(created.body.title).toBe("My list");
    expect(created.body.visibility).toBe("public");
    // Duplicate videoIds are deduped on create.
    expect(created.body.videoIds).toEqual([String(v1._id)]);
    const playlistId = created.body._id;

    // Another creator's list is not in mine.
    await api
      .post("/studio/playlists")
      .set(authHeader(stranger))
      .send({ title: "Theirs" });
    const listed = await api.get("/studio/playlists").set(authHeader(owner));
    expect(listed.status).toBe(200);
    expect(listed.body.total).toBe(1);
    expect(listed.body.items[0].videoCount).toBe(1);

    // Public playlist readable anonymously, with its videos.
    const read = await api.get(`/studio/playlists/${playlistId}`);
    expect(read.status).toBe(200);
    expect(read.body.videos).toHaveLength(1);
    expect(String(read.body.videos[0]._id)).toBe(String(v1._id));

    // Patch: rename + add v2 + add someone else's public video, then remove v1.
    const patched = await api
      .patch(`/studio/playlists/${playlistId}`)
      .set(authHeader(owner))
      .send({
        title: "Renamed",
        addVideoIds: [String(v2._id), String(otherVideo._id)],
      });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe("Renamed");
    expect(patched.body.videoIds).toHaveLength(3);

    const removed = await api
      .patch(`/studio/playlists/${playlistId}`)
      .set(authHeader(owner))
      .send({ removeVideoIds: [String(v1._id)] });
    expect(removed.status).toBe(200);
    expect(removed.body.videoIds).not.toContain(String(v1._id));

    // Non-owner patch/delete are 403.
    expect(
      (
        await api
          .patch(`/studio/playlists/${playlistId}`)
          .set(authHeader(stranger))
          .send({ title: "Hijacked" })
      ).status,
    ).toBe(403);
    expect(
      (await api.delete(`/studio/playlists/${playlistId}`).set(authHeader(stranger)))
        .status,
    ).toBe(403);
    expect(await Playlist.findById(playlistId)).not.toBeNull();

    const deleted = await api
      .delete(`/studio/playlists/${playlistId}`)
      .set(authHeader(owner));
    expect(deleted.status).toBe(200);
    expect(await Playlist.findById(playlistId)).toBeNull();
  });

  it("private playlists 404 for non-owners; create rejects missing videos and others' private videos", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const privateVideo = await ownVideo(stranger, { visibility: "private" });
    const created = await api
      .post("/studio/playlists")
      .set(authHeader(owner))
      .send({ title: "Secret", visibility: "private" });
    expect(created.status).toBe(201);
    const id = created.body._id;
    expect((await api.get(`/studio/playlists/${id}`)).status).toBe(404);
    expect(
      (await api.get(`/studio/playlists/${id}`).set(authHeader(stranger))).status,
    ).toBe(404);
    expect(
      (await api.get(`/studio/playlists/${id}`).set(authHeader(owner))).status,
    ).toBe(200);

    const missing = new mongoose.Types.ObjectId();
    const badVideo = await api
      .post("/studio/playlists")
      .set(authHeader(owner))
      .send({ title: "Bad", videoIds: [String(missing)] });
    expect(badVideo.status).toBe(404);

    const privateOfOther = await api
      .post("/studio/playlists")
      .set(authHeader(owner))
      .send({ title: "Sneaky", videoIds: [String(privateVideo._id)] });
    expect(privateOfOther.status).toBe(403);
  });

  it("playlist routes are 401 without a token", async () => {
    expect((await api.get("/studio/playlists")).status).toBe(401);
    expect(
      (await api.post("/studio/playlists").send({ title: "x" })).status,
    ).toBe(401);
  });
});

// Phase 5 fix: the Watch page's playlist showcase reads the PUBLIC
// GET /watch/:id/playlists (any viewer), not the owner-only
// /studio/playlists list — before this the showcase only rendered
// for the channel owner.
describe("GET /watch/:id/playlists (Watch playlist showcase)", () => {
  it("returns the public playlists containing the video, for any viewer", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const v1 = await ownVideo(owner);
    const v2 = await ownVideo(owner);
    const playlist = await Playlist.create({
      owner: String(owner._id),
      title: "Learning Path",
      visibility: "public",
      videoIds: [String(v1._id), String(v2._id)],
    });
    // A public playlist by someone else containing this video DOES
    // appear (visibility, not ownership, decides); an unlisted one by
    // the owner does NOT.
    await Playlist.create({
      owner: String(viewer._id),
      title: "Other list",
      visibility: "public",
      videoIds: [String(v1._id)],
    });
    await Playlist.create({
      owner: String(owner._id),
      title: "Secret list",
      visibility: "unlisted",
      videoIds: [String(v1._id)],
    });
    // Anonymous (no token) and a non-owner both see the showcase.
    const anon = await api.get(`/watch/${v1._id}/playlists`);
    expect(anon.status).toBe(200);
    expect(anon.body.items).toHaveLength(2);
    expect(anon.body.items.map((p) => p.title).sort()).toEqual([
      "Learning Path",
      "Other list",
    ]);
    const learning = anon.body.items.find((p) => p.title === "Learning Path");
    expect(learning._id).toBe(String(playlist._id));
    expect(learning.videos).toHaveLength(2);
    expect(learning.videos.map((v) => String(v._id))).toEqual([
      String(v1._id),
      String(v2._id),
    ]);
    const asViewer = await api
      .get(`/watch/${v1._id}/playlists`)
      .set(authHeader(viewer));
    expect(asViewer.status).toBe(200);
    expect(asViewer.body.items).toHaveLength(2);
  });

  it("reveals no private playlist, hides invisible member videos, empty when in none", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const v1 = await ownVideo(owner);
    const ownPrivate = await ownVideo(owner, { visibility: "private" });
    await Playlist.create({
      owner: String(owner._id),
      title: "Private list",
      visibility: "private",
      videoIds: [String(v1._id)],
    });
    await Playlist.create({
      owner: String(owner._id),
      title: "Mixed list",
      visibility: "public",
      videoIds: [String(v1._id), String(ownPrivate._id)],
    });
    // The private playlist is not revealed; the public one's private
    // member video is hidden from a non-owner (but visible to the owner).
    const asViewer = await api
      .get(`/watch/${v1._id}/playlists`)
      .set(authHeader(viewer));
    expect(asViewer.status).toBe(200);
    expect(asViewer.body.items).toHaveLength(1);
    expect(asViewer.body.items[0].title).toBe("Mixed list");
    expect(asViewer.body.items[0].videos).toHaveLength(1);
    expect(String(asViewer.body.items[0].videos[0]._id)).toBe(String(v1._id));
    const asOwner = await api
      .get(`/watch/${v1._id}/playlists`)
      .set(authHeader(owner));
    expect(asOwner.body.items[0].videos).toHaveLength(2);
    // A video in no public playlist → empty items, still 200.
    const lonely = await ownVideo(owner);
    const empty = await api.get(`/watch/${lonely._id}/playlists`);
    expect(empty.status).toBe(200);
    expect(empty.body.items).toEqual([]);
  });

  it("404s for a missing video, a soft-deleted video, and a private video for a non-owner", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const missing = new mongoose.Types.ObjectId();
    expect((await api.get(`/watch/${missing}/playlists`)).status).toBe(404);
    const gone = await ownVideo(owner, { deletedAt: new Date() });
    expect((await api.get(`/watch/${gone._id}/playlists`)).status).toBe(404);
    const priv = await ownVideo(owner, { visibility: "private" });
    const asViewer = await api
      .get(`/watch/${priv._id}/playlists`)
      .set(authHeader(viewer));
    expect(asViewer.status).toBe(404);
    const asOwner = await api
      .get(`/watch/${priv._id}/playlists`)
      .set(authHeader(owner));
    expect(asOwner.status).toBe(200);
  });
});

describe("GET / POST / DELETE /studio/library", () => {
  it("saved entries plus legacy watch-later/liked rows, combined", async () => {
    const user = await createUser();
    const other = await createUser();
    const saved = await createVideo();
    const later = await createVideo();
    const liked = await createVideo();
    const theirsPrivate = await ownVideo(other, { visibility: "private" });

    const addSaved = await api
      .post("/studio/library")
      .set(authHeader(user))
      .send({ videoid: String(saved._id), kind: "saved" });
    expect(addSaved.status).toBe(200);

    // Legacy endpoints feed the same library tabs (dual-write).
    await api
      .post("/video/watchlater")
      .set(authHeader(user))
      .send({ videoid: String(later._id), viewer: String(user._id) });
    await api
      .post("/video/likevideo")
      .set(authHeader(user))
      .send({ videoid: String(liked._id), viewer: String(user._id) });
    // A legacy row created before Phase 5 (no LibraryEntry row) is
    // still picked up by the union.
    await Watchlater.create({
      videoid: String(theirsPrivate._id),
      viewer: String(user._id),
    });

    const lib = await api.get("/studio/library").set(authHeader(user));
    expect(lib.status).toBe(200);
    expect(lib.body.saved.map((v) => String(v._id))).toEqual([String(saved._id)]);
    expect(lib.body.watchlater.map((v) => String(v._id))).toEqual([
      String(later._id),
    ]);
    expect(lib.body.liked.map((v) => String(v._id))).toEqual([String(liked._id)]);
    // Someone else's private video never leaks into the library.
    expect(
      lib.body.watchlater.some((v) => String(v._id) === String(theirsPrivate._id)),
    ).toBe(false);
    expect(lib.body.playlists).toEqual([]);
  });

  it("removing entries works from both sides (library + legacy delete)", async () => {
    const user = await createUser();
    const a = await createVideo();
    const b = await createVideo();
    await api
      .post("/studio/library")
      .set(authHeader(user))
      .send({ videoid: String(a._id), kind: "saved" });
    await api
      .post("/video/watchlater")
      .set(authHeader(user))
      .send({ videoid: String(b._id), viewer: String(user._id) });

    const removed = await api
      .delete(`/studio/library/saved/${a._id}`)
      .set(authHeader(user));
    expect(removed.status).toBe(200);
    const libAfter = await api.get("/studio/library").set(authHeader(user));
    expect(libAfter.body.saved).toEqual([]);

    // Legacy delete also clears the library tab.
    await api
      .delete(`/video/deletewatchlater/${b._id}/${user._id}`)
      .set(authHeader(user));
    const libAfter2 = await api.get("/studio/library").set(authHeader(user));
    expect(libAfter2.body.watchlater).toEqual([]);
    expect(
      await LibraryEntry.countDocuments({ userId: String(user._id) }),
    ).toBe(0);
  });

  it("library rejects missing videos, others' private videos, bad kinds; 401 without a token", async () => {
    const user = await createUser();
    const other = await createUser();
    const priv = await ownVideo(other, { visibility: "private" });
    const missing = new mongoose.Types.ObjectId();
    expect(
      (
        await api
          .post("/studio/library")
          .set(authHeader(user))
          .send({ videoid: String(missing), kind: "saved" })
      ).status,
    ).toBe(404);
    expect(
      (
        await api
          .post("/studio/library")
          .set(authHeader(user))
          .send({ videoid: String(priv._id), kind: "saved" })
      ).status,
    ).toBe(403);
    expect(
      (
        await api
          .post("/studio/library")
          .set(authHeader(user))
          .send({ videoid: String(priv._id), kind: "archived" })
      ).status,
    ).toBe(400);
    expect((await api.get("/studio/library")).status).toBe(401);
    expect(
      (await api.post("/studio/library").send({ videoid: String(priv._id), kind: "saved" }))
        .status,
    ).toBe(401);
  });
});

describe("nested comments", () => {
  it("post a reply, fetch it by ?parentId=, and see parentId in the flat list", async () => {
    const author = await createUser();
    const replier = await createUser();
    const video = await createVideo();
    const parent = await Comment.create({
      videoid: String(video._id),
      userid: String(author._id),
      commentbody: "Top level",
      usercommented: author.username,
    });

    const reply = await api
      .post("/comment/post")
      .set(authHeader(replier))
      .send({
        videoid: String(video._id),
        commentbody: "A reply",
        usercommented: replier.username,
        parentId: String(parent._id),
      });
    expect(reply.status).toBe(200);
    const savedReply = await Comment.findOne({ commentbody: "A reply" });
    expect(String(savedReply.parentId)).toBe(String(parent._id));

    const flat = await api.get(`/comment/get?videoid=${video._id}`);
    expect(flat.status).toBe(200);
    expect(flat.body.total).toBe(2);
    const flatReply = flat.body.items.find((c) => c.commentbody === "A reply");
    expect(String(flatReply.parentId)).toBe(String(parent._id));
    const flatParent = flat.body.items.find((c) => c.commentbody === "Top level");
    expect(flatParent.parentId).toBeNull();

    const thread = await api.get(
      `/comment/get?videoid=${video._id}&parentId=${parent._id}`,
    );
    expect(thread.body.total).toBe(1);
    expect(thread.body.items[0].commentbody).toBe("A reply");
  });

  it("replying to a missing parent, a parent on another video, or a deleted parent is 400", async () => {
    const user = await createUser();
    const v1 = await createVideo();
    const v2 = await createVideo();
    const parent = await Comment.create({
      videoid: String(v1._id),
      userid: String(user._id),
      commentbody: "On v1",
    });
    const missing = new mongoose.Types.ObjectId();
    const cases = [
      { videoid: String(v1._id), parentId: String(missing) },
      { videoid: String(v2._id), parentId: String(parent._id) },
    ];
    for (const body of cases) {
      const res = await api
        .post("/comment/post")
        .set(authHeader(user))
        .send({ ...body, commentbody: "bad reply" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("deleting a parent soft-deletes it and hides its subtree from non-owners", async () => {
    const owner = await createUser();
    const author = await createUser();
    const stranger = await createUser();
    const video = await ownVideo(owner);
    const parent = await Comment.create({
      videoid: String(video._id),
      userid: String(author._id),
      commentbody: "Parent to delete",
      usercommented: author.username,
    });
    const reply = await Comment.create({
      videoid: String(video._id),
      userid: String(stranger._id),
      commentbody: "Hidden reply",
      usercommented: stranger.username,
      parentId: String(parent._id),
    });
    await Comment.create({
      videoid: String(video._id),
      userid: String(stranger._id),
      commentbody: "Hidden grandchild",
      usercommented: stranger.username,
      parentId: String(reply._id),
    });

    const deleted = await api
      .delete(`/comment/delete/${parent._id}`)
      .set(authHeader(author));
    expect(deleted.status).toBe(200);
    expect(deleted.body.deleted).toBe(true);
    const kept = await Comment.findById(parent._id);
    expect(kept).not.toBeNull();
    expect(kept.deleted).toBe(true);
    expect(kept.commentbody).toBe("[deleted]");

    // Anonymous: the "[deleted]" placeholder stays, the subtree is gone.
    const anon = await api.get(`/comment/get?videoid=${video._id}`);
    const anonBodies = anon.body.items.map((c) => c.commentbody);
    expect(anonBodies).toContain("[deleted]");
    expect(anonBodies).not.toContain("Hidden reply");
    expect(anonBodies).not.toContain("Hidden grandchild");

    // The video owner still sees the whole thread (moderation view).
    const ownerView = await api
      .get(`/comment/get?videoid=${video._id}`)
      .set(authHeader(owner));
    const ownerBodies = ownerView.body.items.map((c) => c.commentbody);
    expect(ownerBodies).toContain("Hidden reply");
    expect(ownerBodies).toContain("Hidden grandchild");

    // No replying to, or editing, a deleted parent.
    const badReply = await api
      .post("/comment/post")
      .set(authHeader(stranger))
      .send({
        videoid: String(video._id),
        commentbody: "Too late",
        parentId: String(parent._id),
      });
    expect(badReply.status).toBe(400);
    const badEdit = await api
      .patch(`/comment/edit/${parent._id}`)
      .set(authHeader(author))
      .send({ commentbody: "Back from the dead" });
    expect(badEdit.status).toBe(400);
  });

  it("the video owner can delete a comment on their video; others get 403", async () => {
    const owner = await createUser();
    const author = await createUser();
    const stranger = await createUser();
    const video = await ownVideo(owner);
    const c1 = await Comment.create({
      videoid: String(video._id),
      userid: String(author._id),
      commentbody: "Spam on my video",
    });
    const c2 = await Comment.create({
      videoid: String(video._id),
      userid: String(author._id),
      commentbody: "Keep me",
    });

    expect(
      (await api.delete(`/comment/delete/${c1._id}`).set(authHeader(stranger)))
        .status,
    ).toBe(403);
    expect(await Comment.findById(c1._id)).not.toBeNull();

    const ownerDelete = await api
      .delete(`/comment/delete/${c1._id}`)
      .set(authHeader(owner));
    expect(ownerDelete.status).toBe(200);
    expect(await Comment.findById(c1._id)).toBeNull();
    expect(await Comment.findById(c2._id)).not.toBeNull();
  });
});

describe("DELETE /video/deletehistory/:videoid/:viewer (Phase 5)", () => {
  it("the viewer removes one row; another viewer gets 403; a missing row is 404", async () => {
    const viewer = await createUser();
    const stranger = await createUser();
    const video = await ownVideo(viewer);
    const otherVideo = await ownVideo(viewer);
    await History.create({ videoid: String(video._id), viewer: String(viewer._id) });
    await History.create({ videoid: String(otherVideo._id), viewer: String(viewer._id) });

    const forbidden = await api
      .delete(`/video/deletehistory/${video._id}/${viewer._id}`)
      .set(authHeader(stranger));
    expect(forbidden.status).toBe(403);
    expect(
      await History.findOne({ videoid: String(video._id), viewer: String(viewer._id) }),
    ).not.toBeNull();

    const removed = await api
      .delete(`/video/deletehistory/${video._id}/${viewer._id}`)
      .set(authHeader(viewer));
    expect(removed.status).toBe(200);
    expect(
      await History.findOne({ videoid: String(video._id), viewer: String(viewer._id) }),
    ).toBeNull();
    // The viewer's other row is untouched.
    expect(
      await History.findOne({ videoid: String(otherVideo._id), viewer: String(viewer._id) }),
    ).not.toBeNull();

    const missing = await api
      .delete(`/video/deletehistory/${video._id}/${viewer._id}`)
      .set(authHeader(viewer));
    expect(missing.status).toBe(404);
  });
});
