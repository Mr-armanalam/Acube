import { describe, expect, it, vi } from "vitest";
import { api, authHeader, createUser, createVideo } from "./helpers.js";
import Comment from "../Models/comment.js";

// Google verification is mocked (as in auth.test.js): a token
// "valid:<email>" verifies as that email.
vi.mock("../utils/googleAuth.js", () => ({
  verifyGoogleIdToken: vi.fn(async (idToken) => {
    if (typeof idToken === "string" && idToken.startsWith("valid:")) {
      return {
        email: idToken.slice("valid:".length),
        name: "Google User",
        picture: "https://example.com/g.png",
        sub: "google-sub-1",
      };
    }
    throw new Error("Invalid Google ID token");
  }),
}));

// OTP senders are mocked (as in otp.test.js): the smoke run must not
// depend on real SMTP/Twilio delivery. Everything else in the module
// (generateOTP, hashOtp, constants) is the real implementation.
vi.mock("../utils/utility_func.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    sendOTPEmail: vi.fn(async () => {}),
    sendOTPSMS: vi.fn(async () => {}),
  };
});

// Stripe is mocked (as in download.test.js): the create-payment-request
// row needs a checkout URL without a Stripe account, and the webhook
// row needs constructEvent to reject an unsigned request.
vi.mock("stripe", () => ({
  default: class MockStripe {
    checkout = {
      sessions: {
        create: async () => ({
          id: "cs_test_123",
          url: "https://checkout.stripe.test/session_123",
        }),
      },
    };
    webhooks = {
      constructEvent: (raw, sig) => {
        if (sig !== "valid-sig") throw new Error("Invalid Stripe signature");
        return JSON.parse(raw.toString());
      },
    };
  },
}));

// Smoke test: every route in the API (56) plus GET / and GET /health (58
// endpoints total) is hit once with a valid-shaped request and must answer
// with its expected status — never a 404 "route not found" and never a 500
// crash. Auth-required routes are also hit without a token and must 401.
//
// Phase 3b changes pinned here: POST /user/login needs a mocked valid
// idToken (email-only login is 401 since 3a), POST /auth/send-otp is
// 200 with mocked senders (it is 500 OTP_SEND_FAILED with real dummy
// credentials since 3a), POST /download/handle-payment-status with an
// empty body is 400 (a session id is required since 3b), and the new
// routes GET /user/me, POST /user/watch-complete and
// POST /download/webhook are covered.
// Phase 5 changes pinned here: GET /video/:id is public (200 for a
// public video), PATCH/DELETE /video/:id need an owned video (the
// seeded video's channel is "test-channel", so a second video owned by
// userA is used), and the 14 /studio/* routes are covered —
// GET /studio/playlists/:id is the one public studio route.
describe("route smoke test — all 58 endpoints", () => {
  it("every route responds with its expected status", async () => {
    const userA = await createUser();
    const userB = await createUser();
    const video = await createVideo();
    const headersA = authHeader(userA);

    // Seed a 1:1 message, a group, and two comments via the API itself.
    const sent = await api
      .post("/chat/send")
      .set(headersA)
      .send({ message: "smoke seed", recieverId: String(userB._id) });
    expect(sent.status).toBe(201);
    const messageId = sent.body._id;

    const group = await api
      .post("/chat/group_user")
      .set(headersA)
      .send({ GroupId: [String(userB._id)], GroupName: "Smoke Group" });
    expect(group.status).toBe(200);
    const listed = await api.get("/chat/group").set(headersA);
    const groupId = listed.body.items[0]._id;

    const commentToEdit = await Comment.create({
      videoid: String(video._id),
      userid: String(userA._id),
      commentbody: "smoke edit me",
      usercommented: userA.username,
    });
    const commentToDelete = await Comment.create({
      videoid: String(video._id),
      userid: String(userA._id),
      commentbody: "smoke delete me",
      usercommented: userA.username,
    });

    const uid = String(userA._id);
    const vid = String(video._id);
    // Phase 5: a video owned by userA (videochanel = their id) for the
    // PATCH/DELETE /video/:id rows — the seeded video belongs to the
    // "test-channel" fixture, so userA cannot edit it.
    const ownedVideo = await createVideo({ videochanel: uid });
    const ownedVid = String(ownedVideo._id);
    // Phase 5: a playlist owned by userA for the playlist :id rows.
    const playlistRes = await api
      .post("/studio/playlists")
      .set(headersA)
      .send({ title: "Smoke playlist", videoIds: [vid] });
    expect(playlistRes.status).toBe(201);
    const playlistId = playlistRes.body._id;

    // [method, path, headers-or-null, body-or-null, expectedStatus]
    const table = [
      ["GET", "/", null, null, 200],
      ["GET", "/health", null, null, 200],
      ["POST", "/auth/send-otp", null, { email: "smoke@example.com" }, 200],
      ["POST", "/auth/verify-otp", null, { email: "never-sent@example.com", otp: "000000" }, 400],
      ["POST", "/user/login", null, { idToken: "valid:smoke-login@example.com" }, 200],
      ["GET", "/user/me", headersA, null, 200],
      ["PATCH", `/user/update/${uid}`, headersA, { name: "Smoke", desc: "d" }, 200],
      ["GET", "/user/getallchannel", null, null, 200],
      ["GET", `/channel/${uid}/playlists`, null, null, 200],
      ["POST", "/user/watch-complete", headersA, { videoid: vid }, 200],
      ["POST", "/chat/chat_user", headersA, {}, 200],
      ["GET", `/chat/message/${userB._id}`, headersA, null, 200],
      ["PUT", "/chat/chat_message", headersA, { id: messageId }, 200],
      ["POST", "/chat/send", headersA, { message: "smoke", recieverId: String(userB._id) }, 201],
      ["POST", "/chat/group_user", headersA, { GroupId: [String(userB._id)], GroupName: "G2" }, 200],
      ["GET", "/chat/group", headersA, null, 200],
      ["GET", `/chat/group/${groupId}/messages`, headersA, null, 200],
      ["POST", "/chat/group/messages", headersA, { content: "smoke", groupId }, 201],
      ["POST", "/comment/post", headersA, { commentbody: "smoke", videoid: vid }, 200],
      ["GET", "/comment/get", null, null, 200],
      ["DELETE", `/comment/delete/${commentToDelete._id}`, headersA, null, 200],
      ["PATCH", `/comment/edit/${commentToEdit._id}`, headersA, { commentbody: "edited" }, 200],
      ["POST", "/download/download-video", headersA, {}, 200],
      ["POST", "/download/create-payment-request", headersA, {}, 200],
      ["POST", "/download/handle-payment-status", headersA, {}, 400],
      ["POST", "/download/webhook", null, {}, 400],
      ["GET", "/download/user/downloads", headersA, null, 200],
      ["GET", "/download/user/premium-status", headersA, null, 200],
      // uploadvideo without a file but with title/chanel -> controller 404
      ["POST", "/video/uploadvideo", headersA, { __fields: { title: "t", chanel: "c" } }, 404],
      ["GET", "/video/getvideos", null, null, 200],
      ["PATCH", `/video/like/${vid}`, headersA, { action: "like" }, 200],
      ["PATCH", `/video/view/${vid}`, headersA, null, 200],
      ["POST", "/video/history", headersA, { videoid: vid, viewer: uid }, 200],
      ["GET", "/video/getallhistory", headersA, null, 200],
      ["DELETE", `/video/deletehistory/${uid}`, headersA, null, 200],
      ["POST", "/video/watchlater", headersA, { videoid: vid, viewer: uid }, 200],
      ["GET", "/video/getallwatchlater", headersA, null, 200],
      ["DELETE", `/video/deletewatchlater/${vid}/${uid}`, headersA, null, 200],
      ["POST", "/video/likevideo", headersA, { videoid: vid, viewer: uid }, 200],
      ["GET", "/video/getalllikevide", headersA, null, 200],
      ["DELETE", `/video/deletelikevideo/${vid}/${uid}`, headersA, null, 200],
      ["GET", `/video/${vid}`, null, null, 200],
      ["PATCH", `/video/${ownedVid}`, headersA, { title: "Smoke edit" }, 200],
      ["GET", "/studio/overview", headersA, null, 200],
      ["GET", "/studio/analytics?range=7", headersA, null, 200],
      ["GET", "/studio/videos", headersA, null, 200],
      ["GET", "/studio/comments", headersA, null, 200],
      ["GET", "/studio/settings", headersA, null, 200],
      ["PATCH", "/studio/settings", headersA, { name: "Smoke Studio" }, 200],
      ["GET", "/studio/playlists", headersA, null, 200],
      ["POST", "/studio/playlists", headersA, { title: "Smoke list" }, 201],
      ["GET", `/studio/playlists/${playlistId}`, null, null, 200],
      ["PATCH", `/studio/playlists/${playlistId}`, headersA, { title: "Smoke renamed" }, 200],
      ["GET", "/studio/library", headersA, null, 200],
      ["POST", "/studio/library", headersA, { videoid: vid, kind: "saved" }, 200],
      ["DELETE", `/studio/library/saved/${vid}`, headersA, null, 200],
      ["DELETE", `/studio/playlists/${playlistId}`, headersA, null, 200],
      // DELETE /video/:id last — it removes the owned video.
      ["DELETE", `/video/${ownedVid}`, headersA, null, 200],
    ];

    // 56 API routes + GET / + GET /health = 58 endpoints.
    expect(table).toHaveLength(58);

    for (const [method, path, headers, body, expected] of table) {
      let req = api[method.toLowerCase()](path);
      if (headers) req = req.set(headers);
      if (body && body.__fields) {
        for (const [k, v] of Object.entries(body.__fields)) req = req.field(k, v);
      } else if (body) {
        req = req.send(body);
      }
      const res = await req;
      expect(
        res.status,
        `${method} ${path} expected ${expected}, got ${res.status}: ${JSON.stringify(res.body || res.text).slice(0, 200)}`,
      ).toBe(expected);
      // No route may ever crash with a 500 in the smoke pass.
      expect(res.status).not.toBe(500);
    }
  });

  it("every auth-required route returns 401 without a token", async () => {
    const userA = await createUser();
    const userB = await createUser();
    const video = await createVideo();
    const uid = String(userA._id);
    const vid = String(video._id);
    const validId = "000000000000000000000001";

    const unauthenticated = [
      ["GET", "/user/me", null],
      ["PATCH", `/user/update/${uid}`, { name: "x" }],
      ["POST", "/user/watch-complete", { videoid: vid }],
      ["POST", "/chat/chat_user", {}],
      ["GET", `/chat/message/${userB._id}`, null],
      ["PUT", "/chat/chat_message", { id: validId }],
      ["POST", "/chat/send", { message: "x", recieverId: String(userB._id) }],
      ["POST", "/chat/group_user", { GroupId: [String(userB._id)], GroupName: "G" }],
      ["GET", "/chat/group", null],
      ["GET", `/chat/group/${validId}/messages`, null],
      ["POST", "/chat/group/messages", { content: "x", groupId: validId }],
      ["POST", "/comment/post", { commentbody: "x" }],
      ["DELETE", `/comment/delete/${validId}`, null],
      ["PATCH", `/comment/edit/${validId}`, { commentbody: "x" }],
      ["POST", "/download/download-video", {}],
      ["POST", "/download/create-payment-request", {}],
      ["POST", "/download/handle-payment-status", { sessionId: "cs_test_123" }],
      ["GET", "/download/user/downloads", null],
      ["GET", "/download/user/premium-status", null],
      ["POST", "/video/uploadvideo", { __fields: { title: "t", chanel: "c" } }],
      ["PATCH", `/video/like/${vid}`, { action: "like" }],
      ["PATCH", `/video/view/${vid}`, null],
      ["POST", "/video/history", { videoid: vid, viewer: uid }],
      ["GET", "/video/getallhistory", null],
      ["DELETE", `/video/deletehistory/${uid}`, null],
      ["POST", "/video/watchlater", { videoid: vid, viewer: uid }],
      ["GET", "/video/getallwatchlater", null],
      ["DELETE", `/video/deletewatchlater/${vid}/${uid}`, null],
      ["POST", "/video/likevideo", { videoid: vid, viewer: uid }],
      ["GET", "/video/getalllikevide", null],
      ["DELETE", `/video/deletelikevideo/${vid}/${uid}`, null],
      ["PATCH", `/video/${vid}`, { title: "x" }],
      ["DELETE", `/video/${vid}`, null],
      ["GET", "/studio/overview", null],
      ["GET", "/studio/analytics?range=7", null],
      ["GET", "/studio/videos", null],
      ["GET", "/studio/comments", null],
      ["GET", "/studio/settings", null],
      ["PATCH", "/studio/settings", { name: "x" }],
      ["GET", "/studio/playlists", null],
      ["POST", "/studio/playlists", { title: "x" }],
      ["PATCH", `/studio/playlists/${validId}`, { title: "x" }],
      ["DELETE", `/studio/playlists/${validId}`, null],
      ["GET", "/studio/library", null],
      ["POST", "/studio/library", { videoid: vid, kind: "saved" }],
      ["DELETE", `/studio/library/saved/${vid}`, null],
    ];

    expect(unauthenticated).toHaveLength(46);

    for (const [method, path, body] of unauthenticated) {
      let req = api[method.toLowerCase()](path);
      if (body && body.__fields) {
        for (const [k, v] of Object.entries(body.__fields)) req = req.field(k, v);
      } else if (body) {
        req = req.send(body);
      }
      const res = await req;
      expect(res.status, `${method} ${path} without token`).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    }
  });
});
