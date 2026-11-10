import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import { readStoredSession } from "../types";
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

API.interceptors.request.use((req: InternalAxiosRequestConfig) => {
  const profile = readStoredSession();
  if (profile) {
    req.headers.Authorization = `Bearer ${profile.token}`;
  }
  return req;
});

// 401 = the session is no longer valid (e.g. JWT expired). Clear the stored
// session and send the user to the home page, where the Navbar offers
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
) => API.post("/video/uploadvideo", filedata, fileoption);
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
