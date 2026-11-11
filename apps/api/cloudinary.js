import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

function removeLocalFile(localFilePath) {
  try {
    if (localFilePath) fs.unlinkSync(localFilePath);
  } catch {
    // The temp file may already be gone (e.g. a previous attempt
    // removed it); a missing temp file is not an upload failure.
  }
}

const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;
    // Phase 3b: resource_type "video" (was "auto") — this endpoint only
    // ever uploads videos, so the upload must be treated as one.
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "video",
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
