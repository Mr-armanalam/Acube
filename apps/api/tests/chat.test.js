import { describe, expect, it } from "vitest";
import { api, authHeader, createUser } from "./helpers.js";
import Message from "../Models/message.model.js";

describe("1:1 chat", () => {
  it("POST /chat/send stores an encrypted message and returns 201", async () => {
    const sender = await createUser();
    const receiver = await createUser();
    const res = await api
      .post("/chat/send")
      .set(authHeader(sender))
      .send({ message: "hello there", recieverId: String(receiver._id) });
    expect(res.status).toBe(201);
    // Stored ciphertext must not be the plaintext.
    const stored = await Message.findById(res.body._id);
    expect(stored.content).not.toBe("hello there");
    expect(stored.content.length).toBeGreaterThan(0);
  });

  it("GET /chat/message/:id returns the conversation decrypted (paginated)", async () => {
    const sender = await createUser();
    const receiver = await createUser();
    await api
      .post("/chat/send")
      .set(authHeader(sender))
      .send({ message: "secret hello", recieverId: String(receiver._id) });
    const res = await api
      .get(`/chat/message/${receiver._id}`)
      .set(authHeader(sender));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].content).toBe("secret hello");
    expect(res.body.total).toBe(1);
  });

  it("GET /chat/message/:id returns 404 when there is no conversation", async () => {
    const sender = await createUser();
    const receiver = await createUser();
    const res = await api
      .get(`/chat/message/${receiver._id}`)
      .set(authHeader(sender));
    expect(res.status).toBe(404);
  });

  it("POST /chat/send returns 401 without a token", async () => {
    const receiver = await createUser();
    const res = await api
      .post("/chat/send")
      .send({ message: "hi", recieverId: String(receiver._id) });
    expect(res.status).toBe(401);
  });

  it("POST /chat/send rejects an empty message with 400", async () => {
    const sender = await createUser();
    const receiver = await createUser();
    const res = await api
      .post("/chat/send")
      .set(authHeader(sender))
      .send({ message: "", recieverId: String(receiver._id) });
    expect(res.status).toBe(400);
  });

  it("POST /chat/chat_user lists other users (auth required)", async () => {
    const me = await createUser();
    const other = await createUser();
    const res = await api.post("/chat/chat_user").set(authHeader(me)).send({});
    expect(res.status).toBe(200);
    expect(res.body.filteredUsers.some((u) => u._id === String(other._id))).toBe(true);
    expect(res.body.filteredUsers.some((u) => u._id === String(me._id))).toBe(false);
  });

  it("PUT /chat/chat_message deletes a message by id (sender only)", async () => {
    const sender = await createUser();
    const receiver = await createUser();
    const sent = await api
      .post("/chat/send")
      .set(authHeader(sender))
      .send({ message: "to delete", recieverId: String(receiver._id) });
    const res = await api
      .put("/chat/chat_message")
      .set(authHeader(sender))
      .send({ id: sent.body._id });
    expect(res.status).toBe(200);
    expect(await Message.findById(sent.body._id)).toBeNull();
  });

  it("PUT /chat/chat_message returns 401 without a token", async () => {
    const sender = await createUser();
    const receiver = await createUser();
    const sent = await api
      .post("/chat/send")
      .set(authHeader(sender))
      .send({ message: "to delete", recieverId: String(receiver._id) });
    const res = await api.put("/chat/chat_message").send({ id: sent.body._id });
    expect(res.status).toBe(401);
    expect(await Message.findById(sent.body._id)).not.toBeNull();
  });

  it("deleting another user's message is 403", async () => {
    const sender = await createUser();
    const receiver = await createUser();
    const sent = await api
      .post("/chat/send")
      .set(authHeader(sender))
      .send({ message: "not yours to delete", recieverId: String(receiver._id) });
    const res = await api
      .put("/chat/chat_message")
      .set(authHeader(receiver))
      .send({ id: sent.body._id });
    expect(res.status).toBe(403);
    expect(await Message.findById(sent.body._id)).not.toBeNull();
  });
});

describe("group chat", () => {
  it("creates a group, lists it, and sends/gets group messages decrypted", async () => {
    const creator = await createUser();
    const member = await createUser();

    const created = await api
      .post("/chat/group_user")
      .set(authHeader(creator))
      .send({ GroupId: [String(member._id)], GroupName: "Test Group" });
    expect(created.status).toBe(200);

    const listed = await api.get("/chat/group").set(authHeader(creator));
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(1);
    const groupId = listed.body.items[0]._id;

    const sent = await api
      .post("/chat/group/messages")
      .set(authHeader(creator))
      .send({ content: "group hello", groupId });
    expect(sent.status).toBe(201);

    const messages = await api
      .get(`/chat/group/${groupId}/messages`)
      .set(authHeader(creator));
    expect(messages.status).toBe(200);
    expect(messages.body.items).toHaveLength(1);
    expect(messages.body.items[0].content).toBe("group hello");
  });

  it("non-members get 403 on group send and group get", async () => {
    const creator = await createUser();
    const member = await createUser();
    const outsider = await createUser();

    await api
      .post("/chat/group_user")
      .set(authHeader(creator))
      .send({ GroupId: [String(member._id)], GroupName: "Private Group" });
    const groupId = (await api.get("/chat/group").set(authHeader(creator))).body.items[0]._id;

    const sent = await api
      .post("/chat/group/messages")
      .set(authHeader(outsider))
      .send({ content: "let me in", groupId });
    expect(sent.status).toBe(403);
    expect(await Message.countDocuments({ group: groupId })).toBe(0);

    const got = await api
      .get(`/chat/group/${groupId}/messages`)
      .set(authHeader(outsider));
    expect(got.status).toBe(403);
  });

  it("GET /chat/group/:groupId/messages returns 401 without a token", async () => {
    const creator = await createUser();
    const member = await createUser();
    await api
      .post("/chat/group_user")
      .set(authHeader(creator))
      .send({ GroupId: [String(member._id)], GroupName: "G" });
    const groupId = (await api.get("/chat/group").set(authHeader(creator))).body.items[0]._id;
    const res = await api.get(`/chat/group/${groupId}/messages`);
    expect(res.status).toBe(401);
  });

  it("GET /chat/group/:groupId/messages returns 404 for an unknown group", async () => {
    const user = await createUser();
    const res = await api
      .get("/chat/group/000000000000000000000000/messages")
      .set(authHeader(user));
    expect(res.status).toBe(404);
  });

  it("POST /chat/group_user rejects an empty member list with 400", async () => {
    const creator = await createUser();
    const res = await api
      .post("/chat/group_user")
      .set(authHeader(creator))
      .send({ GroupId: [], GroupName: "Empty" });
    expect(res.status).toBe(400);
  });
});
