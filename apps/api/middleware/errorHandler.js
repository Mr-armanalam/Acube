// Central error-handling middleware — the last middleware in app.js.
// Stable JSON shape: { error: { code, message } }.
// In production, 500s return a generic message (no raw error text leaks);
// in development the real message is included to aid debugging.
import logger from "../utils/logger.js";

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.path} not found` },
  });
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  // Phase 3b: multer upload errors (e.g. LIMIT_FILE_SIZE from the 10 MB
  // cap) are client errors, not 500s.
  if (err && err.name === "MulterError") {
    // Settings polish: banner/avatar image uploads cap at 5 MB, not
    // the video 10 MB — the message must name the limit that
    // actually applied to this route.
    const isImageUpload =
      req.path === "/studio/banner" || req.path === "/studio/avatar";
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message:
          err.code === "LIMIT_FILE_SIZE"
            ? isImageUpload
              ? "File must be less than 5 MB"
              : "File must be less than 10 MB"
            : err.message || "Upload failed",
      },
    });
  }
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  const isProduction = process.env.NODE_ENV === "production";
  logger.error({ err, method: req.method, path: req.path }, "Unhandled error");
  res.status(status).json({
    error: {
      code: err.code || (status === 500 ? "INTERNAL_ERROR" : "ERROR"),
      message:
        status === 500 && isProduction
          ? "Internal server error"
          : err.message || "Internal server error",
    },
  });
};
