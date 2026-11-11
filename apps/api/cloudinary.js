import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

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

function removeLocalFile(localFilePath) {
  try {
    if (localFilePath) fs.unlinkSync(localFilePath);
  } catch {
    // The temp file may already be gone (e.g. a previous attempt
    // removed it); a missing temp file is not an upload failure.
  }
}

const uploadOnCloudinary = async (localFilePath, resourceType = "video") => {
  try {
    if (!localFilePath) return null;
    // Lazy config (see above): the SDK must be configured with the
    // env values as they are NOW, not as they were at import time.
    configureCloudinary();
    // resource_type defaults to "video" (the original behaviour —
    // this endpoint only ever uploaded videos). Image uploads
    // (banner/avatar) pass "image": uploading a PNG as "video"
    // fails on Cloudinary, and "auto" would mis-detect.
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: resourceType,
    });
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
