import { describe, expect, it } from "vitest";
import { api, authHeader, createUser } from "./helpers.js";
import History from "../Models/history.js";
import Watchlater from "../Models/watchlater.js";
import Likedvideo from "../Models/likevideo.js";

describe("history / watchlater / likedvideo", () => {
  it("POST /video/history + GET /video/getallhistory + DELETE round-trip", async () => {
    const user = await createUser();
    const added = await api
      .post("/video/history")
      .set(authHeader(user))
      .send({ videoid: "vid-1", viewer: String(user._id) });
    expect(added.status).toBe(200);

    const listed = await api.get("/video/getallhistory").set(authHeader(user));
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((h) => h.videoid === "vid-1")).toBe(true);

    const removed = await api
      .delete(`/video/deletehistory/${user._id}`)
      .set(authHeader(user));
    expect(removed.status).toBe(200);
    expect(await History.countDocuments({ viewer: String(user._id) })).toBe(0);
  });

  it("GET /video/getallhistory lists newest first", async () => {
    const user = await createUser();
    const now = Date.now();
    await History.create({
      videoid: "vid-old",
      viewer: String(user._id),
      likedon: new Date(now - 24 * 60 * 60 * 1000),
    });
    await History.create({
      videoid: "vid-new",
      viewer: String(user._id),
      likedon: new Date(now),
    });
    const listed = await api
      .get("/video/getallhistory")
      .set(authHeader(user));
    expect(listed.status).toBe(200);
    // Phase 5 fix: newest first (preview screen I) — Today groups
    // above Yesterday on the History page.
    expect(listed.body.items.map((h) => h.videoid)).toEqual([
      "vid-new",
      "vid-old",
    ]);
  });

  it("POST /video/watchlater + GET + DELETE round-trip", async () => {
    const user = await createUser();
    const added = await api
      .post("/video/watchlater")
      .set(authHeader(user))
      .send({ videoid: "vid-2", viewer: String(user._id) });
    expect(added.status).toBe(200);

    const listed = await api.get("/video/getallwatchlater").set(authHeader(user));
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((w) => w.videoid === "vid-2")).toBe(true);

    const removed = await api
      .delete(`/video/deletewatchlater/vid-2/${user._id}`)
      .set(authHeader(user));
    expect(removed.status).toBe(200);
    expect(await Watchlater.countDocuments({ videoid: "vid-2" })).toBe(0);
  });

  it("POST /video/likevideo + GET + DELETE round-trip", async () => {
    const user = await createUser();
    const added = await api
      .post("/video/likevideo")
      .set(authHeader(user))
      .send({ videoid: "vid-3", viewer: String(user._id) });
    expect(added.status).toBe(200);

    const listed = await api.get("/video/getalllikevide").set(authHeader(user));
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((l) => l.videoid === "vid-3")).toBe(true);

    const removed = await api
      .delete(`/video/deletelikevideo/vid-3/${user._id}`)
      .set(authHeader(user));
    expect(removed.status).toBe(200);
    expect(await Likedvideo.countDocuments({ videoid: "vid-3" })).toBe(0);
  });

  it("lists are scoped: one user's history is invisible to another", async () => {
    const userA = await createUser();
    const userB = await createUser();
    await api.post("/video/history").set(authHeader(userA)).send({ videoid: "vid-a", viewer: String(userA._id) });
    await api.post("/video/watchlater").set(authHeader(userA)).send({ videoid: "vid-a", viewer: String(userA._id) });
    await api.post("/video/likevideo").set(authHeader(userA)).send({ videoid: "vid-a", viewer: String(userA._id) });

    for (const route of ["/video/getallhistory", "/video/getallwatchlater", "/video/getalllikevide"]) {
      const listed = await api.get(route).set(authHeader(userB));
      expect(listed.status).toBe(200);
      expect(listed.body.items).toHaveLength(0);
      expect(listed.body.total).toBe(0);
    }
  });

  it("a forged viewer cannot plant entries on another user", async () => {
    const user = await createUser();
    const other = await createUser();
    await api
      .post("/video/history")
      .set(authHeader(user))
      .send({ videoid: "vid-forged", viewer: String(other._id) });
    expect(await History.countDocuments({ viewer: String(other._id) })).toBe(0);
    expect(await History.countDocuments({ viewer: String(user._id), videoid: "vid-forged" })).toBe(1);
  });

  it("re-adding the same video does not duplicate the row", async () => {
    const user = await createUser();
    for (let i = 0; i < 2; i++) {
      const res = await api
        .post("/video/likevideo")
        .set(authHeader(user))
        .send({ videoid: "vid-dup", viewer: String(user._id) });
      expect(res.status).toBe(200);
    }
    expect(await Likedvideo.countDocuments({ videoid: "vid-dup" })).toBe(1);
  });

  it("deleting another user's rows is 403", async () => {
    const userA = await createUser();
    const userB = await createUser();
    await api.post("/video/history").set(authHeader(userA)).send({ videoid: "vid-x", viewer: String(userA._id) });
    await api.post("/video/watchlater").set(authHeader(userA)).send({ videoid: "vid-x", viewer: String(userA._id) });
    await api.post("/video/likevideo").set(authHeader(userA)).send({ videoid: "vid-x", viewer: String(userA._id) });

    const delHistory = await api.delete(`/video/deletehistory/${userA._id}`).set(authHeader(userB));
    expect(delHistory.status).toBe(403);
    const delWatch = await api.delete(`/video/deletewatchlater/vid-x/${userA._id}`).set(authHeader(userB));
    expect(delWatch.status).toBe(403);
    const delLiked = await api.delete(`/video/deletelikevideo/vid-x/${userA._id}`).set(authHeader(userB));
    expect(delLiked.status).toBe(403);
    expect(await History.countDocuments({ viewer: String(userA._id) })).toBe(1);
  });

  it("getall* lists return 401 without a token", async () => {
    for (const route of ["/video/getallhistory", "/video/getallwatchlater", "/video/getalllikevide"]) {
      const res = await api.get(route);
      expect(res.status).toBe(401);
    }
  });

  it("POST /video/history rejects a missing videoid with 400", async () => {
    const user = await createUser();
    const res = await api
      .post("/video/history")
      .set(authHeader(user))
      .send({ viewer: String(user._id) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("history/watchlater/likedvideo POSTs return 401 without a token", async () => {
    for (const route of ["/video/history", "/video/watchlater", "/video/likevideo"]) {
      const res = await api.post(route).send({ videoid: "v", viewer: "u" });
      expect(res.status).toBe(401);
    }
  });
});
