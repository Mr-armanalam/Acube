// MSW request handlers for the web client tests (Phase 2c).
// Every handler answers from in-memory fixtures — no live backend.
// Handlers record what the client sent in `captured` so tests can assert
// on the exact request (e.g. that a download carries the video id).
import { http, HttpResponse, type JsonBodyType } from "msw";
import type { SessionProfile, Video } from "../types";

export const fixtureVideos: Video[] = [
  {
    _id: "vid1",
    videotitle: "Python Basics Tutorial",
    videochanel: "ch1",
    filepath: "/videos/python.mp4",
    uploader: "alice",
    Like: 5,
    views: 100,
    createdat: "2026-11-01T00:00:00.000Z",
    description: "Learn Python from scratch.",
    tags: ["coding", "python", "learning"],
    durationSec: 134,
    visibility: "public",
    deletedAt: null,
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
    description: "Hooks, explained properly.",
    tags: ["coding", "react"],
    durationSec: 107,
    visibility: "public",
    deletedAt: null,
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
    description: "Java for complete beginners.",
    tags: ["coding", "java", "learning"],
    durationSec: 182,
    visibility: "public",
    deletedAt: null,
  },
];

/** Studio-only rows: a draft (never in the public feed) and a private one. */
export const fixtureStudioVideos: Video[] = [
  ...fixtureVideos,
  {
    _id: "vid4",
    videotitle: "Untitled draft — trim 03",
    videochanel: "ch1",
    filepath: "/videos/draft.mp4",
    uploader: "alice",
    Like: 0,
    views: 0,
    createdat: "2026-11-04T00:00:00.000Z",
    description: "Work in progress.",
    tags: ["draft"],
    durationSec: 45,
    visibility: "draft",
    deletedAt: null,
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
  channel: {
    _id: "user1",
    name: "Test User",
    email: "test@example.com",
    desc: "Test channel",
    username: "testuser",
    handle: "testuser",
  },
  totals: {
    totalViews: 160,
    totalLikes: 9,
    totalVideos: 2,
    totalComments: 2,
    watchMinutes: 42,
    completions: 1,
  },
  // All-time counter sums (incl. pre-Phase 5 traffic) + stats start.
  allTime: {
    views: 160,
    likes: 9,
    note: "Sums of the per-video counters, including traffic from before Phase 5 analytics.",
  },
  statsSince: "2026-11-01",
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
  // Phase 5 fix: NO trafficSources here on purpose — the backend does
  // not return a real source split yet, so the UI must show the honest
  // "not tracked yet" empty state instead of a faked split.
};

export const fixtureWatchSuggestions = {
  // Ranked suggestions for vid1 — the current video is excluded.
  items: [
    { video: fixtureVideos[2], reason: "Same channel" },
    { video: fixtureVideos[1], reason: "Same topic" },
  ],
};

export const fixtureHistoryPaused = { paused: false };

export const fixtureStudioComments = [
  {
    _id: "c1",
    videoid: "vid1",
    userid: "user2",
    commentbody: "Great tutorial!",
    usercommented: "carol",
    videotitle: "Python Basics Tutorial",
    createdAt: "2026-11-02T10:00:00.000Z",
    hasReply: true,
  },
  {
    _id: "c2",
    videoid: "vid3",
    userid: "user3",
    commentbody: "Helpful, thanks!",
    usercommented: "dave",
    videotitle: "Java for Beginners",
    createdAt: "2026-11-01T09:00:00.000Z",
    hasReply: false,
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

/** A playlist owned by someone else — the Library "Saved playlists"
 * section renders it; the own-playlists list must not claim it. */
export const fixtureSavedPlaylist = {
  _id: "pl2",
  owner: "user2",
  title: "Saved playlist example",
  description: "A playlist by another creator that I saved",
  visibility: "public",
  videoIds: ["vid3"],
  createdAt: "2026-11-02T00:00:00.000Z",
};

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
  // Phase 5 fix: a depth-4 chain — c1(0) → c2(1) → c4(2) → c5(3) → c6(4).
  // The old depth<3 gate hid c6 entirely; the tree must render it.
  {
    _id: "c4",
    videoid: "vid1",
    userid: "user3",
    commentbody: "Replying to the reply",
    usercommented: "dave",
    parentId: "c2",
  },
  {
    _id: "c5",
    videoid: "vid1",
    userid: "user2",
    commentbody: "And one level deeper",
    usercommented: "carol",
    parentId: "c4",
  },
  {
    _id: "c6",
    videoid: "vid1",
    userid: "user3",
    commentbody: "Deepest reply — must still be visible",
    usercommented: "dave",
    parentId: "c5",
  },
];

export const captured = {
  likeVideo: [] as Array<{ id: string; body: unknown }>,
  addLiked: [] as unknown[],
  deleteLiked: [] as Array<{ videoid: string; viewer: string }>,
  addWatchLater: [] as unknown[],
  deleteWatchLater: [] as Array<{ videoid: string; viewer: string }>,
  downloads: [] as unknown[],
  uploads: [] as Array<{
    title: string | null;
    fileName: string | null;
    description: string | null;
    tags: string | null;
    visibility: string | null;
  }>,
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
  // Phase 5 fix: new contract calls.
  commentPins: [] as string[],
  videoRestores: [] as string[],
  libraryAdds: [] as unknown[],
  libraryRemoves: [] as Array<{ kind: string; videoid: string }>,
  historyProgress: [] as Array<{ videoid: string; progressSec: number }>,
  historyPausedPatches: [] as boolean[],
  videoSuggestionCalls: [] as string[],
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
    const field = (name: string) =>
      new RegExp(`name="${name}"\\r?\\n\\r?\\n([^\\r\\n]*)`).exec(text)?.[1] ??
      null;
    const titleMatch = /name="title"\r?\n\r?\n([^\r\n]+)/.exec(text);
    const fileMatch = /filename="([^"]+)"/.exec(text);
    captured.uploads.push({
      title: titleMatch?.[1] ?? null,
      fileName: fileMatch?.[1] ?? null,
      description: field("description"),
      tags: field("tags"),
      visibility: field("visibility"),
    });
    // Phase 5 fix: the real endpoint returns the created video id +
    // persisted details — the mock mirrors that shape so the wizard's
    // "Watch video" link is exercised.
    return json({
      message: "File uploaded successfully",
      video: {
        id: "vid-uploaded",
        videotitle: field("title") ?? "",
        visibility: field("visibility") ?? "public",
        description: field("description") ?? "",
        tags: (field("tags") ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0),
        thumbnailUrl: field("thumbnailUrl"),
      },
    });
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
  // Phase 5 fix: search (q), visibility filter and real pagination.
  http.get("*/studio/videos", ({ request }) => {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const visibility = url.searchParams.get("visibility") ?? "";
    const page = Number(url.searchParams.get("page") ?? 1);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    // Phase 5 fix: the real GET /studio/videos returns soft-deleted
    // rows too (the owner restores them from Content) — the mock used
    // to filter them out, hiding the Deleted/Restore state from tests.
    let items = fixtureStudioVideos;
    if (q) {
      items = items.filter(
        (v) =>
          v.videotitle.toLowerCase().includes(q) ||
          (v.description ?? "").toLowerCase().includes(q) ||
          (v.tags ?? []).some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (visibility) items = items.filter((v) => v.visibility === visibility);
    const totalPages = Math.max(1, Math.ceil(items.length / limit));
    const slice = items.slice((page - 1) * limit, page * limit);
    return json({ items: slice, page, limit, total: items.length, totalPages });
  }),
  // Phase 5 fix: filter=unreplied + sort=newest|oldest.
  http.get("*/studio/comments", ({ request }) => {
    const url = new URL(request.url);
    const filter = url.searchParams.get("filter") ?? "";
    const sort = url.searchParams.get("sort") ?? "newest";
    const page = Number(url.searchParams.get("page") ?? 1);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    let items = [...fixtureStudioComments];
    if (filter === "unreplied") items = items.filter((c) => !c.hasReply);
    items.sort((a, b) =>
      sort === "oldest"
        ? String(a.createdAt).localeCompare(String(b.createdAt))
        : String(b.createdAt).localeCompare(String(a.createdAt)),
    );
    const totalPages = Math.max(1, Math.ceil(items.length / limit));
    const slice = items.slice((page - 1) * limit, page * limit);
    return json({ items: slice, page, limit, total: items.length, totalPages });
  }),
  http.get("*/studio/settings", () =>
    // Phase 5 fix contract: full settings shape under `channel`.
    json({
      channel: {
        _id: "user1",
        name: "Test User",
        email: "test@example.com",
        desc: "Test channel",
        username: "testuser",
        handle: "testuser",
        links: [{ label: "GitHub", url: "https://github.com/testuser" }],
        contactEmail: "hello@test.example",
        country: "India",
        language: "English",
        bannerUrl: "",
        avatarUrl: "",
        channelPublic: true,
        keepSubscriptionsPrivate: false,
        uploadDefaultVisibility: "public",
        uploadDefaultComments: true,
        watermarkEnabled: false,
      },
    }),
  ),
  http.patch("*/studio/settings", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    captured.studioSettingsPatches.push(body);
    // Handle uniqueness is server-enforced: "taken" is already used.
    if (body.handle === "taken") {
      return json(
        { error: { code: "HANDLE_TAKEN", message: "Handle is already taken" } },
        400,
      );
    }
    return json({
      _id: "user1",
      name: body.name ?? "Test User",
      desc: body.desc ?? "Test channel",
      handle: body.handle ?? "testuser",
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
      playlists: [...fixturePlaylists, fixtureSavedPlaylist],
    }),
  ),
  // Phase 5 fix: library entry add/remove (kind "saved" | "watchlater" | "liked").
  http.post("*/studio/library", async ({ request }) => {
    const body = await request.json();
    captured.libraryAdds.push(body);
    return json({ message: "Added to library" });
  }),
  http.delete("*/studio/library/:kind/:videoid", ({ params }) => {
    captured.libraryRemoves.push({
      kind: String(params.kind),
      videoid: String(params.videoid),
    });
    return json({ message: "Removed from library" });
  }),
  // Phase 5 fix contract: ranked suggestions with a reason per item.
  http.get("*/watch/:id/suggestions", ({ params }) => {
    captured.videoSuggestionCalls.push(String(params.id));
    return json(fixtureWatchSuggestions);
  }),
  // Phase 5 fix: public playlists containing a video (Watch showcase).
  // The mock mirrors the real endpoint: only playlists whose videoIds
  // include this video, with their videos in playlist order.
  http.get("*/watch/:id/playlists", ({ params }) => {
    const items = fixturePlaylists
      .filter((p) => p.videoIds.includes(String(params.id)))
      .map((p) => ({
        ...p,
        videoCount: p.videoIds.length,
        videos: p.videoIds
          .map((vid) => fixtureVideos.find((v) => v._id === vid))
          .filter(Boolean),
      }));
    return json({ items });
  }),
  // Phase 5 fix contract: creator pins a comment.
  http.post("*/comment/:id/pin", ({ params }) => {
    captured.commentPins.push(String(params.id));
    return json({ _id: String(params.id), pinnedByCreator: "user1" });
  }),
  // Phase 5 fix contract: soft-delete restore.
  http.post("*/video/:id/restore", ({ params }) => {
    captured.videoRestores.push(String(params.id));
    return json({ _id: String(params.id), deletedAt: null });
  }),
  // Phase 5 fix contract (proposed paths — see Api/index.ts):
  // history-pause flag + watch-progress persistence.
  http.get("*/user/history-paused", () => json(fixtureHistoryPaused)),
  http.patch("*/user/history-paused", async ({ request }) => {
    const body = (await request.json()) as { paused?: boolean };
    captured.historyPausedPatches.push(Boolean(body.paused));
    fixtureHistoryPaused.paused = Boolean(body.paused);
    return json({ paused: fixtureHistoryPaused.paused });
  }),
  http.patch("*/video/history/:videoid/progress", async ({ params, request }) => {
    const body = (await request.json()) as { progressSec?: number };
    captured.historyProgress.push({
      videoid: String(params.videoid),
      progressSec: Number(body.progressSec ?? 0),
    });
    return json({});
  }),
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
    const found = fixtureStudioVideos.find((v) => v._id === params.id);
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
