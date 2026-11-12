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

export type VideoVisibility = "public" | "unlisted" | "private" | "draft";

/** POST /video/uploadvideo response (Phase 5 fix): the created video's
 * id + persisted details, so the wizard can link straight to it.
 * Auto-thumbnails (backend contract, parallel worker): `thumbnailUrl`
 * is the chosen frame; `autoThumbnails` lists the server-generated
 * candidate frame URLs (possibly empty — e.g. local fallback before
 * the backend lands frame generation). */
export interface UploadVideoResponse {
  message: string;
  video: {
    id: string;
    videotitle: string;
    visibility: VideoVisibility;
    description: string;
    tags: string[];
    thumbnailUrl: string | null;
    autoThumbnails?: string[] | null;
  };
}

/** A real chapter, from the server. No chapter data exists yet, so the
 * player renders NO chapter ticks until the backend returns chapters —
 * never fake ones (Phase 5 fix audit). */
export interface VideoChapter {
  title: string;
  startSec: number;
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
  /** Phase 5: visibility + processing status (server-owned). */
  visibility?: VideoVisibility;
  status?: "ready" | "processing";
  /** Phase 5 fix contract: description / tags / thumbnail / duration. */
  description?: string;
  tags?: string[];
  thumbnailUrl?: string;
  /** Cloudinary thumbnail (legacy field name from the API model). */
  thumbnail?: string | null;
  /** Duration in seconds (Cloudinary `duration`, legacy field name). */
  duration?: number | null;
  /** Duration in seconds (contract field name). */
  durationSec?: number;
  /** Soft-delete timestamp; null/undefined = live. */
  deletedAt?: string | null;
  /** Real chapters only — absent means "no chapters", never fake ticks. */
  chapters?: VideoChapter[];
  /** Watch-page subscribe contract (backend worker): the channel's
   * real subscriber count and whether the viewer is subscribed
   * (false when anonymous). Absent = unknown, never invented. */
  subscriberCount?: number;
  subscribed?: boolean;
}

export interface Channel {
  _id: string;
  name?: string;
  username?: string;
  // Settings polish: a handle exists on the user record (sparse,
  // unique) and Studio Settings edits it, but GET /user/getallchannel
  // does not project it yet — the header renders @handle only when
  // present and falls back to @username.
  handle?: string;
  /** Watch-page subscribe contract (backend worker): the channel's
   * real subscriber count and whether the viewer is subscribed
   * (false when anonymous). Absent = unknown, never invented. */
  subscriberCount?: number;
  subscribed?: boolean;
  email?: string;
  picture?: string;
  // Settings polish fix: the uploaded avatar/banner, rendered by the
  // channel header (avatarUrl falls back to the Google photo).
  avatarUrl?: string;
  bannerUrl?: string;
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
  /** Phase 5: null = top-level comment; otherwise the parent comment id. */
  parentId?: string | null;
  /** Phase 5: video title attached by /studio/comments. */
  videotitle?: string;
  /** Phase 5 fix contract: user id of the creator who pinned this. */
  pinnedByCreator?: string | null;
  /** Phase 5 fix: whether the creator has replied in this thread
   * (drives the Studio Comments "Unreplied" filter server-side). */
  hasReply?: boolean;
  /** Server-owned like count on the comment, when the API returns one. */
  likes?: number;
  /** Server-owned dislike count on the comment, when the API returns one. */
  dislikes?: number;
  /** The signed-in viewer's reaction to this comment, when the API
   * returns one. null = no reaction. Absent = unknown (e.g. older
   * response shape) — the UI treats it as no reaction, never invents
   * one. */
  userReaction?: "like" | "dislike" | null;
}

/** A comment reaction: POST /comment/:id/like or /dislike toggles it. */
export type CommentReaction = "like" | "dislike";

/** What POST /comment/:id/like and /dislike return: the authoritative
 * counts + the viewer's reaction after the toggle. */
export interface CommentReactionResult {
  likes: number;
  dislikes: number;
  userReaction: CommentReaction | null;
}

/** History / liked / watch-later rows all share this shape. */
export interface VideoListEntry {
  _id: string;
  videoid: string;
  viewer: string;
  likedon?: string;
  createdAt?: string;
  /** Phase 5: watch progress 0–1 when the server reports it; absent = unknown. */
  progress?: number;
  /** Phase 5 fix contract: resume position in seconds. */
  progressSec?: number;
  /** Phase 5 fix contract: video length in seconds (for progress math). */
  durationSec?: number;
}

/** Phase 5 — Creator Studio + playlists (API contract, PHASE5_PLAN.md).
 * Shapes match the backend exactly: bestDay is an object (or null),
 * settings nest under `channel`, PATCH /studio/settings takes
 * { name?, desc? } — there are no handle/links fields on the server. */
export interface StudioOverview {
  channel?: {
    _id: string;
    name?: string;
    email?: string;
    desc?: string;
    picture?: string;
    // Settings polish fix: the uploaded avatar, preferred by the
    // Studio identity header over the Google login photo (picture).
    avatarUrl?: string;
    username?: string;
  };
  totals: {
    totalViews: number;
    totalLikes: number;
    totalVideos: number;
    totalComments: number;
    watchMinutes: number;
    completions: number;
  };
  /** Sums of the per-video counters, including pre-Phase 5 traffic. */
  allTime?: { views: number; likes: number; note: string };
  /** First day with an event row, or null. */
  statsSince?: string | null;
  topVideos: Video[];
  latestComments: CommentItem[];
}

export interface StudioAnalyticsDay {
  date: string;
  views: number;
  watchMinutes: number;
  likes: number;
}

export interface StudioAnalytics {
  range: number;
  days: StudioAnalyticsDay[];
  totals: { views: number; watchMinutes: number; likes: number; completions?: number };
  bestDay: { date: string; views: number } | null;
  /** Phase 5 fix: traffic-source split, ONLY when the backend returns
   * a real one. Absent = "not tracked yet" empty state, never faked. */
  trafficSources?: { source: string; views: number }[];
}

/** Per-video analytics (GET /studio/videos/:id/analytics, owner only).
 * Daily likes are DELIBERATELY ABSENT: likes are channel-level toggle
 * deltas with no honest per-video split, so `days` carries views +
 * completions + watchMinutes only; the all-time Like counter lives on
 * `video.likes` instead. */
export interface StudioVideoAnalyticsDay {
  date: string;
  views: number;
  completions: number;
  watchMinutes: number;
}

export interface StudioVideoAnalytics {
  video: {
    _id: string;
    videotitle: string;
    visibility: string;
    views: number;
    likes: number;
    createdAt: string;
  };
  range: number;
  days: StudioVideoAnalyticsDay[];
  totals: { views: number; completions: number; watchMinutes: number };
  bestDay: { date: string; views: number } | null;
}

export interface StudioChannelLink {
  label: string;
  url: string;
}

/** Settings polish contract — GET /studio/handle/available?handle=…
 * returns exactly this shape. `reason` is set when available is
 * false (e.g. "Handle is already taken"). */
export interface HandleAvailability {
  available: boolean;
  reason?: string;
}

/** Phase 5 fix contract — GET/PATCH /studio/settings, full shape.
 * The backend worker is building this in parallel; until it lands the
 * MSW handlers answer the same shape. No subscribe/follower field
 * exists anywhere: there is no follow system, so none is rendered. */
export interface StudioSettings {
  channel: {
    _id: string;
    name?: string;
    email?: string;
    desc?: string;
    picture?: string;
    username?: string;
    handle?: string;
    links?: StudioChannelLink[];
    contactEmail?: string;
    country?: string;
    language?: string;
    bannerUrl?: string;
    avatarUrl?: string;
    channelPublic?: boolean;
    keepSubscriptionsPrivate?: boolean;
    uploadDefaultVisibility?: VideoVisibility;
    uploadDefaultComments?: boolean;
    watermarkEnabled?: boolean;
  };
}

export type StudioSettingsPatch = {
  name?: string;
  desc?: string;
  handle?: string;
  links?: StudioChannelLink[];
  contactEmail?: string;
  country?: string;
  language?: string;
  bannerUrl?: string;
  avatarUrl?: string;
  channelPublic?: boolean;
  keepSubscriptionsPrivate?: boolean;
  uploadDefaultVisibility?: VideoVisibility;
  uploadDefaultComments?: boolean;
  watermarkEnabled?: boolean;
};

/** Phase 5 fix contract — GET /watch/:id/suggestions. */
export type SuggestionReason =
  | "Same channel"
  | "Same topic"
  | "Viewers also watched"
  | "Similar length";

export interface WatchSuggestion {
  video: Video;
  reason: SuggestionReason;
}

/** Feed personalization — GET /feed (optionalAuth; signed-in only on
 * the Home page, logged-out users keep the getvideos feed).
 * The server ranks the candidate pool and attaches one reason per
 * item. `label` is the exact human string to render (e.g. "Because
 * you watched <title>", "Trending now", "Newest") — the client never
 * invents a reason or a history claim; `reason: null` (or absent)
 * means render no reason line. Cold-start items carry type
 * "trending" / "newest" (or null). `type` is the server's real
 * vocabulary ("watched" for the Because-you-watched reason — the
 * agreed-contract draft said "tag", the landed API says "watched";
 * the client only renders `label`, never branches on `type`). */
export type FeedReasonType = "watched" | "trending" | "newest";

export interface FeedReason {
  type: FeedReasonType;
  label: string;
}

/** A feed item: a video plus the server-supplied reason, if any. */
export interface FeedVideo extends Video {
  reason?: FeedReason | null;
}

export interface Playlist {
  _id: string;
  owner: string;
  title: string;
  description?: string;
  visibility: VideoVisibility;
  videoIds: string[];
  createdAt?: string;
  /** GET /studio/playlists/:id only: videos in playlist order. */
  videos?: Video[];
  videoCount?: number;
}

/** GET /studio/library: full video objects per tab + own playlists. */
export interface LibraryData {
  watchlater: Video[];
  saved: Video[];
  liked: Video[];
  playlists: Playlist[];
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
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
