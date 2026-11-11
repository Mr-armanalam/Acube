// Shared constants for Acube (single source of truth).
// These values are used by apps/api today; apps/web adopts them in Phase 2
// when it moves to Vite. Do not duplicate these numbers in app code.
// Free (non-premium) users may download this many videos per day.
export const FREE_DAILY_DOWNLOADS = 1;
// OTP codes are this many decimal digits (see utils/utility_func.js).
export const OTP_LENGTH = 6;
// Only these MIME types are accepted for video uploads (see Helper/filehelper.js).
export const SUPPORTED_VIDEO_MIMETYPES = ["video/mp4"];
// Phase 3b: server-side premium price catalogue. The premium price lives
// HERE (overridable by the PREMIUM_PRICE_INR env var) — never in a client
// request. Any client-supplied amount is ignored. Arman must confirm the
// price: the default 1000 INR matches what the old client sent before
// Phase 3b removed the client amount entirely.
export const PREMIUM_PRICE_INR = 1000;
export const PREMIUM_CURRENCY = "INR";
export const PREMIUM_PRODUCT_NAME = "Acube Premium";
// Phase 3b: points rule (see Controllers/Auth.js watchComplete). Points
// are NEVER taken from the client: they are awarded server-side only when
// a signed-in user completes watching a video that exists, at
// POINTS_PER_WATCH_COMPLETE per completion, capped at
// MAX_POINTS_PER_VIDEO_PER_DAY per video per day (UTC date).
export const POINTS_PER_WATCH_COMPLETE = 5;
export const MAX_POINTS_PER_VIDEO_PER_DAY = 10;
// Phase 3b: video uploads are capped server-side (multer limit +
// controller check) at this many bytes. The client already shows "10 MB".
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
// Settings polish: channel banner / avatar image uploads (POST
// /studio/banner, POST /studio/avatar — see Helper/imageFilehelper.js).
// JPG and PNG only (no webp: nothing in the codebase accepts it today),
// capped server-side (multer limit + controller check) at 5 MB.
export const SUPPORTED_IMAGE_MIMETYPES = ["image/jpeg", "image/png"];
export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
// Phase 3b: list endpoints accept ?page&limit; limit is capped here so a
// client can never ask for the whole collection in one request.
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 50;
//# sourceMappingURL=constants.js.map