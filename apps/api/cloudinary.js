import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import {
  AUTO_THUMBNAIL_FRACTIONS,
  AUTO_THUMBNAIL_HEIGHT,
  AUTO_THUMBNAIL_WIDTH,
} from "@acube/shared";

// Upload-wizard fix: Cloudinary is optional now. When none of the three
// credentials is configured the upload endpoint stores the file locally
// instead of failing with "Failed to upload video to cloudinary"
// (see Controllers/video.js). This is checked at request time, not
// import time, so tests can toggle env vars per case.
export function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

// LAZY configuration — the fix for the upload 400 ("Must supply
// api_key") that hit every upload even with a correct .env.
//
// Root cause: the old code called cloudinary.config() at module import
// time, but ES imports are hoisted, so the chain app.js →
// Routes/video.js → Controllers/video.js → cloudinary.js ran BEFORE
// app.js's dotenv.config() body line. The SDK was therefore configured
// once with undefined credentials and never re-configured, while
// isCloudinaryConfigured() (which reads process.env at REQUEST time,
// after dotenv loaded) returned true — so the code took the Cloudinary
// path with an SDK instance that had no api_key and the upload threw.
//
// Configuring here, inside the upload call, reads process.env after
// dotenv has loaded (production) or after the test has set the vars
// (tests). cloudinary.config() merges into the SDK's global config, so
// calling it per upload is cheap and always picks up the current env.
// Never configure at import time again — see
// tests/video-upload-cloudinary-lazy-config.test.js, which fails on the
// import-time version and passes on this one.
function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// Auto-thumbnails: every video upload asks Cloudinary to eagerly
// generate three JPG stills at 5% / 50% / 90% of the video (see
// AUTO_THUMBNAIL_FRACTIONS in @acube/shared). Shape verified against
// the installed SDK, not guessed:
//   * typings (node_modules/cloudinary/types/index.d.ts:513, 592-599):
//     UploadApiOptions.eager?: TransformationOptions, where
//     TransformationOptions includes Array<VideoTransformationOptions>.
//   * runtime (node_modules/cloudinary/lib/utils/index.js build_eager):
//     an array is joined with "|" and each entry's `format` is appended
//     as "/<format>", so the three objects below become one eager
//     parameter like
//     "c_fill,h_720,so_5p,w_1280/jpg|c_fill,h_720,so_50p,w_1280/jpg|
//      c_fill,h_720,so_90p,w_1280/jpg".
//   * `start_offset: "5%"` serializes to `so_5p` (percent of duration —
//     verified with cloudinary.url() against the installed SDK; a plain
//     number would mean seconds instead, e.g. so_5 = 5 seconds in).
//   * the upload response carries the generated stills in an `eager`
//     array of { secure_url, url, ... } — `eager` is NOT in the typed
//     UploadApiResponse (it only has [futureKey: string]: any at
//     :640-669), so extractEagerThumbnailUrls() reads it defensively
//     and returns only http(s) strings, in eager order (5/50/90).
// Image uploads (banner/avatar) never get eager: the transforms are
// video-frame stills and would fail on an image upload.
export const VIDEO_THUMBNAIL_EAGER_TRANSFORMATIONS =
  AUTO_THUMBNAIL_FRACTIONS.map((fraction) => ({
    width: AUTO_THUMBNAIL_WIDTH,
    height: AUTO_THUMBNAIL_HEIGHT,
    crop: "fill",
    format: "jpg",
    start_offset: `${Math.round(fraction * 100)}%`,
  }));

export function extractEagerThumbnailUrls(response) {
  const eager = response?.eager;
  if (!Array.isArray(eager)) return [];
  return eager
    .map((entry) => entry?.secure_url ?? entry?.url)
    .filter(
      (url) => typeof url === "string" && /^https?:\/\//.test(url),
    );
}

function removeLocalFile(localFilePath) {
  try {
    if (localFilePath) fs.unlinkSync(localFilePath);
  } catch {
    // The temp file may already be gone (e.g. a previous attempt
    // removed it); a missing temp file is not an upload failure.
  }
}

const uploadOnCloudinary = async (
  localFilePath,
  resourceType = "video",
  options = {},
) => {
  try {
    if (!localFilePath) return null;
    // Lazy config (see above): the SDK must be configured with the
    // env values as they are NOW, not as they were at import time.
    configureCloudinary();
    // resource_type defaults to "video" (the original behaviour —
    // this endpoint only ever uploaded videos). Image uploads
    // (banner/avatar) pass "image": uploading a PNG as "video"
    // fails on Cloudinary, and "auto" would mis-detect.
    //
    // Eager thumbnails (video only, unless options.eagerThumbnails
    // is explicitly false): the upload itself must NEVER fail
    // because eager generation failed, so a failed eager attempt is
    // retried once WITHOUT eager. A retry that also fails is a real
    // upload failure and returns null exactly as before.
    const eagerThumbnails =
      options.eagerThumbnails ?? resourceType === "video";
    const uploadOptions = { resource_type: resourceType };
    if (eagerThumbnails) {
      uploadOptions.eager = VIDEO_THUMBNAIL_EAGER_TRANSFORMATIONS;
    }
    let response;
    try {
      response = await cloudinary.uploader.upload(
        localFilePath,
        uploadOptions,
      );
    } catch (error) {
      if (!eagerThumbnails) throw error;
      console.warn(
        "[upload] Cloudinary eager thumbnail generation failed " +
          `(${error.message}) — retrying upload without eager so the ` +
          "upload itself still succeeds.",
      );
      response = await cloudinary.uploader.upload(localFilePath, {
        resource_type: resourceType,
      });
    }
    // console.log("file is uploaded on cloudinary");
    // console.log(response.url);
    removeLocalFile(localFilePath);
    return response;
  } catch (error) {
    console.log(error.message);
    removeLocalFile(localFilePath);
    return null;
  }
};

export { uploadOnCloudinary };
