"use strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { MAX_UPLOAD_BYTES, SUPPORTED_VIDEO_MIMETYPES } from "@acube/shared";

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
const filefilter = (req,file, cb) => {
    if (SUPPORTED_VIDEO_MIMETYPES.includes(file.mimetype)) {
        cb(null, true)
    } else {
        cb(null, false)
    }
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
export default upload
