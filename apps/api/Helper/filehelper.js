"use strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import {
  MAX_UPLOAD_BYTES,
  SUPPORTED_IMAGE_MIMETYPES,
  SUPPORTED_VIDEO_MIMETYPES,
} from "@acube/shared";
import { sanitiseImageFilename } from "./imageFilehelper.js";

// Upload-wizard fix: the uploads directory is resolved against THIS
// file (apps/api/uploads), never against process.cwd(). The e2e server
// runs from apps/web under Playwright, so the old relative "uploads"
// destination made multer fail with ENOENT (apps/web/uploads does not
// exist) — and the /uploads static route in app.js served from the
// wrong directory too. The directory is created on import so the first
// upload after a fresh checkout cannot fail on a missing folder.

// Phase 3b: filenames are sanitised — the raw originalname is never
// used as a stored filename (it could contain path traversal like
// "../../etc/passwd" or characters the filesystem chokes on). The
// stored name is <timestamp>-<random-hex>-<sanitised-basename>.mp4:
// only [A-Za-z0-9._-] survive, the extension is forced to .mp4, and
// path.basename strips any directory component first.
function sanitiseFilename(originalname) {
  const base = path.basename(String(originalname ?? "upload.mp4"));
  const stem = base.replace(/\.[^.]*$/, "");
  const clean = stem.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "");
  return `${new Date().toISOString().replace(/:/g, "-")}-${crypto.randomBytes(8).toString("hex")}-${clean || "video"}.mp4`;
}

const uploadsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "uploads",
);
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, res, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        cb(null, sanitiseFilename(file.originalname));
    },
});

// Auto-thumbnails: the video upload endpoint also accepts an optional
// second file part, "thumbnail" (JPG/PNG, 5 MB — same rule as
// banner/avatar). The stored filename for that part keeps the image
// extension from its validated MIME type (never the raw originalname),
// exactly like Helper/imageFilehelper.js.
const videoUploadStorage = multer.diskStorage({
  destination: (req, res, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    if (file.fieldname === "thumbnail") {
      cb(null, sanitiseImageFilename(file.originalname, file.mimetype));
    } else {
      cb(null, sanitiseFilename(file.originalname));
    }
  },
});
const filefilter = (req,file, cb) => {
    if (SUPPORTED_VIDEO_MIMETYPES.includes(file.mimetype)) {
        cb(null, true)
    } else {
        cb(null, false)
    }
}
// Auto-thumbnails: field-aware filter for the two-part upload. The
// "file" part keeps the old behaviour — a non-mp4 is silently dropped
// and the controller 404s ("plz upload a mp.4 video file only"), so
// existing clients/tests are unaffected. The "thumbnail" part is
// OPTIONAL, so a silent drop would be worse than an error: the
// uploader would believe their thumbnail was accepted when it was
// ignored. A wrong-MIME thumbnail therefore fails the request with a
// 400 VALIDATION_ERROR (status + code set here so the central error
// handler maps it, instead of turning it into a 500).
const videoUploadFileFilter = (req, file, cb) => {
  if (file.fieldname === "thumbnail") {
    if (SUPPORTED_IMAGE_MIMETYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const error = new Error("Only JPG and PNG images are supported");
      error.status = 400;
      error.code = "VALIDATION_ERROR";
      cb(error);
    }
    return;
  }
  filefilter(req, file, cb);
}
// Phase 3b: hard 10 MB cap (multer enforces it before the controller
// runs; the controller re-checks — see Controllers/video.js). An
// over-limit file is rejected with a Multer LIMIT_FILE_SIZE error,
// mapped to 400 by the central error handler.
const upload = multer({
  storage: storage,
  fileFilter: filefilter,
  limits: { fileSize: MAX_UPLOAD_BYTES },
});
// Auto-thumbnails: the upload endpoint's multer setup — one "file"
// (video/mp4, 10 MB) + one optional "thumbnail" (JPG/PNG). The
// per-file size limit stays 10 MB; the controller enforces the
// thumbnail's 5 MB cap (defence in depth — see Controllers/video.js),
// so a 6 MB thumbnail gets the 5 MB message from the controller, not
// multer's 10 MB one. Files land on req.files.file[0] /
// req.files.thumbnail[0]; the controller also accepts the legacy
// req.file (upload.single) so direct controller callers keep working.
export const uploadVideoWithThumbnail = multer({
  storage: videoUploadStorage,
  fileFilter: videoUploadFileFilter,
  limits: { fileSize: MAX_UPLOAD_BYTES },
}).fields([
  { name: "file", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
]);
export default upload
