// Shared domain types for the Acube web client (Phase 2b).
// Shapes mirror the API Mongoose models (apps/api/Models) and the
// /user/login response ({ result, token }). No `any`: unknown fields are
// typed as optional/unknown and narrowed at the boundary.
//
// Phase 3c: REQUEST shapes (login / OTP / like-toggle / watch-complete /
// payment) now come from @acube/shared as z.infer types — the same Zod
// schemas the API validates at runtime (see src/Api/index.ts,
// src/store/slices/authSlice.ts, src/query/downloads.ts,
// src/query/hooks.ts). What could NOT be wired: @acube/shared has no
// response/model schemas, so SessionUser / Video / Channel / CommentItem /
// VideoListEntry / Chat* / Group / PaymentRequestResponse stay local here.
// POST /download/download-video is also unwired: the API validates it
// with emptyBodySchema and the server ignores the body, so there is no
// meaningful shared schema for the client's { videoId } record-keeping
// field.

export interface SessionUser {
  _id: string;
  name?: string;
  username?: string;
  email: string;
  picture?: string;
  desc?: string;
  reputation?: number;
  downloadsToday?: number;
  isPremium?: boolean;
  downloads?: DownloadItem[];
  joinedon?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** What /user/login returns and what is persisted under "Profile". */
export interface SessionProfile {
  result: SessionUser;
  token: string;
}

export interface Video {
  _id: string;
  videotitle: string;
  videochanel: string;
  filepath: string;
  filename?: string;
  filetype?: string;
  filesize?: string;
  uploader?: string;
  Like?: number;
  views?: number;
  createdat?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Channel {
  _id: string;
  name?: string;
  username?: string;
  email?: string;
  picture?: string;
  desc?: string;
  reputation?: number;
  downloadsToday?: number;
  isPremium?: boolean;
  joinedon?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CommentItem {
  _id: string;
  videoid?: string;
  userid?: string;
  commentbody: string;
  usercommented?: string;
  commenton?: string;
  commentedon?: string;
  createdAt?: string;
}

/** History / liked / watch-later rows all share this shape. */
export interface VideoListEntry {
  _id: string;
  videoid: string;
  viewer: string;
  likedon?: string;
  createdAt?: string;
}

export interface ChatUser {
  _id: string;
  username: string;
  email: string;
  picture?: string;
}

export interface ChatUserList {
  filteredUsers: ChatUser[];
  currentMessages: Array<{
    user?: string;
    date?: string;
    message?: string;
  } | null>;
}

export interface ChatMessage {
  _id: string;
  sender: string;
  receiver?: string;
  group?: string;
  content: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Group {
  _id: string;
  name: string;
  GroupPicture?: string;
  admin?: string[];
  members?: string[];
  messages?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface DownloadItem {
  title?: string;
  date?: string;
}

export interface PaymentRequestResponse {
  success: boolean;
  message?: string;
  payment_request?: string;
  longurl?: string;
  // Phase 3b: server-catalogue price + the Stripe session id.
  sessionId?: string;
  amount?: number;
  currency?: string;
}

/** Narrow an unknown JSON value into a SessionProfile, or return null. */
export function isSessionProfile(value: unknown): value is SessionProfile {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { result?: unknown; token?: unknown };
  if (typeof v.token !== "string") return false;
  if (typeof v.result !== "object" || v.result === null) return false;
  const r = v.result as { _id?: unknown; email?: unknown };
  return typeof r._id === "string" && typeof r.email === "string";
}

/** Parse the persisted "Profile" value; null when absent or malformed. */
export function readStoredSession(): SessionProfile | null {
  try {
    const raw = localStorage.getItem("Profile");
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSessionProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
