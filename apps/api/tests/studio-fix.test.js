// Phase 5 fix tests: schema extensions + new/changed endpoints from
// the audit follow-up — settings fields, draft + soft-delete, comment
// pinning, history pause + progress, suggestions, studio search/filter,
// public playlist read, analytics traffic-source absence, and demo
// seed idempotency. Nothing here touches apps/web.
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
import Likedvideo from "../Models/likevideo.js";
import User from "../Models/Auth.js";
import { clearStudioCache } from "../utils/studioCache.js";
import { seedDemoData } from "../scripts/seedDemo.js";

const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () =>
  new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function ownVideo(user, overrides = {}) {
  return createVideo({ videochanel: String(user._id), ...overrides });
}

beforeEach(() => {
  clearStudioCache();
});

describe("GET / PATCH /studio/settings (full shape)", () => {
  it("round-trips every new field", async () => {
    const owner = await createUser();
    const patched = await api
      .patch("/studio/settings")
      .set(authHeader(owner))
      .send({
        handle: "acube-creator",
        links: [{ label: "Site", url: "https://example.com/me" }],
        contactEmail: "creator@example.com",
        country: "India",
        language: "Hindi",
        bannerUrl: "https://example.com/banner.png",
        avatarUrl: "https://example.com/avatar.png",
        channelPublic: false,
        keepSubscriptionsPrivate: true,
        uploadDefaultVisibility: "unlisted",
        uploadDefaultComments: false,
        watermarkEnabled: true,
      });
    expect(patched.status).toBe(200);
    expect(patched.body.handle).toBe("acube-creator");
    expect(patched.body.keepSubscriptionsPrivate).toBe(true);
    expect(patched.body.uploadDefaultVisibility).toBe("unlisted");

    const got = await api.get("/studio/settings").set(authHeader(owner));
    expect(got.status).toBe(200);
    expect(got.body.channel).toMatchObject({
      handle: "acube-creator",
      links: [{ label: "Site", url: "https://example.com/me" }],
      contactEmail: "creator@example.com",
      country: "India",
      language: "Hindi",
      bannerUrl: "https://example.com/banner.png",
      avatarUrl: "https://example.com/avatar.png",
      channelPublic: false,
      keepSubscriptionsPrivate: true,
      uploadDefaultVisibility: "unlisted",
      uploadDefaultComments: false,
      watermarkEnabled: true,
    });
  });

  it("rejects a bad handle format, a taken handle (409), and a bad link URL", async () => {
    const owner = await createUser();
    const other = await createUser();
    await api
      .patch("/studio/settings")
      .set(authHeader(owner))
      .send({ handle: "taken-handle" });
    expect(
      (
        await api
          .patch("/studio/settings")
          .set(authHeader(other))
          .send({ handle: "Taken-Handle" })
      ).status,
    ).toBe(409);
    // Case-insensitive clash: same handle in another case is taken.
    expect(
      (
        await api
          .patch("/studio/settings")
          .set(authHeader(other))
          .send({ handle: "taken-handle" })
      ).status,
    ).toBe(409);
    // Re-setting your OWN handle is fine.
    expect(
      (
        await api
          .patch("/studio/settings")
          .set(authHeader(owner))
          .send({ handle: "taken-handle" })
      ).status,
    ).toBe(200);
    expect(
      (
        await api
          .patch("/studio/settings")
          .set(authHeader(other))
          .send({ handle: "bad handle!" })
      ).status,
    ).toBe(400);
    expect(
      (
        await api
          .patch("/studio/settings")
          .set(authHeader(other))
          .send({ handle: "ab" })
      ).status,
    ).toBe(400);
    expect(
      (
        await api
          .patch("/studio/settings")
          .set(authHeader(other))
          .send({ links: [{ label: "x", url: "not-a-url" }] })
      ).status,
    ).toBe(400);
    expect(
      (
        await api
          .patch("/studio/settings")
          .set(authHeader(other))
          .send({ uploadDefaultVisibility: "friends-only" })
      ).status,
    ).toBe(400);
  });
});

describe("draft visibility + video metadata fields", () => {
  it("PATCH sets description/tags/thumbnailUrl/durationSec; draft is owner-only and never in the feed", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const video = await ownVideo(owner, { videotitle: "Meta test" });
    const edited = await api
      .patch(`/video/${video._id}`)
      .set(authHeader(owner))
      .send({
        description: "A longer description",
        tags: ["react", "tutorial"],
        thumbnailUrl: "https://example.com/thumb.jpg",
        durationSec: 300,
        visibility: "draft",
      });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      description: "A longer description",
      tags: ["react", "tutorial"],
      thumbnailUrl: "https://example.com/thumb.jpg",
      durationSec: 300,
      visibility: "draft",
    });

    // Draft: owner reads it, everyone else gets 404, feed hides it.
    expect(
      (await api.get(`/video/${video._id}`).set(authHeader(owner))).status,
    ).toBe(200);
    expect((await api.get(`/video/${video._id}`)).status).toBe(404);
    expect(
      (await api.get(`/video/${video._id}`).set(authHeader(stranger))).status,
    ).toBe(404);
    const feed = await api.get("/video/getvideos");
    expect(
      feed.body.items.some((v) => String(v._id) === String(video._id)),
    ).toBe(false);
    // A stranger cannot view or like a draft.
    expect(
      (await api.patch(`/video/view/${video._id}`).set(authHeader(stranger)))
        .status,
    ).toBe(404);
    expect(
      (
        await api
          .patch(`/video/like/${video._id}`)
          .set(authHeader(stranger))
          .send({ action: "like" })
      ).status,
    ).toBe(404);
    expect((await Videofile.findById(video._id)).Like).toBe(0);
  });

  it("PATCH still rejects unknown fields and empty bodies", async () => {
    const owner = await createUser();
    const video = await ownVideo(owner);
    expect(
      (
        await api
          .patch(`/video/${video._id}`)
          .set(authHeader(owner))
          .send({ views: 9999 })
      ).status,
    ).toBe(400);
    expect(
      (await api.patch(`/video/${video._id}`).set(authHeader(owner)).send({}))
        .status,
    ).toBe(400);
    expect(
      (
        await api
          .patch(`/video/${video._id}`)
          .set(authHeader(owner))
          .send({ tags: "not-an-array" })
      ).status,
    ).toBe(400);
  });
});

describe("soft-delete restore (owner-only)", () => {
  it("restore is 403 for a non-owner and 404 for a missing video", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const video = await ownVideo(owner);
    await api.delete(`/video/${video._id}`).set(authHeader(owner));
    expect(
      (await api.post(`/video/${video._id}/restore`).set(authHeader(stranger)))
        .status,
    ).toBe(403);
    expect(
      await Videofile.findById(video._id).then((v) => v.deletedAt),
    ).not.toBeNull();
    const missing = new mongoose.Types.ObjectId();
    expect(
      (await api.post(`/video/${missing}/restore`).set(authHeader(owner)))
        .status,
    ).toBe(404);
    expect((await api.post(`/video/${video._id}/restore`)).status).toBe(401);
  });

  it("the studio list still shows a soft-deleted video; the overview does not count it", async () => {
    const owner = await createUser();
    const live = await ownVideo(owner, { videotitle: "live one" });
    const gone = await ownVideo(owner, { videotitle: "gone one" });
    await api.delete(`/video/${gone._id}`).set(authHeader(owner));
    const list = await api.get("/studio/videos").set(authHeader(owner));
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(2);
    const deletedItem = list.body.items.find(
      (v) => String(v._id) === String(gone._id),
    );
    expect(deletedItem.deletedAt).toBeTruthy();
    expect(
      list.body.items.some((v) => String(v._id) === String(live._id)),
    ).toBe(true);
    const overview = await api.get("/studio/overview").set(authHeader(owner));
    expect(overview.body.totals.totalVideos).toBe(1);
    expect(overview.body.topVideos).toHaveLength(1);
  });
});

describe("POST /comment/:id/pin", () => {
  it("the video creator pins; pinning a second comment unpins the first; author and stranger get 403", async () => {
    const owner = await createUser();
    const author = await createUser();
    const stranger = await createUser();
    const video = await ownVideo(owner);
    const c1 = await Comment.create({
      videoid: String(video._id),
      userid: String(author._id),
      commentbody: "First comment",
    });
    const c2 = await Comment.create({
      videoid: String(video._id),
      userid: String(stranger._id),
      commentbody: "Second comment",
    });

    // The comment's own author cannot pin — only the video's creator.
    expect(
      (await api.post(`/comment/${c1._id}/pin`).set(authHeader(author))).status,
    ).toBe(403);
    expect(
      (await api.post(`/comment/${c1._id}/pin`).set(authHeader(stranger)))
        .status,
    ).toBe(403);
    expect((await api.post(`/comment/${c1._id}/pin`)).status).toBe(401);

    const pinned = await api
      .post(`/comment/${c1._id}/pin`)
      .set(authHeader(owner));
    expect(pinned.status).toBe(200);
    expect(pinned.body.pinnedByCreator).toBe(String(owner._id));
    expect((await Comment.findById(c1._id)).pinnedByCreator).toBe(
      String(owner._id),
    );

    // Pinning c2 unpins c1 — exactly one pinned comment per video.
    const pinned2 = await api
      .post(`/comment/${c2._id}/pin`)
      .set(authHeader(owner));
    expect(pinned2.status).toBe(200);
    expect((await Comment.findById(c2._id)).pinnedByCreator).toBe(
      String(owner._id),
    );
    expect((await Comment.findById(c1._id)).pinnedByCreator).toBeNull();
    // Re-pinning the same comment is a 200 no-op.
    expect(
      (await api.post(`/comment/${c2._id}/pin`).set(authHeader(owner))).status,
    ).toBe(200);

    const missing = new mongoose.Types.ObjectId();
    expect(
      (await api.post(`/comment/${missing}/pin`).set(authHeader(owner)))
        .status,
    ).toBe(404);
  });

  it("a soft-deleted (parent) comment cannot be pinned", async () => {
    const owner = await createUser();
    const author = await createUser();
    const video = await ownVideo(owner);
    const parent = await Comment.create({
      videoid: String(video._id),
      userid: String(author._id),
      commentbody: "Parent",
    });
    await Comment.create({
      videoid: String(video._id),
      userid: String(author._id),
      commentbody: "Reply keeps the parent soft-deleted",
      parentId: String(parent._id),
    });
    await api.delete(`/comment/delete/${parent._id}`).set(authHeader(author));
    expect((await Comment.findById(parent._id)).deleted).toBe(true);
    const res = await api
      .post(`/comment/${parent._id}/pin`)
      .set(authHeader(owner));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("history pause + watch progress", () => {
  it("GET/PATCH /user/history-paused round-trips the caller's own flag", async () => {
    const user = await createUser();
    const other = await createUser();
    const got = await api.get("/user/history-paused").set(authHeader(user));
    expect(got.status).toBe(200);
    expect(got.body.paused).toBe(false);
    expect(got.body.historyPaused).toBe(false);

    const set = await api
      .patch("/user/history-paused")
      .set(authHeader(user))
      .send({ paused: true });
    expect(set.status).toBe(200);
    expect(set.body.paused).toBe(true);
    // The other user's flag is untouched.
    expect(
      (await api.get("/user/history-paused").set(authHeader(other))).body
        .paused,
    ).toBe(false);
    expect(
      (
        await api
          .patch("/user/history-paused")
          .set(authHeader(user))
          .send({ paused: "yes" })
      ).status,
    ).toBe(400);
    expect((await api.get("/user/history-paused")).status).toBe(401);
    expect(
      (await api.patch("/user/history-paused").send({ paused: true })).status,
    ).toBe(401);
  });

  it("a paused history records nothing on add or on progress", async () => {
    const user = await createUser();
    const video = await createVideo({ durationSec: 200 });
    await api
      .patch("/user/history-paused")
      .set(authHeader(user))
      .send({ paused: true });

    const added = await api
      .post("/video/history")
      .set(authHeader(user))
      .send({ videoid: String(video._id), viewer: String(user._id) });
    expect(added.status).toBe(200);
    expect(added.body.recorded).toBe(false);
    expect(
      await History.countDocuments({ viewer: String(user._id) }),
    ).toBe(0);

    const progress = await api
      .patch(`/video/history/${video._id}/progress`)
      .set(authHeader(user))
      .send({ progressSec: 50 });
    expect(progress.status).toBe(200);
    expect(progress.body.recorded).toBe(false);
    expect(
      await History.countDocuments({ viewer: String(user._id) }),
    ).toBe(0);

    // Unpause: both record again.
    await api
      .patch("/user/history-paused")
      .set(authHeader(user))
      .send({ paused: false });
    expect(
      (
        await api
          .post("/video/history")
          .set(authHeader(user))
          .send({ videoid: String(video._id), viewer: String(user._id) })
      ).status,
    ).toBe(200);
    expect(
      await History.countDocuments({ viewer: String(user._id) }),
    ).toBe(1);
  });

  it("progress is stored per viewer, clamped to 0..durationSec, and listed with durationSec", async () => {
    const viewerA = await createUser();
    const viewerB = await createUser();
    const video = await createVideo({ durationSec: 200, duration: 200 });
    const noDuration = await createVideo({ durationSec: null, duration: null });

    // Over the duration clamps down to it.
    const over = await api
      .patch(`/video/history/${video._id}/progress`)
      .set(authHeader(viewerA))
      .send({ progressSec: 9999 });
    expect(over.status).toBe(200);
    expect(over.body.progressSec).toBe(200);
    expect(over.body.recorded).toBe(true);
    let row = await History.findOne({
      videoid: String(video._id),
      viewer: String(viewerA._id),
    });
    expect(row.progressSec).toBe(200);

    // A later, smaller position overwrites (resume, not a high-water mark).
    await api
      .patch(`/video/history/${video._id}/progress`)
      .set(authHeader(viewerA))
      .send({ progressSec: 42 });
    row = await History.findOne({
      videoid: String(video._id),
      viewer: String(viewerA._id),
    });
    expect(row.progressSec).toBe(42);

    // Another viewer's progress is a separate row.
    await api
      .patch(`/video/history/${video._id}/progress`)
      .set(authHeader(viewerB))
      .send({ progressSec: 7 });
    expect(
      await History.countDocuments({ videoid: String(video._id) }),
    ).toBe(2);

    // Negative progress is 400 from Zod.
    expect(
      (
        await api
          .patch(`/video/history/${video._id}/progress`)
          .set(authHeader(viewerA))
          .send({ progressSec: -1 })
      ).status,
    ).toBe(400);
    // No known duration: no upper clamp, the value is stored as given.
    const free = await api
      .patch(`/video/history/${noDuration._id}/progress`)
      .set(authHeader(viewerA))
      .send({ progressSec: 5000 });
    expect(free.status).toBe(200);
    expect(free.body.progressSec).toBe(5000);
    expect(free.body.durationSec).toBeNull();

    // The history list carries progressSec + durationSec per row.
    const listed = await api
      .get("/video/getallhistory")
      .set(authHeader(viewerA));
    const listedVideo = listed.body.items.find(
      (h) => h.videoid === String(video._id),
    );
    expect(listedVideo.progressSec).toBe(42);
    expect(listedVideo.durationSec).toBe(200);

    // Missing video, another creator's private video, and no token.
    const missing = new mongoose.Types.ObjectId();
    expect(
      (
        await api
          .patch(`/video/history/${missing}/progress`)
          .set(authHeader(viewerA))
          .send({ progressSec: 10 })
      ).status,
    ).toBe(404);
    const owner = await createUser();
    const priv = await ownVideo(owner, { visibility: "private" });
    expect(
      (
        await api
          .patch(`/video/history/${priv._id}/progress`)
          .set(authHeader(viewerA))
          .send({ progressSec: 10 })
      ).status,
    ).toBe(404);
    expect(
      (
        await api
          .patch(`/video/history/${video._id}/progress`)
          .send({ progressSec: 10 })
      ).status,
    ).toBe(401);
  });
});

describe("GET /watch/:id/suggestions", () => {
  async function suggestionSetup() {
    const owner = await createUser();
    const stranger = await createUser();
    const viewerA = await createUser();
    const source = await ownVideo(owner, {
      videotitle: "Source",
      tags: ["react", "tutorial"],
      durationSec: 300,
      duration: 300,
      views: 0,
    });
    const sameChannel = await ownVideo(owner, {
      videotitle: "Same channel",
      tags: ["other"],
      durationSec: 900,
      views: 0,
    });
    const sameTopic = await createVideo({
      videotitle: "Same topic",
      tags: ["React", "deep-dive"],
      durationSec: 900,
      views: 0,
    });
    const coWatched = await createVideo({
      videotitle: "Co-watched",
      tags: ["unrelated"],
      durationSec: 900,
      views: 0,
    });
    const closeLength = await createVideo({
      videotitle: "Close length",
      tags: ["unrelated"],
      durationSec: 300,
      views: 0,
    });
    const farLength = await createVideo({
      videotitle: "Far length",
      tags: ["unrelated"],
      durationSec: 290,
      views: 0,
    });
    // viewerA watched + liked the source and the co-watched video.
    for (const video of [source, coWatched]) {
      await ViewEvent.create({
        videoid: String(video._id),
        videochanel: String(video.videochanel),
        viewer: String(viewerA._id),
        day: today(),
      });
    }
    await Likedvideo.create({
      videoid: String(source._id),
      viewer: String(viewerA._id),
    });
    return {
      owner,
      stranger,
      viewerA,
      source,
      sameChannel,
      sameTopic,
      coWatched,
      closeLength,
      farLength,
    };
  }

  it("ranks same channel > same topic > co-watched > similar length, with exact reason labels", async () => {
    const s = await suggestionSetup();
    const res = await api.get(`/watch/${s.source._id}/suggestions`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 12 });
    const titles = res.body.items.map((item) => item.video.videotitle);
    const reasons = res.body.items.map((item) => item.reason);
    expect(titles).toEqual([
      "Same channel",
      "Same topic",
      "Co-watched",
      "Close length",
      "Far length",
    ]);
    expect(reasons).toEqual([
      "Same channel",
      "Same topic",
      "Viewers also watched",
      "Similar length",
      "Similar length",
    ]);
    expect(res.body.total).toBe(5);
  });

  it("caps at 12 and excludes soft-deleted, draft and private candidates for strangers", async () => {
    const s = await suggestionSetup();
    const owner = s.owner;
    await createVideo({ videotitle: "Extra public", views: 0 });
    for (let i = 0; i < 12; i += 1) {
      await createVideo({ videotitle: `Filler ${i}`, views: 0 });
    }
    await ownVideo(owner, { videotitle: "Hidden draft", visibility: "draft" });
    await ownVideo(owner, { videotitle: "Hidden private", visibility: "private" });
    const deleted = await ownVideo(owner, { videotitle: "Hidden deleted" });
    await api.delete(`/video/${deleted._id}`).set(authHeader(owner));

    const res = await api.get(`/watch/${s.source._id}/suggestions`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(12);
    const titles = res.body.items.map((item) => item.video.videotitle);
    expect(titles).not.toContain("Hidden draft");
    expect(titles).not.toContain("Hidden private");
    expect(titles).not.toContain("Hidden deleted");

    // The owner DOES see their own draft among suggestions.
    const own = await api
      .get(`/watch/${s.source._id}/suggestions`)
      .set(authHeader(owner));
    expect(
      own.body.items.some((item) => item.video.videotitle === "Hidden draft"),
    ).toBe(true);
  });

  it("works for an unlisted source by link; a private source 404s for strangers; a deleted source 404s for everyone", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const unlisted = await ownVideo(owner, { visibility: "unlisted" });
    const priv = await ownVideo(owner, { visibility: "private" });
    await createVideo({ videotitle: "Some public video" });

    expect((await api.get(`/watch/${unlisted._id}/suggestions`)).status).toBe(
      200,
    );
    expect((await api.get(`/watch/${priv._id}/suggestions`)).status).toBe(404);
    expect(
      (
        await api
          .get(`/watch/${priv._id}/suggestions`)
          .set(authHeader(stranger))
      ).status,
    ).toBe(404);
    expect(
      (await api.get(`/watch/${priv._id}/suggestions`).set(authHeader(owner)))
        .status,
    ).toBe(200);

    const deleted = await ownVideo(owner);
    await api.delete(`/video/${deleted._id}`).set(authHeader(owner));
    expect((await api.get(`/watch/${deleted._id}/suggestions`)).status).toBe(
      404,
    );
    expect(
      (
        await api
          .get(`/watch/${deleted._id}/suggestions`)
          .set(authHeader(owner))
      ).status,
    ).toBe(404);

    const missing = new mongoose.Types.ObjectId();
    expect((await api.get(`/watch/${missing}/suggestions`)).status).toBe(404);
    expect((await api.get("/watch/not-an-objectid/suggestions")).status).toBe(
      400,
    );
  });
});

describe("GET /studio/videos search + filter", () => {
  it("q matches titles case-insensitively; visibility filters; both combine", async () => {
    const owner = await createUser();
    const other = await createUser();
    await ownVideo(owner, { videotitle: "React Hooks Deep Dive" });
    await ownVideo(owner, { videotitle: "react basics" });
    await ownVideo(owner, { videotitle: "Vue Guide" });
    await ownVideo(owner, { videotitle: "Draft React", visibility: "draft" });
    await ownVideo(owner, { videotitle: "Hidden React", visibility: "private" });
    await ownVideo(other, { videotitle: "React Someone Else" });

    const q = await api
      .get("/studio/videos?q=react")
      .set(authHeader(owner));
    expect(q.status).toBe(200);
    expect(q.body.total).toBe(4);
    expect(q.body.items.map((v) => v.videotitle)).toEqual(
      expect.arrayContaining([
        "React Hooks Deep Dive",
        "react basics",
        "Draft React",
        "Hidden React",
      ]),
    );

    const draft = await api
      .get("/studio/videos?visibility=draft")
      .set(authHeader(owner));
    expect(draft.body.total).toBe(1);
    expect(draft.body.items[0].videotitle).toBe("Draft React");

    const both = await api
      .get("/studio/videos?q=react&visibility=private")
      .set(authHeader(owner));
    expect(both.body.total).toBe(1);
    expect(both.body.items[0].videotitle).toBe("Hidden React");

    const pub = await api
      .get("/studio/videos?visibility=public")
      .set(authHeader(owner));
    expect(pub.body.total).toBe(3);
    expect(
      pub.body.items.some((v) => v.videotitle === "Draft React"),
    ).toBe(false);

    expect(
      (await api.get("/studio/videos?visibility=nope").set(authHeader(owner)))
        .status,
    ).toBe(400);
  });
});

describe("GET /studio/comments filter + sort", () => {
  it("filter=unreplied keeps only top-level comments with no reply; sort=oldest reverses; hasReply is set", async () => {
    const owner = await createUser();
    const commenter = await createUser();
    const mine = await ownVideo(owner);
    const replied = await Comment.create({
      videoid: String(mine._id),
      userid: String(commenter._id),
      commentbody: "Has a reply",
      usercommented: commenter.username,
      commentedon: new Date("2026-11-08T10:00:00Z"),
    });
    await Comment.create({
      videoid: String(mine._id),
      userid: String(owner._id),
      commentbody: "The reply",
      usercommented: owner.username,
      parentId: String(replied._id),
      commentedon: new Date("2026-11-08T11:00:00Z"),
    });
    await Comment.create({
      videoid: String(mine._id),
      userid: String(commenter._id),
      commentbody: "No reply yet",
      usercommented: commenter.username,
      commentedon: new Date("2026-11-09T10:00:00Z"),
    });
    await Comment.create({
      videoid: String(mine._id),
      userid: String(commenter._id),
      commentbody: "Also no reply",
      usercommented: commenter.username,
      commentedon: new Date("2026-11-10T10:00:00Z"),
    });
    // A comment on someone else's video never appears here.
    const theirs = await ownVideo(commenter);
    await Comment.create({
      videoid: String(theirs._id),
      userid: String(owner._id),
      commentbody: "Not mine",
    });

    const all = await api.get("/studio/comments").set(authHeader(owner));
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(4);
    const repliedItem = all.body.items.find(
      (c) => c.commentbody === "Has a reply",
    );
    expect(repliedItem.hasReply).toBe(true);
    expect(
      all.body.items.find((c) => c.commentbody === "No reply yet").hasReply,
    ).toBe(false);
    // Newest first by default.
    expect(all.body.items[0].commentbody).toBe("Also no reply");

    const unreplied = await api
      .get("/studio/comments?filter=unreplied")
      .set(authHeader(owner));
    expect(unreplied.body.total).toBe(2);
    expect(unreplied.body.items.map((c) => c.commentbody)).toEqual([
      "Also no reply",
      "No reply yet",
    ]);

    const oldest = await api
      .get("/studio/comments?filter=unreplied&sort=oldest")
      .set(authHeader(owner));
    expect(oldest.body.items.map((c) => c.commentbody)).toEqual([
      "No reply yet",
      "Also no reply",
    ]);

    expect(
      (
        await api
          .get("/studio/comments?filter=answered")
          .set(authHeader(owner))
      ).status,
    ).toBe(400);
    expect(
      (await api.get("/studio/comments?sort=random").set(authHeader(owner)))
        .status,
    ).toBe(400);
  });
});

describe("GET /studio/playlists/:id is public (logged-out)", () => {
  it("public and unlisted playlists read logged-out; private 404s; soft-deleted videos are hidden from the playlist", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const v1 = await ownVideo(owner);
    const v2 = await ownVideo(owner);
    const pub = await Playlist.create({
      owner: String(owner._id),
      title: "Public list",
      visibility: "public",
      videoIds: [String(v1._id), String(v2._id)],
    });
    const unl = await Playlist.create({
      owner: String(owner._id),
      title: "Unlisted list",
      visibility: "unlisted",
      videoIds: [String(v1._id)],
    });
    const priv = await Playlist.create({
      owner: String(owner._id),
      title: "Private list",
      visibility: "private",
      videoIds: [String(v1._id)],
    });

    // No auth header at all — the route is public by design.
    expect((await api.get(`/studio/playlists/${pub._id}`)).status).toBe(200);
    expect((await api.get(`/studio/playlists/${unl._id}`)).status).toBe(200);
    expect((await api.get(`/studio/playlists/${priv._id}`)).status).toBe(404);
    expect(
      (
        await api
          .get(`/studio/playlists/${priv._id}`)
          .set(authHeader(stranger))
      ).status,
    ).toBe(404);
    expect(
      (await api.get(`/studio/playlists/${priv._id}`).set(authHeader(owner)))
        .status,
    ).toBe(200);

    // Soft-delete v2: the public playlist still lists it in videoIds
    // (membership is kept for restore) but hides it from `videos`.
    await api.delete(`/video/${v2._id}`).set(authHeader(owner));
    const after = await api.get(`/studio/playlists/${pub._id}`);
    expect(after.status).toBe(200);
    expect(after.body.videoIds).toEqual([String(v1._id), String(v2._id)]);
    expect(after.body.videos).toHaveLength(1);
    expect(String(after.body.videos[0]._id)).toBe(String(v1._id));
  });
});

describe("GET /studio/analytics has no traffic-source split", () => {
  it("returns totals without trafficSources — the field is omitted, never invented", async () => {
    const owner = await createUser();
    await ChannelDailyStat.create({
      videochanel: String(owner._id),
      day: today(),
      views: 5,
      likes: 1,
      watchMinutes: 9,
      completions: 1,
    });
    const res = await api
      .get("/studio/analytics?range=7")
      .set(authHeader(owner));
    expect(res.status).toBe(200);
    expect(res.body.totals.views).toBe(5);
    // No referrer is stored anywhere, so no source split exists.
    expect(res.body.trafficSources).toBeUndefined();
    expect("trafficSources" in res.body).toBe(false);
  });
});

describe("demo seed (scripts/seedDemo.js)", () => {
  it("is idempotent: two runs produce the same counts and the verified totals", async () => {
    const first = await seedDemoData();
    expect(first.viewEvents).toBe(1503);
    expect(first.likes).toBe(113);
    expect(first.dailyStatViews).toBe(1503);
    expect(first.dailyStatLikes).toBe(113);
    expect(first.videoCounterViews).toBe(1503);
    expect(first.videoCounterLikes).toBe(113);
    expect(first.videos).toBe(11);
    expect(first.publicVideos).toBe(7);
    expect(first.historyRows).toBe(7);

    const countsAfterFirst = {
      users: await User.countDocuments({ demo: true }),
      videos: await Videofile.countDocuments({ demo: true }),
      events: await ViewEvent.countDocuments({ demo: true }),
      likes: await Likedvideo.countDocuments({ demo: true }),
      stats: await ChannelDailyStat.countDocuments({ demo: true }),
      comments: await Comment.countDocuments({ demo: true }),
      playlists: await Playlist.countDocuments({ demo: true }),
      library: await LibraryEntry.countDocuments({ demo: true }),
      history: await History.countDocuments({ demo: true }),
    };

    const second = await seedDemoData();
    expect(second).toMatchObject({
      viewEvents: 1503,
      likes: 113,
      dailyStatViews: 1503,
      dailyStatLikes: 113,
      videoCounterViews: 1503,
      videoCounterLikes: 113,
      videos: 11,
      historyRows: 7,
    });
    const countsAfterSecond = {
      users: await User.countDocuments({ demo: true }),
      videos: await Videofile.countDocuments({ demo: true }),
      events: await ViewEvent.countDocuments({ demo: true }),
      likes: await Likedvideo.countDocuments({ demo: true }),
      stats: await ChannelDailyStat.countDocuments({ demo: true }),
      comments: await Comment.countDocuments({ demo: true }),
      playlists: await Playlist.countDocuments({ demo: true }),
      library: await LibraryEntry.countDocuments({ demo: true }),
      history: await History.countDocuments({ demo: true }),
    };
    expect(countsAfterSecond).toEqual(countsAfterFirst);

    // Spot checks on the seeded shape.
    expect(
      await Videofile.countDocuments({
        demo: true,
        visibility: "draft",
      }),
    ).toBe(1);
    expect(
      await Videofile.countDocuments({ demo: true, visibility: "unlisted" }),
    ).toBe(1);
    expect(
      await Videofile.countDocuments({ demo: true, visibility: "private" }),
    ).toBe(1);
    expect(
      await Videofile.countDocuments({
        demo: true,
        deletedAt: { $ne: null },
      }),
    ).toBe(1);
    // Exactly one pinned comment, pinned by its video's creator.
    const pinned = await Comment.find({ demo: true, pinnedByCreator: { $ne: null } });
    expect(pinned).toHaveLength(1);
    const pinnedVideo = await Videofile.findById(pinned[0].videoid);
    expect(pinned[0].pinnedByCreator).toBe(String(pinnedVideo.videochanel));
    // Nested comments exist (a reply and a reply-to-reply on video 1).
    expect(
      await Comment.countDocuments({ demo: true, parentId: { $ne: null } }),
    ).toBeGreaterThanOrEqual(3);
    // Learning Path playlist with 4 videos.
    const learning = await Playlist.findOne({
      demo: true,
      title: /Learning Path/,
    });
    expect(learning).not.toBeNull();
    expect(learning.videoIds).toHaveLength(4);
    // History rows on both days, all with a resume position.
    const historyRows = await History.find({ demo: true });
    expect(historyRows).toHaveLength(7);
    const days = new Set(
      historyRows.map((h) => h.likedon.toISOString().slice(0, 10)),
    );
    expect(days.has(today())).toBe(true);
    expect(days.has(yesterday())).toBe(true);
    expect(historyRows.every((h) => h.progressSec > 0)).toBe(true);
    // Daily stats span the full 28-day window.
    const statDays = await ChannelDailyStat.distinct("day", { demo: true });
    expect(statDays.length).toBe(28);
    // Library tabs are populated.
    expect(
      await LibraryEntry.countDocuments({ demo: true, kind: "watchlater" }),
    ).toBe(2);
    expect(
      await LibraryEntry.countDocuments({ demo: true, kind: "saved" }),
    ).toBe(2);
    expect(
      await LibraryEntry.countDocuments({ demo: true, kind: "liked" }),
    ).toBe(113);
    // No non-demo rows were created by the seed.
    expect(await User.countDocuments({ demo: { $ne: true } })).toBe(0);
    expect(await Videofile.countDocuments({ demo: { $ne: true } })).toBe(0);
  });
});
