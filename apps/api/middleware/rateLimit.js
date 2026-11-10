import rateLimit from "express-rate-limit";

// Rate limits. Defaults are intentionally generous for a small app; override
// with env vars. In tests (NODE_ENV=test) the limits are raised very high so
// the suite never trips them — the limiters themselves are still mounted and
// their headers are still emitted.
// Stricter limits apply to /auth/* and /user/login (credential stuffing /
// OTP abuse surface).
const isTest = process.env.NODE_ENV === "test";

const limit = (max, windowMs) =>
  rateLimit({
    windowMs,
    max: isTest ? 10000 : max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      error: { code: "RATE_LIMITED", message: "Too many requests, please try again later" },
    },
  });

export const globalLimiter = limit(
  Number(process.env.RATE_LIMIT_MAX || 300),
  15 * 60 * 1000,
);

export const authLimiter = limit(
  Number(process.env.RATE_LIMIT_AUTH_MAX || 30),
  15 * 60 * 1000,
);
