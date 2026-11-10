// Express app factory (no listen / no DB connect here — see index.js).
// Split out of index.js so Supertest can import the app without starting
// a server or opening a database connection.
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "path";
import videoroutes from "./Routes/video.js";
import watchroutes from "./Routes/watch.js";
import studioroutes from "./Routes/studio.js";
import userroutes from "./Routes/User.js";
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
app.use("/uploads", express.static(path.join("uploads")));
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
