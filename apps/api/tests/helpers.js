// Shared helpers for the API tests.
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../app.js";
import User from "../Models/Auth.js";
import Otp from "../Models/Otp.js";
import Videofile from "../Models/videofile.js";
import { hashOtp } from "../utils/utility_func.js";

export const api = request(app);

let counter = 0;
function unique(prefix) {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export async function createUser(overrides = {}) {
  const user = await User.create({
    email: `${unique("user")}@example.com`,
    username: unique("user"),
    picture: "https://example.com/pic.png",
    downloads: [],
    downloadsToday: 0,
    lastReset: new Date(),
    ...overrides,
  });
  return user;
}

export function tokenFor(user) {
  return jwt.sign(
    { email: user.email, id: user._id },
    process.env.JWT_SECRET,
    { expiresIn: "6h" },
  );
}

export function authHeader(user) {
  return { Authorization: `Bearer ${tokenFor(user)}` };
}

// Seed a single-use verified-OTP record for `email` (as POST
// /auth/verify-otp would leave it): valid for 10 minutes, consumed by
// one successful OTP login. The code itself is never stored — only its hash.
export async function createVerifiedOtp(email) {
  const now = new Date();
  return Otp.create({
    identifier: email,
    otpHash: hashOtp("123456"),
    attempts: 0,
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
    lastSentAt: now,
    verified: true,
    verifiedUntil: new Date(now.getTime() + 10 * 60 * 1000),
  });
}

export async function createVideo(overrides = {}) {
  const video = await Videofile.create({
    videotitle: unique("video"),
    filename: "test.mp4",
    filetype: "video/mp4",
    filepath: "https://example.com/test.mp4",
    filesize: "1234",
    videochanel: "test-channel",
    uploader: "test-uploader",
    Like: 0,
    views: 0,
    ...overrides,
  });
  return video;
}
