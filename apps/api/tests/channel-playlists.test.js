// Backend-gap tests: public channel playlists (GET /channel/:id/playlists)
// + `handle` in GET /user/getallchannel. Nothing here touches apps/web.
import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { api, createUser } from "./helpers.js";
import Playlist from "../Models/Playlist.js";

async function seedPlaylist(owner, overrides = {}) {
  return Playlist.create({
    owner: String(owner._id),
    title: "List",
    description: "",
    visibility: "public",
    videoIds: [],
    ...overrides,
  });
}

describe("GET /channel/:id/playlists", () => {
  it("returns only the owner's public playlists, with videoCount, no auth", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const pub = await seedPlaylist(owner, {
      title: "Public",
      videoIds: ["a", "b"],
    });
    await seedPlaylist(owner, { title: "Unlisted", visibility: "unlisted" });
    await seedPlaylist(owner, { title: "Private", visibility: "private" });
    await seedPlaylist(stranger, { title: "Theirs" });

    // No auth header: a channel page is public.
    const res = await api.get(`/channel/${owner._id}/playlists`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(String(res.body.items[0]._id)).toBe(String(pub._id));
    expect(res.body.items[0].title).toBe("Public");
    expect(res.body.items[0].visibility).toBe("public");
    expect(res.body.items[0].videoCount).toBe(2);
    expect(res.body.page).toBe(1);
    expect(res.body.totalPages).toBe(1);
  });

  it("invalid ObjectId → 400 VALIDATION_ERROR", async () => {
    const res = await api.get("/channel/not-an-objectid/playlists");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("non-existent owner → 404 NOT_FOUND", async () => {
    const missing = new mongoose.Types.ObjectId();
    const res = await api.get(`/channel/${missing}/playlists`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("owner with no public playlists → empty items", async () => {
    const owner = await createUser();
    await seedPlaylist(owner, {
      title: "Private only",
      visibility: "private",
    });
    const res = await api.get(`/channel/${owner._id}/playlists`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.items).toEqual([]);
  });
});

describe("GET /user/getallchannel handle projection", () => {
  it("includes handle when set, null when unset", async () => {
    const withHandle = await createUser({
      handle: "creator-one",
      username: "Creator One",
    });
    const withoutHandle = await createUser({ username: "No Handle" });
    const res = await api.get("/user/getallchannel");
    expect(res.status).toBe(200);
    const byId = new Map(res.body.items.map((c) => [String(c._id), c]));
    expect(byId.get(String(withHandle._id)).handle).toBe("creator-one");
    expect(byId.get(String(withoutHandle._id)).handle).toBeNull();
  });
});
