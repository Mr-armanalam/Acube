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

export const uploadVideoBodySchema = z.object({
  title: nonEmptyString,
  chanel: nonEmptyString,
  // Phase 3b: `uploader` is ignored server-side — the uploader is
  // req.userid (see Controllers/video.js). Kept in the schema only so
  // older clients are not rejected for sending it.
  uploader: z.string().optional(),
});

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
export const visibilitySchema = z.enum(["public", "unlisted", "private"]);

// PATCH /video/:id — only title (1–100 chars) and/or visibility are
// writable. Strict: any other field (views, Like, …) is 400, not
// silently stripped. At least one of the two is required.
export const updateVideoSchema = z
  .object({
    title: z.string().min(1, "must not be empty").max(100).optional(),
    visibility: visibilitySchema.optional(),
  })
  .strict()
  .refine((v) => v.title !== undefined || v.visibility !== undefined, {
    message: "at least one of title or visibility is required",
  });

// GET /studio/analytics?range=7|28|90 (default 28). Anything else is 400.
export const studioAnalyticsQuerySchema = z.object({
  range: z.enum(["7", "28", "90"]).default("28"),
});

// PATCH /studio/settings — the caller's own channel (name/desc). Reuses
// the channel-edit fields; at least one is required.
export const studioSettingsSchema = z
  .object({
    name: z.string().min(1, "must not be empty").max(100).optional(),
    desc: z.string().max(500).optional(),
  })
  .refine((v) => v.name !== undefined || v.desc !== undefined, {
    message: "at least one of name or desc is required",
  });

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
export type CreatePlaylistInput = z.infer<typeof createPlaylistSchema>;
export type UpdatePlaylistInput = z.infer<typeof updatePlaylistSchema>;
export type LibraryEntryInput = z.infer<typeof libraryEntrySchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type SendGroupMessageInput = z.infer<typeof sendGroupMessageSchema>;
export type HistoryEntryInput = z.infer<typeof historyEntrySchema>;
