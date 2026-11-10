// OTP send / verify (Phase 3a). The old process-local `otpStore` object is
// gone: codes live in the Otp Mongo collection (Models/Otp.js) as SHA-256
// hashes, expire after 10 minutes, allow at most 5 verify attempts, and
// enforce a 60 s resend cooldown. Delivery is awaited — a failed send
// answers 500 {error:{code:"OTP_SEND_FAILED"}} instead of a silent 200
// (see PHASE3A_NOTES.md: this changes the old behaviour pinned by the
// Phase 1 tests, and the 3b-owned smoke test's send-otp expectation).
// Both routes are additionally behind the existing auth rate limiter
// (app.js mounts /auth under authLimiter: 30 req / 15 min in production).
import crypto from "node:crypto";
import Otp from "../Models/Otp.js";
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  generateOTP,
  hashOtp,
  sendOTPEmail,
  sendOTPSMS,
} from "../utils/utility_func.js";

function identifierOf(req) {
  return req.body.email || req.body.phone;
}

function hashesMatch(candidate, storedHash) {
  const candidateHash = Buffer.from(hashOtp(candidate), "utf8");
  const expectedHash = Buffer.from(storedHash, "utf8");
  if (candidateHash.length !== expectedHash.length) return false;
  return crypto.timingSafeEqual(candidateHash, expectedHash);
}

export const SendOtp = async (req, res) => {
  const { email, phone } = req.body;
  const identifier = identifierOf(req);
  const now = new Date();

  const existing = await Otp.findOne({ identifier });
  if (
    existing &&
    now.getTime() - new Date(existing.lastSentAt).getTime() <
      OTP_RESEND_COOLDOWN_MS
  ) {
    return res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "OTP was sent recently — wait 60 seconds before resending",
      },
    });
  }

  const otp = generateOTP();

  // Delivery first: if sending actually fails, answer 500 and store
  // nothing — the user never received a code, so there is nothing to verify.
  try {
    if (email) {
      await sendOTPEmail(email, otp);
    } else if (phone) {
      await sendOTPSMS(phone, otp);
    }
  } catch (error) {
    console.error("Error sending OTP:", error);
    return res.status(500).json({
      error: { code: "OTP_SEND_FAILED", message: "Failed to send OTP" },
    });
  }

  await Otp.findOneAndUpdate(
    { identifier },
    {
      identifier,
      otpHash: hashOtp(otp),
      attempts: 0,
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      lastSentAt: now,
      verified: false,
      verifiedUntil: null,
    },
    { upsert: true, returnDocument: "after" },
  );

  res.status(200).send("OTP sent on" + " " + (email ? "email" : "phone"));
};

export const VerifyOtp = async (req, res) => {
  const { otp } = req.body;
  const identifier = identifierOf(req);
  const now = new Date();

  const record = await Otp.findOne({ identifier });
  if (!record) {
    return res.status(400).send("Invalid OTP");
  }

  // TTL deletion is only a backstop — always enforce expiry in code.
  if (now > new Date(record.expiresAt)) {
    await Otp.deleteOne({ _id: record._id });
    return res.status(400).send("OTP expired");
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    await Otp.deleteOne({ _id: record._id });
    return res.status(429).send("Too many incorrect attempts — request a new OTP");
  }

  if (!hashesMatch(otp, record.otpHash)) {
    const attempts = record.attempts + 1;
    if (attempts >= OTP_MAX_ATTEMPTS) {
      // 5th wrong attempt: invalidate the code outright.
      await Otp.deleteOne({ _id: record._id });
      return res
        .status(429)
        .send("Too many incorrect attempts — request a new OTP");
    }
    record.attempts = attempts;
    await record.save();
    return res.status(400).send("Invalid OTP");
  }

  // Correct code: single-use verified flag, valid 10 minutes. The record
  // is consumed (deleted) by a successful OTP login; its expiresAt is
  // extended to the verified window so TTL cannot delete it early.
  const verifiedUntil = new Date(now.getTime() + OTP_TTL_MS);
  record.verified = true;
  record.verifiedUntil = verifiedUntil;
  record.expiresAt = verifiedUntil;
  record.attempts = 0;
  await record.save();
  res.status(200).send("OTP verified");
};
