// Shared upload limits (moved out of the deleted legacy Videoupload
// modal — the Studio UploadWizard is the only upload UI now).
//
// Upload-wizard fix: the client limit is 10 * 1024 * 1024 bytes — the
// SERVER limit (MAX_UPLOAD_BYTES in packages/shared/src/constants.ts),
// not the round 10_000_000 the client used before. A file between
// 10,000,000 and 10,485,760 bytes used to be rejected client-side while
// the server would have accepted it.
/** 10 MiB upload limit, in bytes — matches the server's MAX_UPLOAD_BYTES. */
export const MAX_VIDEO_BYTES = 10 * 1024 * 1024;

/** The only MIME type the server accepts for video uploads. */
export const SUPPORTED_VIDEO_MIMETYPE = "video/mp4";

/**
 * Client-side mp4 check (the server re-checks — multer filter +
 * controller — this only fails fast with an inline error instead of a
 * server round-trip). A file counts as mp4 when its MIME type is
 * video/mp4, or when the browser left the type blank and the name ends
 * in .mp4.
 */
export function isMp4File(file: File): boolean {
  if (file.type === SUPPORTED_VIDEO_MIMETYPE) return true;
  if (file.type === "") {
    return file.name.toLowerCase().endsWith(".mp4");
  }
  return false;
}

/**
 * Client-side thumbnail-URL check — an invalid URL is an inline error,
 * never a request (the server's Zod schema would 400 it). An empty
 * value is valid (no thumbnail URL is optional).
 */
export function isValidThumbnailUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
