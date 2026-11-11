import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import { readStoredSession, type UploadVideoResponse } from "../types";
// Phase 3c: request shapes come from @acube/shared — the same Zod schemas
// the API validates at runtime. The client no longer re-declares them.
// (Response/model shapes stay in ../types.ts: @acube/shared has no
// response schemas, only route-input schemas — see PHASE3_REPORT.md.)
import type {
  CreatePaymentRequestInput,
  HandlePaymentStatusInput,
  LikeVideoInput,
  LoginInput,
  SendOtpInput,
  VerifyOtpInput,
  WatchCompleteInput,
} from "@acube/shared";

// API base URL comes from VITE_BACKEND_URL (see apps/web/.env.example).
// The app makes no relative /api calls, so there is no Vite dev proxy.
const API: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL,
});

/** Resolve a media URL the API returned for rendering in the browser.
 * Cloudinary URLs are absolute and pass through untouched; the local
 * /uploads/ fallback is API-relative, so a bare "/uploads/…" would
 * resolve against the WEB origin (:3000/:4173) and 404 — prefix it
 * with the API base URL. Without a configured base (unit tests) a
 * relative URL is returned as-is. */
export function resolveApiMediaUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  const base = (API.defaults.baseURL ?? "").replace(/\/+$/, "");
  if (!base) return url;
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}

API.interceptors.request.use((req: InternalAxiosRequestConfig) => {
  const profile = readStoredSession();
  if (profile) {
    req.headers.Authorization = `Bearer ${profile.token}`;
  }
  return req;
});

// 401 = the session is no longer valid (e.g. JWT expired). Clear the stored
// session and send the user to the home page, where the TopBar offers
// Google sign-in. Guard: only redirect when a token was actually present,
// so a 401 on a public request can never loop back onto itself.
API.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const status =
      typeof error === "object" && error !== null && "response" in error
        ? (error as { response?: { status?: unknown } }).response?.status
        : undefined;
    if (status === 401 && readStoredSession()) {
      localStorage.removeItem("Profile");
      if (window.location.pathname !== "/") {
        window.location.assign("/");
      }
    }
    return Promise.reject(error);
  },
);

export const login = (authdata: LoginInput) =>
  API.post("/user/login", authdata);
// Phase 3b: session refresh — GET /user/me returns the current user
// from the JWT (replaces the old email-only re-login).
export const getMe = () => API.get("/user/me");
export const updatechaneldata = (id: string, updatedata: unknown) =>
  API.patch(`/user/update/${id}`, updatedata);
// Phase 3b: list endpoints are paginated server-side now (?page&limit,
// limit capped at 50). These helpers fetch the first page of 50 —
// enough for the current lists; true infinite scroll is a follow-up.
export const fetchallchannel = (page = 1, limit = 50) =>
  API.get("/user/getallchannel", { params: { page, limit } });

export const uploadvideo = (
  filedata: unknown,
  fileoption: AxiosRequestConfig | undefined,
) =>
  API.post<UploadVideoResponse>("/video/uploadvideo", filedata, fileoption);
export const getvideos = (page = 1, limit = 50) =>
  API.get("/video/getvideos", { params: { page, limit } });
// Phase 3b: liking is a toggle — { action: "like" | "unlike" }. The
// server $inc's the counter; absolute counts are rejected.
export const likevideo = (id: string, action: LikeVideoInput["action"]) =>
  API.patch(`/video/like/${id}`, { action });
export const viewsvideo = (id: string) => API.patch(`/video/view/${id}`);

export const postcomment = (commentdata: unknown) =>
  API.post("/comment/post", commentdata);
export const deletecomment = (id: string) =>
  API.delete(`/comment/delete/${id}`);
export const editcomment = (id: string, commentbody: unknown) =>
  API.patch(`/comment/edit/${id}`, { commentbody });
export const getallcomment = (page = 1, limit = 50) =>
  API.get("/comment/get", { params: { page, limit } });

export const addtohistory = (historydata: unknown) =>
  API.post("/video/history", historydata);
export const getallhistory = (page = 1, limit = 50) =>
  API.get("/video/getallhistory", { params: { page, limit } });
export const deletehistory = (userid: string) =>
  API.delete(`/video/deletehistory/${userid}`);
// Phase 5: delete one history row (owner = viewer only, 403 otherwise).
export const deleteHistoryItem = (videoid: string, viewer: string) =>
  API.delete(`/video/deletehistory/${videoid}/${viewer}`);

export const addtolikevideo = (likedvideodata: unknown) =>
  API.post("/video/likevideo", likedvideodata);
export const getalllikedvideo = (page = 1, limit = 50) =>
  API.get("/video/getalllikevide", { params: { page, limit } });
export const deletelikedvideo = (videoid: string, viewer: string) =>
  API.delete(`/video/deletelikevideo/${videoid}/${viewer}`);
// Phase 3b: POST /user/update-points is gone — it trusted a
// client-supplied points number. Points are awarded server-side only
// via POST /user/watch-complete (5 per completed watch, max 10 per
// video per day); the client sends just the video id.
export const watchComplete = (videoid: WatchCompleteInput["videoid"]) =>
  API.post("/user/watch-complete", { videoid });

export const addtowatchlater = (watchlaterdata: unknown) =>
  API.post("/video/watchlater", watchlaterdata);
export const getallwatchlater = (page = 1, limit = 50) =>
  API.get("/video/getallwatchlater", { params: { page, limit } });
export const deletewatchlater = (videoid: string, viewer: string) =>
  API.delete(`/video/deletewatchlater/${videoid}/${viewer}`);

export const all_chat_user_sidebar = (searquery: unknown) =>
  API.post(`/chat/chat_user`, searquery);
export const deleteChat = (chat: unknown) =>
  API.put(`/chat/chat_message`, chat);
export const send_chat_Messages = (sendMessages: unknown) =>
  API.post(`/chat/send`, sendMessages);
export const get_chat_Messages = (selectedId: string, page = 1, limit = 50) =>
  API.get(`/chat/message/${selectedId}`, { params: { page, limit } });

export const send_GroupUsers = (GroupUsers: unknown) =>
  API.post("/chat/group_user", GroupUsers);
export const get_all_Group = (page = 1, limit = 50) =>
  API.get("/chat/group", { params: { page, limit } });
export const send_group_messages = (group_messages: unknown) =>
  API.post("/chat/group/messages", group_messages);
export const fetch_group_messages = (groupId: string, page = 1, limit = 50) =>
  API.get(`/chat/group/${groupId}/messages`, { params: { page, limit } });

export const downloadVideo = (videoId: unknown) =>
  API.post("/download/download-video", videoId);
export const checkPremiumStatus = () =>
  API.get(`/download/user/premium-status`);
// Phase 3b: the server verifies the named Stripe Checkout Session
// before granting premium — the client passes the session_id from the
// Checkout return URL, never a bare "success".
export const handlePaymentStatus = (payment: HandlePaymentStatusInput) =>
  API.post("/download/handle-payment-status", payment);
// Phase 3b: the price comes from the server catalogue — the client
// sends an empty body and never an amount.
export const createPaymentRequest = (
  _body: CreatePaymentRequestInput = {},
) => API.post("/download/create-payment-request", {});
export const getDownloads = (page = 1, limit = 50) =>
  API.get(`/download/user/downloads`, { params: { page, limit } });

export const sendOtp = (authdata: SendOtpInput) =>
  API.post("/auth/send-otp", authdata);
export const verifyOtp = (authOtp: VerifyOtpInput) =>
  API.post("/auth/verify-otp", authOtp);

// Phase 5 — Creator Studio (contract in PHASE5_PLAN.md Reconciliation).
// The backend is built to this exact contract; shapes live in types.ts.
export const getStudioOverview = () => API.get("/studio/overview");
export const getStudioAnalytics = (range: 7 | 28 | 90 = 28) =>
  API.get("/studio/analytics", { params: { range } });
// Content "View analytics" target: per-video daily series (owner only).
// Same range contract as the channel endpoint.
export const getStudioVideoAnalytics = (
  id: string,
  range: 7 | 28 | 90 = 28,
) => API.get(`/studio/videos/${id}/analytics`, { params: { range } });
// Phase 5 fix: search + visibility filter + real pagination. The
// backend worker is adding q/visibility to GET /studio/videos in
// parallel; the client sends them and the MSW handlers answer them.
export const getStudioVideos = (
  page = 1,
  limit = 50,
  params: { q?: string; visibility?: string } = {},
) =>
  API.get("/studio/videos", { params: { page, limit, ...params } });
export const getStudioComments = (
  page = 1,
  limit = 50,
  params: { filter?: string; sort?: string } = {},
) =>
  API.get("/studio/comments", { params: { page, limit, ...params } });
export const getStudioSettings = () => API.get("/studio/settings");
// Phase 5 fix contract: PATCH /studio/settings accepts the full
// settings shape (name, desc, handle, links, contactEmail, country,
// language, bannerUrl, avatarUrl, channelPublic,
// keepSubscriptionsPrivate, uploadDefaultVisibility,
// uploadDefaultComments, watermarkEnabled). The backend worker is
// building this; the old { name?, desc? }-only shape is superseded.
export const patchStudioSettings = (data: {
  name?: string;
  desc?: string;
  handle?: string;
  links?: { label: string; url: string }[];
  contactEmail?: string;
  country?: string;
  language?: string;
  bannerUrl?: string;
  avatarUrl?: string;
  channelPublic?: boolean;
  keepSubscriptionsPrivate?: boolean;
  uploadDefaultVisibility?: string;
  uploadDefaultComments?: boolean;
  watermarkEnabled?: boolean;
}) => API.patch("/studio/settings", data);
// Settings polish contract (backend worker, parallel — these routes
// did not exist yet when the web work started; the client is built
// against the fixed contract and the MSW handlers answer the same
// shapes meanwhile):
//   GET  /studio/handle/available?handle=… -> { available, reason? }
//   POST /studio/banner  (multipart field "file", jpg/png ≤ 5 MB)
//   POST /studio/avatar  (multipart field "file", jpg/png ≤ 5 MB)
//   POST /studio/banner/remove, POST /studio/avatar/remove
// The multipart field name is "file" — same convention as the video
// upload (UploadWizard appends "file"); if the backend ever changes
// it, change it in uploadStudioImage below only.
// Upload responses carry the new URL top-level ({ bannerUrl } /
// { avatarUrl }); remove responses carry the field as null. The hooks
// read the upload shape either top-level or nested under `channel`,
// so the Settings preview can update from the response without
// waiting on the refetch.
// NOTE: the Studio identity header prefers overview.channel.avatarUrl
// (the uploaded avatar) over picture (the Google login photo) — an
// avatar upload DOES change it; see Models/Auth.js.
export const getHandleAvailable = (handle: string) =>
  API.get("/studio/handle/available", { params: { handle } });
function uploadStudioImage(kind: "banner" | "avatar", file: File) {
  const filedata = new FormData();
  filedata.append("file", file);
  // Axios sets the multipart Content-Type (with boundary) itself for
  // FormData — setting it manually would break the boundary.
  return API.post(`/studio/${kind}`, filedata);
}
export const uploadStudioBanner = (file: File) =>
  uploadStudioImage("banner", file);
export const uploadStudioAvatar = (file: File) =>
  uploadStudioImage("avatar", file);
export const removeStudioBanner = () => API.post("/studio/banner/remove");
export const removeStudioAvatar = () => API.post("/studio/avatar/remove");
export const getStudioPlaylists = () => API.get("/studio/playlists");
// Public read (visibility rules server-side) — the /playlist/:id page
// uses this, not the owner-only list.
export const getStudioPlaylist = (id: string) =>
  API.get(`/studio/playlists/${id}`);
export const getLibrary = () => API.get("/studio/library");
export const createStudioPlaylist = (data: {
  title: string;
  description?: string;
  visibility?: string;
  videoIds?: string[];
}) => API.post("/studio/playlists", data);
export const patchStudioPlaylist = (
  id: string,
  data: {
    title?: string;
    description?: string;
    visibility?: string;
    // Phase 5 contract fix: the server takes addVideoIds/removeVideoIds
    // — a bare `videoIds` was stripped by Zod and the PATCH 400d.
    addVideoIds?: string[];
    removeVideoIds?: string[];
  },
) => API.patch(`/studio/playlists/${id}`, data);
export const deleteStudioPlaylist = (id: string) =>
  API.delete(`/studio/playlists/${id}`);
// Phase 5: single-video read with visibility rules server-side
// (private → 404 for non-owners, unlisted readable by link). The Watch
// page uses this — never the page-1 feed filter.
export const getVideo = (id: string) => API.get(`/video/${id}`);
export const patchVideo = (
  id: string,
  data: {
    title?: string;
    visibility?: string;
    description?: string;
    tags?: string[];
    thumbnailUrl?: string;
  },
) => API.patch(`/video/${id}`, data);
export const deleteVideo = (id: string) => API.delete(`/video/${id}`);
// Phase 5 fix contract: soft-delete restore (backend worker, parallel).
export const restoreVideo = (id: string) =>
  API.post(`/video/${id}/restore`);
// Phase 5 fix contract: ranked suggestions with a reason per item.
export const getWatchSuggestions = (id: string) =>
  API.get(`/watch/${id}/suggestions`);
// Phase 5 fix: public playlists containing a video — the Watch page's
// playlist showcase. The page used to read the owner-only
// /studio/playlists list, so the showcase only rendered for the owner.
export const getWatchPlaylists = (id: string) =>
  API.get(`/watch/${id}/playlists`);
// Channel page Playlists tab — PROPOSED (no backend route yet; the
// backend worker owns GET /channel/:id/playlists). Public read with
// visibility rules server-side, mirroring GET /studio/playlists/:id.
export const getChannelPlaylists = (id: string) =>
  API.get(`/channel/${id}/playlists`);
// Phase 5 fix contract: creator pins a comment (creator only, server).
export const pinComment = (id: string) => API.post(`/comment/${id}/pin`);
// Phase 5 fix contract: library entries (kind "saved" | "watchlater" |
// "liked"). POST/DELETE already exist server-side for /studio/library.
export const addLibraryEntry = (videoid: string, kind: string) =>
  API.post("/studio/library", { videoid, kind });
export const removeLibraryEntry = (kind: string, videoid: string) =>
  API.delete(`/studio/library/${kind}/${videoid}`);
// Phase 5 fix contract — history pause flag + watch progress. These
// two paths are PROPOSED (one Api function each, so a correction is a
// one-line change): the backend worker owns the exact routes and the
// MSW handlers below answer the same shapes meanwhile.
//   PATCH /user/history-paused { paused: boolean }
//   PATCH /video/history/:videoid/progress { progressSec: number }
export const getHistoryPaused = () => API.get("/user/history-paused");
export const patchHistoryPaused = (paused: boolean) =>
  API.patch("/user/history-paused", { paused });
export const patchHistoryProgress = (videoid: string, progressSec: number) =>
  API.patch(`/video/history/${videoid}/progress`, { progressSec });
