"use strict";
// Settings polish: multer upload for channel banner / avatar images
// (POST /studio/banner, POST /studio/avatar). Separate from
// Helper/filehelper.js on purpose: that helper is video-only (its
// fileFilter accepts video/mp4 only and its filenames are forced to
// .mp4). This one accepts JPG/PNG images only, capped at 5 MB
// (MAX_IMAGE_UPLOAD_BYTES), and keeps the image extension in the
// stored filename — never the raw originalname (path traversal /
// odd characters), same sanitising rule as the video helper.
//
// The uploads directory is resolved against THIS file
// (apps/api/uploads), never against process.cwd() — same fix as the
// video helper (see Helper/filehelper.js).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import {
  MAX_IMAGE_UPLOAD_BYTES,
  SUPPORTED_IMAGE_MIMETYPES,
} from "@acube/shared";

const uploadsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "uploads",
);
fs.mkdirSync(uploadsDir, { recursive: true });

// Extension comes from the validated MIME type, never from the
// original filename (a "photo.png" that is really a JPEG is stored
// as .jpg, so the served Content-Type matches the bytes).
const EXTENSION_BY_MIMETYPE = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

export function sanitiseImageFilename(originalname, mimetype) {
  const base = path.basename(String(originalname ?? "image"));
  const stem = base.replace(/\.[^.]*$/, "");
  const clean = stem.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "");
  const ext = EXTENSION_BY_MIMETYPE[mimetype] ?? ".png";
  return `${new Date().toISOString().replace(/:/g, "-")}-${crypto.randomBytes(8).toString("hex")}-${clean || "image"}${ext}`;
}

const storage = multer.diskStorage({
  destination: (req, res, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, sanitiseImageFilename(file.originalname, file.mimetype));
  },
});

// Rejected files never reach the controller (req.file is undefined
// there, which is a 400 — see Controllers/studio.js). Multer's
// fileFilter is the first line; the controller re-checks MIME + size
// (defence in depth — never trust the client).
const filefilter = (req, file, cb) => {
  if (SUPPORTED_IMAGE_MIMETYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

// Hard 5 MB cap (multer enforces it before the controller runs; the
// controller re-checks). An over-limit file is rejected with a Multer
// LIMIT_FILE_SIZE error, mapped to 400 by the central error handler.
const imageUpload = multer({
  storage,
  fileFilter: filefilter,
  limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES },
});

export default imageUpload;
