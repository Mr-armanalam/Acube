// MSW request handlers for the web client tests (Phase 2c).
// Every handler answers from in-memory fixtures — no live backend.
// Handlers record what the client sent in `captured` so tests can assert
// on the exact request (e.g. that a download carries the video id).
import { http, HttpResponse, type JsonBodyType } from "msw";
import type { SessionProfile } from "../types";

export const fixtureVideos = [
  {
    _id: "vid1",
    videotitle: "Python Basics Tutorial",
    videochanel: "ch1",
    filepath: "/videos/python.mp4",
    uploader: "alice",
    Like: 5,
    views: 100,
    createdat: "2026-11-01T00:00:00.000Z",
  },
  {
    _id: "vid2",
    videotitle: "React Hooks Deep Dive",
    videochanel: "ch2",
    filepath: "/videos/react.mp4",
    uploader: "bob",
    Like: 3,
    views: 50,
    createdat: "2026-11-02T00:00:00.000Z",
  },
  {
    _id: "vid3",
    videotitle: "Java for Beginners",
    videochanel: "ch1",
    filepath: "/videos/java.mp4",
    uploader: "alice",
    Like: 1,
    views: 10,
    createdat: "2026-11-03T00:00:00.000Z",
  },
];

export const fixtureSession: SessionProfile = {
  result: {
    _id: "user1",
    name: "Test User",
    username: "testuser",
    email: "test@example.com",
  },
  token: "test-token",
};

export const captured = {
  likeVideo: [] as Array<{ id: string; body: unknown }>,
  addLiked: [] as unknown[],
  deleteLiked: [] as Array<{ videoid: string; viewer: string }>,
  addWatchLater: [] as unknown[],
  deleteWatchLater: [] as Array<{ videoid: string; viewer: string }>,
  downloads: [] as unknown[],
  uploads: [] as Array<{ title: string | null; fileName: string | null }>,
  paymentStatus: [] as unknown[],
  paymentRequests: [] as unknown[],
  chatSend: [] as unknown[],
  comments: [] as unknown[],
  points: [] as unknown[],
  // Phase 3a: bodies sent to POST /user/login, so tests can assert the
  // Google id_token (not a client-claimed email) is what gets sent.
  loginBodies: [] as unknown[],
};

export function resetCaptured() {
  for (const key of Object.keys(captured) as Array<keyof typeof captured>) {
    (captured[key] as unknown[]).length = 0;
  }
}

const json = (body: unknown, status = 200) =>
  HttpResponse.json(body as JsonBodyType, { status });

// Phase 3b: list endpoints answer in the paginated shape
// { items, page, limit, total, totalPages }.
const pageOf = <T>(items: T[]) => ({
  items,
  page: 1,
  limit: 50,
  total: items.length,
  totalPages: 1,
});

export const handlers = [
  http.get("*/video/getvideos", () => json(pageOf(fixtureVideos))),
  http.patch("*/video/like/:id", async ({ params, request }) => {
    captured.likeVideo.push({ id: String(params.id), body: await request.json() });
    return json({});
  }),
  http.patch("*/video/view/:id", () => json({})),
  http.post("*/video/history", () => json({})),
  http.post("*/video/uploadvideo", async ({ request }) => {
    // NOTE: do NOT call request.formData() here — axios sends jsdom's
    // FormData/File, which undici's multipart parser rejects (jsdom File
    // is not a Node File). Read the raw multipart body and pull the
    // title / filename out of it instead.
    const text = await request.text();
    const titleMatch = /name="title"\r?\n\r?\n([^\r\n]+)/.exec(text);
    const fileMatch = /filename="([^"]+)"/.exec(text);
    captured.uploads.push({
      title: titleMatch?.[1] ?? null,
      fileName: fileMatch?.[1] ?? null,
    });
    return json({ success: true });
  }),
  http.get("*/comment/get", () => json(pageOf([]))),
  http.post("*/comment/post", async ({ request }) => {
    captured.comments.push(await request.json());
    return json({});
  }),
  http.get("*/video/getallhistory", () => json(pageOf([]))),
  http.get("*/video/getalllikevide", () => json(pageOf([]))),
  http.get("*/video/getallwatchlater", () => json(pageOf([]))),
  http.post("*/video/likevideo", async ({ request }) => {
    captured.addLiked.push(await request.json());
    return json({});
  }),
  http.delete(
    "*/video/deletelikevideo/:videoid/:viewer",
    ({ params }) => {
      captured.deleteLiked.push({
        videoid: String(params.videoid),
        viewer: String(params.viewer),
      });
      return json({});
    },
  ),
  http.post("*/video/watchlater", async ({ request }) => {
    captured.addWatchLater.push(await request.json());
    return json({});
  }),
  http.delete(
    "*/video/deletewatchlater/:videoid/:viewer",
    ({ params }) => {
      captured.deleteWatchLater.push({
        videoid: String(params.videoid),
        viewer: String(params.viewer),
      });
      return json({});
    },
  ),
  // Phase 3b: POST /user/update-points is gone. Points are awarded
  // server-side via POST /user/watch-complete, which takes only the
  // video id — the captured body must never contain a points number.
  http.post("*/user/watch-complete", async ({ request }) => {
    captured.points.push(await request.json());
    return json({ awarded: 5, points: 5 });
  }),
  // Phase 3b: session refresh — returns the current user from the JWT.
  http.get("*/user/me", () => json({ result: fixtureSession.result })),
  http.post("*/auth/send-otp", () => new HttpResponse("OTP sent", { status: 200 })),
  http.post("*/auth/verify-otp", async ({ request }) => {
    const body = (await request.json()) as { otp?: string };
    if (body.otp === "123456") {
      return new HttpResponse("OTP verified", { status: 200 });
    }
    return new HttpResponse("Invalid OTP", { status: 400 });
  }),
  // Phase 3a: mirrors the server — login needs a Google id_token or an
  // email with a verified OTP. A body with neither is 401; anything else
  // answers the fixture session.
  http.post("*/user/login", async ({ request }) => {
    const body = (await request.json()) as {
      idToken?: string;
      email?: string;
    };
    captured.loginBodies.push(body);
    if (!body.idToken && !body.email) {
      return json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Login requires a verified Google token or a verified OTP",
          },
        },
        401,
      );
    }
    return json(fixtureSession);
  }),
  http.get("*/download/user/premium-status", () =>
    json({ isPremium: false }),
  ),
  http.get("*/download/user/downloads", () => json({ downloads: [] })),
  http.post("*/download/download-video", async ({ request }) => {
    captured.downloads.push(await request.json());
    return json({ success: true, video: { title: "Video Title" } });
  }),
  http.post("*/download/handle-payment-status", async ({ request }) => {
    captured.paymentStatus.push(await request.json());
    return json({ success: true });
  }),
  http.post("*/download/create-payment-request", async ({ request }) => {
    captured.paymentRequests.push(await request.json());
    return json({
      success: true,
      payment_request: "https://example.com/pay",
      sessionId: "cs_test_123",
      amount: 1000,
      currency: "INR",
    });
  }),
  http.get("*/chat/message/:id", () => json(pageOf([]))),
  http.get("*/chat/group/:groupId/messages", () => json(pageOf([]))),
  http.get("*/chat/group", () => json(pageOf([]))),
  http.post("*/chat/send", async ({ request }) => {
    captured.chatSend.push(await request.json());
    return json({});
  }),
  http.post("*/chat/chat_user", () =>
    json({ filteredUsers: [], currentMessages: [] }),
  ),
];
