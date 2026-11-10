import { describe, expect, it } from "vitest";
import { api, authHeader, createUser, createVideo } from "./helpers.js";
import Comment from "../Models/comment.js";

describe("comment CRUD", () => {
  it("POST /comment/post creates a comment (auth required)", async () => {
    const user = await createUser();
    const video = await createVideo();
    const res = await api
      .post("/comment/post")
      .set(authHeader(user))
      .send({
        videoid: String(video._id),
        userid: String(user._id),
        commentbody: "Great video!",
        usercommented: user.username,
      });
    expect(res.status).toBe(200);
    expect(await Comment.countDocuments({ commentbody: "Great video!" })).toBe(1);
  });

  it("POST /comment/post forces the author to the signed-in user", async () => {
    const user = await createUser();
    const other = await createUser();
    const video = await createVideo();
    const res = await api
      .post("/comment/post")
      .set(authHeader(user))
      .send({
        videoid: String(video._id),
        // Forged author id — must be ignored.
        userid: String(other._id),
        commentbody: "Forged author",
        usercommented: other.username,
      });
    expect(res.status).toBe(200);
    const saved = await Comment.findOne({ commentbody: "Forged author" });
    expect(String(saved.userid)).toBe(String(user._id));
  });

  it("POST /comment/post returns 401 without a token", async () => {
    const res = await api.post("/comment/post").send({ commentbody: "hi" });
    expect(res.status).toBe(401);
  });

  it("POST /comment/post rejects an empty commentbody with 400", async () => {
    const user = await createUser();
    const res = await api
      .post("/comment/post")
      .set(authHeader(user))
      .send({ commentbody: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /comment/get lists comments (public read, paginated)", async () => {
    const user = await createUser();
    await api
      .post("/comment/post")
      .set(authHeader(user))
      .send({ videoid: "v1", userid: String(user._id), commentbody: "Listed comment" });
    const res = await api.get("/comment/get");
    expect(res.status).toBe(200);
    expect(res.body.items.some((c) => c.commentbody === "Listed comment")).toBe(true);
    expect(res.body.total).toBe(1);
  });

  it("GET /comment/get filters by ?videoid=", async () => {
    const user = await createUser();
    await Comment.create({ videoid: "v-a", userid: String(user._id), commentbody: "For A" });
    await Comment.create({ videoid: "v-b", userid: String(user._id), commentbody: "For B" });
    const res = await api.get("/comment/get?videoid=v-a");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].commentbody).toBe("For A");
  });

  it("PATCH /comment/edit/:id edits a comment, DELETE removes it", async () => {
    const user = await createUser();
    const created = await Comment.create({
      videoid: "v1",
      userid: String(user._id),
      commentbody: "Before edit",
      usercommented: user.username,
    });
    const edited = await api
      .patch(`/comment/edit/${created._id}`)
      .set(authHeader(user))
      .send({ commentbody: "After edit" });
    expect(edited.status).toBe(200);
    expect((await Comment.findById(created._id)).commentbody).toBe("After edit");

    const deleted = await api
      .delete(`/comment/delete/${created._id}`)
      .set(authHeader(user));
    expect(deleted.status).toBe(200);
    expect(await Comment.findById(created._id)).toBeNull();
  });

  it("editing or deleting another user's comment is 403", async () => {
    const owner = await createUser();
    const other = await createUser();
    const created = await Comment.create({
      videoid: "v1",
      userid: String(owner._id),
      commentbody: "Not yours",
      usercommented: owner.username,
    });
    const edited = await api
      .patch(`/comment/edit/${created._id}`)
      .set(authHeader(other))
      .send({ commentbody: "Hijacked" });
    expect(edited.status).toBe(403);
    expect((await Comment.findById(created._id)).commentbody).toBe("Not yours");

    const deleted = await api
      .delete(`/comment/delete/${created._id}`)
      .set(authHeader(other));
    expect(deleted.status).toBe(403);
    expect(await Comment.findById(created._id)).not.toBeNull();
  });

  it("PATCH /comment/edit/:id rejects a malformed id with 400", async () => {
    const user = await createUser();
    const res = await api
      .patch("/comment/edit/not-an-objectid")
      .set(authHeader(user))
      .send({ commentbody: "x" });
    expect(res.status).toBe(400);
  });

  it("DELETE /comment/delete/:id returns 401 without a token", async () => {
    const created = await Comment.create({ videoid: "v1", commentbody: "x" });
    const res = await api.delete(`/comment/delete/${created._id}`);
    expect(res.status).toBe(401);
  });
});
