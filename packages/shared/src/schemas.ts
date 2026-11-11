// Zod input schemas for every API route (apps/api).
// These are the contract between the client and the API: invalid input is
// rejected with 400 by the validate middleware before any controller runs.
// Schemas are deliberately close to what the controllers already accepted —
// validation rejects malformed input, it does not change valid requests.
// Field-name quirks from the original code (e.g. `recieverId`) are kept so
// the client does not need to change.
import { z } from "zod";
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  OTP_LENGTH,
} from "./constants.js";

const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "must be a valid ObjectId");

const nonEmptyString = z.string().min(1, "must not be empty");

// Every /auth + /user/login request is rate-limited separately (see app.js).
export const sendOtpSchema = z
  .object({
    email: z.string().email("must be a valid email").optional(),
    phone: z.string().min(1, "must not be empty").optional(),
  })
  .refine((v) => v.email || v.phone, {
    message: "either email or phone is required",
  });

export const verifyOtpSchema = z
  .object({
    email: z.string().email("must be a valid email").optional(),
    phone: z.string().min(1, "must not be empty").optional(),
    otp: z
      .string()
      .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `must be ${OTP_LENGTH} digits`),
  })
  .refine((v) => v.email || v.phone, {
    message: "either email or phone is required",
  });

export const loginSchema = z
  .object({
    // Phase 3a: login takes EITHER a Google ID token (verified server-side;
    // identity comes from the token, never from these fields) OR an email
    // with a verified OTP (see Controllers/Auth.js). At least one is
    // required; email alone without a verified OTP is 401 in the controller.
    idToken: z.string().min(1, "must not be empty").optional(),
    email: z.string().email("must be a valid email").optional(),
    username: z.string().optional(),
    picture: z.string().optional(),
  })
  .refine((v) => v.idToken || v.email, {
    message: "either idToken or email is required",
  });

// Phase 5 match-preview: demo sign-in (POST /auth/demo-login).
// TEST-ONLY, env-gated (DEMO_LOGIN_ENABLED=1 and NODE_ENV != production
// — see Controllers/Auth.js demoLogin). The body carries only the seeded
// demo email; the controller looks the user up by { email, demo: true },
// so a real account can never sign in through it, and no password or
// token is accepted. Unknown / non-demo emails get the same 404 as a
// disabled endpoint, so the route does not leak which demo emails exist.
export const demoLoginSchema = z.object({
  email: z.string().email("must be a valid email"),
});

export const updateChannelSchema = z.object({
  name: z.string().optional(),
  desc: z.string().optional(),
});

export const channelIdParamSchema = z.object({ id: objectId });

// Phase 3b: POST /user/watch-complete replaces POST /user/update-points.
// The client sends only the video it finished watching; the server decides
// how many points that is worth (see constants.js points rule). There is
// no client-supplied points value anywhere in the API any more.
export const watchCompleteSchema = z.object({
  videoid: objectId,
});

// Phase 3b: ?page&limit for every list endpoint. Query params arrive as
// strings, so they are coerced; limit is CLAMPED to MAX_PAGE_LIMIT (a
// request for limit=500 gets 50, not a 400) and page is 1-based.
// Defaults: page 1, DEFAULT_PAGE_LIMIT rows.
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .transform((v) => Math.min(v ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT)),
});

// Comment list additionally accepts an optional ?videoid= filter.
export const commentListQuerySchema = paginationQuerySchema.extend({
  videoid: z.string().optional(),
  // Phase 5: fetch only the direct replies of one comment. Omit it to
  // get the flat list (every item carries its parentId, so clients can
  // thread top-level comments + replies themselves).
  parentId: z.string().optional(),
});

export const chatUserSchema = z.object({
  searchquery: z.string().optional(),
});

export const messageIdParamSchema = z.object({ id: objectId });

export const deleteChatMessageSchema = z.object({ id: objectId });

export const sendMessageSchema = z.object({
  message: nonEmptyString,
  recieverId: objectId,
});

export const createGroupSchema = z.object({
  GroupId: z.array(objectId).min(1, "at least one member is required"),
  GroupName: nonEmptyString,
});

export const groupIdParamSchema = z.object({ groupId: objectId });

export const sendGroupMessageSchema = z.object({
  content: nonEmptyString,
  groupId: objectId,
});

export const postCommentSchema = z.object({
  videoid: z.string().optional(),
  userid: z.string().optional(),
  commentbody: nonEmptyString,
  usercommented: z.string().optional(),
  // Phase 5: nested comments. parentId must reference a comment on the
  // same video (enforced in the controller — a missing / other-video /
  // deleted parent is 400). Top-level when omitted.
  parentId: objectId.optional(),
});

export const commentIdParamSchema = z.object({ id: objectId });

export const editCommentSchema = z.object({
  commentbody: nonEmptyString,
});

export const createPaymentRequestSchema = z.object({});
// Phase 3b: the price comes from the server-side catalogue
// (PREMIUM_PRICE_INR), never from the request. The body is empty: the
// buyer is req.userid and the email comes from the user record. Any
// client-supplied amount / _id / emailId is stripped by Zod and ignored.

// Phase 3b: handle-payment-status must name the Stripe Checkout Session
// to verify. A bare call with no session id is 400, and a session that
// Stripe does not report as paid never grants premium.
export const handlePaymentStatusSchema = z.object({
  sessionId: nonEmptyString,
});

// No body fields are read by these handlers; any object body is accepted.
export const emptyBodySchema = z.object({});

// Phase 3b: liking is a toggle, not an absolute count. The client sends
// { action: "like" | "unlike" } and the server $inc's the counter by
// +1 / -1 (floored at 0). A body like { Like: 5 } is 400 — absolute
// counts are never accepted.
export const likeVideoSchema = z.object({
  action: z.enum(["like", "unlike"]),
});

export const videoIdParamSchema = z.object({ id: objectId });

// Phase 5 — Creator Studio (see PHASE5_PLAN.md Reconciliation).
// Visibility: public = in feeds/search; unlisted = direct link only;
// private = owner only (other viewers get 404, not 403).
// Phase 5 fix: "draft" joins the enum — a draft is visible to its owner
// only (same rule as private) and never appears in feeds/search.
export const visibilitySchema = z.enum(["public", "unlisted", "private", "draft"]);

// POST /video/uploadvideo (multipart FormData — every field arrives as
// a string). Phase 5 fix: description / tags / visibility / thumbnailUrl
// are part of the validated body now — before this they were stripped by
// validateBody and the upload silently dropped them, so "Save as draft"
// created a public video with no description or tags. `tags` arrives as
// one comma-separated string from FormData (or an array from a JSON
// client); it is normalised to a trimmed string[] (max 20, each max 50).
// visibility defaults to "public" when omitted.
export const uploadVideoBodySchema = z.object({
  title: nonEmptyString,
  chanel: nonEmptyString,
  // Phase 3b: `uploader` is ignored server-side — the uploader is
  // req.userid (see Controllers/video.js). Kept in the schema only so
  // older clients are not rejected for sending it.
  uploader: z.string().optional(),
  description: z.string().max(5000).optional(),
  tags: z
    .union([
      z.string(),
      z.array(z.string().min(1, "must not be empty").max(50)),
    ])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      // A JSON client may send an array whose elements themselves
      // carry commas ("a, b") — split those too, so every input
      // normalises the same way as the FormData string.
      const raw =
        typeof v === "string" ? v.split(",") : v.flatMap((t) => t.split(","));
      return raw
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
        .slice(0, 20);
    }),
  visibility: visibilitySchema.optional(),
  thumbnailUrl: z.string().url("must be a valid URL").max(1000).optional(),
});

// PATCH /video/:id — title / visibility / description / tags /
// thumbnailUrl / durationSec only (updateVideoSchema is strict: any
// other field is 400). At least one field is required. Views, Like and
// counters are never writable — the server owns them.
export const updateVideoSchema = z
  .object({
    title: z.string().min(1, "must not be empty").max(100).optional(),
    visibility: visibilitySchema.optional(),
    description: z.string().max(5000).optional(),
    tags: z
      .array(z.string().min(1, "must not be empty").max(50))
      .max(20)
      .optional(),
    thumbnailUrl: z.string().url("must be a valid URL").max(1000).optional(),
    durationSec: z.number().min(0).max(86400).optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.title !== undefined ||
      v.visibility !== undefined ||
      v.description !== undefined ||
      v.tags !== undefined ||
      v.thumbnailUrl !== undefined ||
      v.durationSec !== undefined,
    { message: "at least one field is required" },
  );

// GET /studio/analytics?range=7|28|90 (default 28). Anything else is 400.
export const studioAnalyticsQuerySchema = z.object({
  range: z.enum(["7", "28", "90"]).default("28"),
});

// PATCH /studio/settings — the caller's own channel. Phase 5 fix: the
// full channel shape (see apps/web/src/types.ts StudioSettingsPatch).
// handle: 3–30 chars, letters/digits/dot/underscore/hyphen; uniqueness
// is enforced in the controller (409 HANDLE_TAKEN). links: at most 10
// { label, url } pairs. At least one field is required. There is no
// subscribe/follower field anywhere — no follow system exists.
export const studioSettingsSchema = z
  .object({
    name: z.string().min(1, "must not be empty").max(100).optional(),
    desc: z.string().max(500).optional(),
    handle: z
      .string()
      .regex(
        /^[a-zA-Z0-9._-]{3,30}$/,
        "handle must be 3–30 characters: letters, digits, dot, underscore or hyphen",
      )
      .optional(),
    links: z
      .array(
        z.object({
          label: z.string().min(1, "must not be empty").max(50),
          url: z.string().url("must be a valid URL").max(1000),
        }),
      )
      .max(10)
      .optional(),
    contactEmail: z.string().email("must be a valid email").optional(),
    country: z.string().min(1, "must not be empty").max(100).optional(),
    language: z.string().min(1, "must not be empty").max(50).optional(),
    bannerUrl: z.string().url("must be a valid URL").max(1000).optional(),
    avatarUrl: z.string().url("must be a valid URL").max(1000).optional(),
    channelPublic: z.boolean().optional(),
    keepSubscriptionsPrivate: z.boolean().optional(),
    uploadDefaultVisibility: visibilitySchema.optional(),
    uploadDefaultComments: z.boolean().optional(),
    watermarkEnabled: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.desc !== undefined ||
      v.handle !== undefined ||
      v.links !== undefined ||
      v.contactEmail !== undefined ||
      v.country !== undefined ||
      v.language !== undefined ||
      v.bannerUrl !== undefined ||
      v.avatarUrl !== undefined ||
      v.channelPublic !== undefined ||
      v.keepSubscriptionsPrivate !== undefined ||
      v.uploadDefaultVisibility !== undefined ||
      v.uploadDefaultComments !== undefined ||
      v.watermarkEnabled !== undefined,
    { message: "at least one field is required" },
  );

// GET /studio/videos?q=&visibility= — server-side content search/filter.
// q matches the title (case-insensitive substring); visibility filters
// to one visibility (draft included). Both are optional.
export const studioVideosQuerySchema = paginationQuerySchema.extend({
  q: z.string().max(100).optional(),
  visibility: visibilitySchema.optional(),
});

// GET /studio/comments?filter=&sort= — filter=all (default) lists every
// comment on the caller's videos; filter=unreplied lists top-level
// comments with no reply. sort=newest (default) / oldest.
export const studioCommentsQuerySchema = paginationQuerySchema.extend({
  filter: z.enum(["all", "unreplied"]).default("all"),
  sort: z.enum(["newest", "oldest"]).default("newest"),
});

// PATCH /video/history/:videoid/progress — resume position in seconds.
// The controller clamps it to 0..durationSec (durationSec ?? duration);
// a video with no known duration clamps only at 0.
export const videoProgressSchema = z.object({
  progressSec: z.number().min(0, "must be 0 or more"),
});

export const historyProgressParamSchema = z.object({ videoid: objectId });

// PATCH /user/history-paused — the caller's own history-pause flag.
export const historyPausedSchema = z.object({
  paused: z.boolean(),
});

// GET /watch/:id/suggestions — the :id is the watched video.
export const watchSuggestionsParamSchema = z.object({ id: objectId });

export const playlistIdParamSchema = z.object({ id: objectId });

export const createPlaylistSchema = z.object({
  title: z.string().min(1, "must not be empty").max(100),
  description: z.string().max(500).optional(),
  visibility: visibilitySchema.default("public"),
  videoIds: z.array(objectId).default([]),
});

// PATCH /studio/playlists/:id — scalar edits and/or add/remove videoIds.
// At least one field is required.
export const updatePlaylistSchema = z
  .object({
    title: z.string().min(1, "must not be empty").max(100).optional(),
    description: z.string().max(500).optional(),
    visibility: visibilitySchema.optional(),
    addVideoIds: z.array(objectId).optional(),
    removeVideoIds: z.array(objectId).optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.description !== undefined ||
      v.visibility !== undefined ||
      v.addVideoIds !== undefined ||
      v.removeVideoIds !== undefined,
    { message: "at least one field is required" },
  );

export const libraryKindSchema = z.enum(["watchlater", "saved", "liked"]);

// POST /studio/library — add one video to one library tab.
export const libraryEntrySchema = z.object({
  videoid: objectId,
  kind: libraryKindSchema,
});

export const libraryEntryParamSchema = z.object({
  kind: libraryKindSchema,
  videoid: objectId,
});

export const historyEntrySchema = z.object({
  videoid: nonEmptyString,
  viewer: nonEmptyString,
});

export const deleteHistoryParamSchema = z.object({
  userid: nonEmptyString,
});

export const videoViewerParamSchema = z.object({
  videoid: nonEmptyString,
  viewer: nonEmptyString,
});

// Inferred input types, for typed clients (apps/web imports these instead
// of re-declaring the same shapes locally in src/types.ts). The API keeps
// validating the same schemas at runtime; the client types are the same
// contract, not a second one.
export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type DemoLoginInput = z.infer<typeof demoLoginSchema>;
export type WatchCompleteInput = z.infer<typeof watchCompleteSchema>;
export type LikeVideoInput = z.infer<typeof likeVideoSchema>;
export type CreatePaymentRequestInput = z.infer<
  typeof createPaymentRequestSchema
>;
export type HandlePaymentStatusInput = z.infer<
  typeof handlePaymentStatusSchema
>;
export type UploadVideoBodyInput = z.infer<typeof uploadVideoBodySchema>;
export type PostCommentInput = z.infer<typeof postCommentSchema>;
export type UpdateVideoInput = z.infer<typeof updateVideoSchema>;
export type StudioAnalyticsQueryInput = z.infer<
  typeof studioAnalyticsQuerySchema
>;
export type StudioSettingsInput = z.infer<typeof studioSettingsSchema>;
export type StudioVideosQueryInput = z.infer<typeof studioVideosQuerySchema>;
export type StudioCommentsQueryInput = z.infer<
  typeof studioCommentsQuerySchema
>;
export type VideoProgressInput = z.infer<typeof videoProgressSchema>;
export type HistoryPausedInput = z.infer<typeof historyPausedSchema>;
export type CreatePlaylistInput = z.infer<typeof createPlaylistSchema>;
export type UpdatePlaylistInput = z.infer<typeof updatePlaylistSchema>;
export type LibraryEntryInput = z.infer<typeof libraryEntrySchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type SendGroupMessageInput = z.infer<typeof sendGroupMessageSchema>;
export type HistoryEntryInput = z.infer<typeof historyEntrySchema>;
