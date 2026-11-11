// Express app factory (no listen / no DB connect here — see index.js).
// Split out of index.js so Supertest can import the app without starting
// a server or opening a database connection.
//
// dotenv MUST load as the first import (not the dotenv.config() call
// further down): ES imports are hoisted, so the route imports below
// (Routes/video.js → Controllers/video.js → cloudinary.js) are evaluated
// BEFORE any body statement runs. Loading dotenv here means .env is
// read before any imported module's body executes. This is defence in
// depth only — cloudinary.js configures the SDK lazily at upload time
// and must stand on its own, because tests import app.js directly and
// dotenv may legitimately be absent there.
import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "node:url";
import videoroutes from "./Routes/video.js";
import watchroutes from "./Routes/watch.js";
import studioroutes from "./Routes/studio.js";
import userroutes from "./Routes/User.js";
import channelroutes from "./Routes/channel.js";
import commentroutes from "./Routes/comment.js";
import chatroutes from "./Routes/chat.js";
import downloadVid from "./Routes/downloadVid.js";
import Otpauth from "./Routes/Otpauth.js";
import { authLimiter, globalLimiter } from "./middleware/rateLimit.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { stripeWebhook } from "./Controllers/downloadVideo/webhook.js";

dotenv.config();

const app = express();

// CORS allowlist — never "*". FRONTEND_URL is the deployed frontend;
// the localhost entries cover local dev (CRA on 3000, Vite on 5173 in
// Phase 2). Requests with no Origin header (curl, server-to-server,
// Supertest) are allowed. The deployed frontend from the README,
// https://accube.vercel.app, is in the default list; set FRONTEND_URL to
// override/add origins.
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://accube.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
].filter(Boolean);

export const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    const err = new Error(`CORS: origin ${origin} is not allowed`);
    err.status = 403;
    err.code = "FORBIDDEN_ORIGIN";
    return callback(err);
  },
  credentials: true,
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(globalLimiter);
app.use(cookieParser());
// Phase 3b: Stripe webhook BEFORE express.json — Stripe's signature
// verification needs the exact raw body, and express.json would parse
// (and re-serialise) it. This route is public (Stripe calls it, not a
// user); verification is the stripe-signature header + secret.
app.post(
  "/download/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook,
);
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));
// Upload-wizard fix: serve uploads from apps/api/uploads resolved
// against this file, never against process.cwd() — the e2e server runs
// from apps/web under Playwright, where a relative "uploads" points
// at a directory that does not exist (see Helper/filehelper.js).
// Settings polish fix: Helmet sets Cross-Origin-Resource-Policy:
// same-origin globally, which makes the browser REFUSE to load these
// files from the web origin (a different origin by design — the API
// is :5000, the web is :3000/:4173), so an uploaded banner/avatar
// 404'd in the browser as ERR_BLOCKED_BY_RESPONSE.NotSameOrigin even
// though the upload succeeded. Uploads are public, unauthenticated
// media (like a CDN), so this mount answers cross-origin.
app.use(
  "/uploads",
  express.static(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "uploads"),
    {
      setHeaders(res) {
        res.set("Cross-Origin-Resource-Policy", "cross-origin");
      },
    },
  ),
);
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.send("Your tube is working");
});

app.get("/health", (req, res) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  res.status(200).json({
    status: "ok",
    db: dbState === 1 ? "connected" : "disconnected",
    uptime: Math.floor(process.uptime()),
  });
});

// Stricter rate limit on the OTP/auth surface (see middleware/rateLimit.js).
app.use("/auth", authLimiter, Otpauth);
app.use("/user", userroutes);
// Public channel-page routes (GET /channel/:id/playlists).
app.use("/channel", channelroutes);
app.use("/video", videoroutes);
// Phase 5 fix: watch-page routes (GET /watch/:id/suggestions).
app.use("/watch", watchroutes);
// Phase 5: Creator Studio (see Routes/studio.js).
app.use("/studio", studioroutes);
app.use("/comment", commentroutes);
app.use("/chat", chatroutes);
app.use("/download", downloadVid);

// Unknown routes + central error handler (stable { error: { code, message } }
// shape). These must stay last.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
