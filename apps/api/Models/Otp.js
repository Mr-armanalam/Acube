// OTP records (Phase 3a). Replaces the old process-local `otpStore` object
// in Controllers/OtpAuth.js: OTPs are now persisted in MongoDB, stored only
// as a SHA-256 hash (never plaintext), expire after 10 minutes, and carry
// the state needed for attempt limits, resend cooldown, and the single-use
// verified flag that POST /user/login consumes.
//
// One document per identifier (email or phone). A resend overwrites the
// previous code and resets attempts / verified state.
//
// The `expires` index on expiresAt lets MongoDB delete stale documents;
// every read still checks the dates in code, because TTL deletion runs
// only about once a minute and must never be the sole expiry enforcement.
import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
  {
    // Email address or phone number the OTP was sent to.
    identifier: { type: String, required: true, unique: true, index: true },
    // SHA-256 hex digest of the 6-digit code (see hashOtp in
    // utils/utility_func.js). The plaintext code is never stored.
    otpHash: { type: String, required: true },
    // Failed verify attempts for the current code; 5 invalidates it.
    attempts: { type: Number, default: 0 },
    // When the current code stops being verifiable.
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    // When the last code was sent; resends within 60 s are rejected (429).
    lastSentAt: { type: Date, required: true },
    // True after a correct verify, until verifiedUntil. Consumed
    // (deleted) by a successful OTP login — single-use.
    verified: { type: Boolean, default: false },
    verifiedUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

export default mongoose.model("Otp", otpSchema);
