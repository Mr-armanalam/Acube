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

export const fixtureStudioOverview = {
  totals: {
    totalViews: 160,
    totalLikes: 9,
    totalVideos: 2,
    totalComments: 2,
    watchMinutes: 42,
  },
  topVideos: [fixtureVideos[0], fixtureVideos[2]],
  latestComments: [
    {
      _id: "c1",
      videoid: "vid1",
      userid: "user2",
      commentbody: "Great tutorial!",
      usercommented: "carol",
      videotitle: "Python Basics Tutorial",
    },
  ],
};

export const fixtureStudioAnalytics = {
  range: 28,
  days: [
    { date: "2026-11-01", views: 10, watchMinutes: 5, likes: 1 },
    { date: "2026-11-02", views: 25, watchMinutes: 12, likes: 2 },
    { date: "2026-11-03", views: 15, watchMinutes: 8, likes: 0 },
  ],
  totals: { views: 50, watchMinutes: 25, likes: 3 },
  // Contract fix: the real API returns bestDay as an object, not a
  // bare date string (the old fixture hid the [object Object] render).
  bestDay: { date: "2026-11-02", views: 25 },
};

export const fixtureStudioComments = [
  {
    _id: "c1",
    videoid: "vid1",
    userid: "user2",
    commentbody: "Great tutorial!",
    usercommented: "carol",
    videotitle: "Python Basics Tutorial",
  },
  {
    _id: "c2",
    videoid: "vid3",
    userid: "user3",
    commentbody: "Helpful, thanks!",
    usercommented: "dave",
    videotitle: "Java for Beginners",
  },
];

export const fixturePlaylists = [
  {
    _id: "pl1",
    owner: "user1",
    title: "My favourites",
    description: "Videos I keep coming back to",
    visibility: "public",
    videoIds: ["vid1", "vid2"],
    createdAt: "2026-11-01T00:00:00.000Z",
  },
];

export const fixtureNestedComments = [
  {
    _id: "c1",
    videoid: "vid1",
    userid: "user2",
    commentbody: "Great tutorial!",
    usercommented: "carol",
    parentId: null,
  },
  {
    _id: "c2",
    videoid: "vid1",
    userid: "user1",
    commentbody: "Thanks, glad it helped!",
    usercommented: "Test User",
    parentId: "c1",
  },
  {
    _id: "c3",
    videoid: "vid1",
    userid: "user3",
    commentbody: "Second reply to the same thread",
    usercommented: "dave",
    parentId: "c1",
  },
];

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
  // Phase 5: Studio video edits / deletes and playlist creates.
  videoPatches: [] as Array<{ id: string; body: unknown }>,
  videoDeletes: [] as string[],
  playlistCreates: [] as unknown[],
  playlistPatches: [] as Array<{ id: string; body: unknown }>,
  playlistDeletes: [] as string[],
  studioSettingsPatches: [] as unknown[],
  deleteHistoryItem: [] as Array<{ videoid: string; viewer: string }>,
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
  http.delete("*/comment/delete/:id", () => json({})),
  http.patch("*/comment/edit/:id", () => json({})),
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
  // Phase 5 — Creator Studio contract (PHASE5_PLAN.md Reconciliation).
  http.get("*/studio/overview", () => json(fixtureStudioOverview)),
  http.get("*/studio/analytics", ({ request }) => {
    const url = new URL(request.url);
    const range = Number(url.searchParams.get("range") ?? 28);
    return json({ ...fixtureStudioAnalytics, range });
  }),
  http.get("*/studio/videos", () =>
    json(pageOf([fixtureVideos[0], fixtureVideos[2]])),
  ),
  http.get("*/studio/comments", () => json(pageOf(fixtureStudioComments))),
  http.get("*/studio/settings", () =>
    // Contract fix: the real API nests settings under `channel` and
    // has no handle/links fields.
    json({
      channel: {
        _id: "user1",
        name: "Test User",
        email: "test@example.com",
        desc: "Test channel",
        username: "testuser",
      },
    }),
  ),
  http.patch("*/studio/settings", async ({ request }) => {
    captured.studioSettingsPatches.push(await request.json());
    const body = captured.studioSettingsPatches[
      captured.studioSettingsPatches.length - 1
    ] as Record<string, unknown>;
    return json({
      _id: "user1",
      name: body.name ?? "Test User",
      desc: body.desc ?? "Test channel",
    });
  }),
  http.get("*/studio/playlists", () => json(fixturePlaylists)),
  // Public playlist read (visibility rules are server-side in the real
  // API); the fixture playlist carries its videos in playlist order.
  http.get("*/studio/playlists/:id", ({ params }) => {
    const found = fixturePlaylists.find((p) => p._id === params.id);
    if (!found) return new HttpResponse(null, { status: 404 });
    return json({
      ...found,
      videoCount: found.videoIds.length,
      videos: found.videoIds
        .map((vid) => fixtureVideos.find((v) => v._id === vid))
        .filter(Boolean),
    });
  }),
  http.get("*/studio/library", () =>
    json({
      watchlater: [],
      saved: [fixtureVideos[2]],
      liked: [],
      playlists: fixturePlaylists,
    }),
  ),
  http.post("*/studio/playlists", async ({ request }) => {
    const body = await request.json();
    captured.playlistCreates.push(body);
    return json({ _id: "pl2", owner: "user1", videoIds: [], ...(body as Record<string, unknown>) });
  }),
  http.patch("*/studio/playlists/:id", async ({ params, request }) => {
    captured.playlistPatches.push({ id: String(params.id), body: await request.json() });
    return json({});
  }),
  http.delete("*/studio/playlists/:id", ({ params }) => {
    captured.playlistDeletes.push(String(params.id));
    return json({});
  }),
  http.patch("*/video/:id", async ({ params, request }) => {
    captured.videoPatches.push({ id: String(params.id), body: await request.json() });
    return json({});
  }),
  http.delete("*/video/:id", ({ params }) => {
    captured.videoDeletes.push(String(params.id));
    return json({});
  }),
  // Phase 5 contract fix: single-video read for the Watch page.
  // Registered LAST among the /video/* GETs so the specific handlers
  // above (getvideos, getallhistory, ...) still match first.
  http.get("*/video/:id", ({ params }) => {
    const found = fixtureVideos.find((v) => v._id === params.id);
    if (!found) return new HttpResponse(null, { status: 404 });
    return json(found);
  }),
  http.delete(
    "*/video/deletehistory/:videoid/:viewer",
    ({ params }) => {
      captured.deleteHistoryItem.push({
        videoid: String(params.videoid),
        viewer: String(params.viewer),
      });
      return json({ message: "removed from history" });
    },
  ),
];
