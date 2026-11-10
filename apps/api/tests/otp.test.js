import { describe, expect, it, vi } from "vitest";
import { api } from "./helpers.js";
import Otp from "../Models/Otp.js";
import { sendOTPEmail, sendOTPSMS } from "../utils/utility_func.js";

// Phase 3a: OTPs live in the Otp collection as hashes, with a 10-minute
// expiry, max 5 verify attempts, and a 60 s resend cooldown. Delivery is
// mocked here — no test calls real SMTP/Twilio — and generateOTP is fixed
// to "123456" so the verify tests know the correct code. (The mock is
// scoped to this file; other files load the real senders.)
vi.mock("../utils/utility_func.js", async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    generateOTP: () => "123456",
    sendOTPEmail: vi.fn(async () => ({ accepted: ["otp@example.com"] })),
    sendOTPSMS: vi.fn(async () => ({})),
  };
});

describe("POST /auth/send-otp", () => {
  it("rejects a request with neither email nor phone (400)", async () => {
    const res = await api.post("/auth/send-otp").send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a malformed email (400)", async () => {
    const res = await api.post("/auth/send-otp").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("sends an email OTP (200) and stores only its hash, never plaintext", async () => {
    const res = await api.post("/auth/send-otp").send({ email: "otp@example.com" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("OTP sent on email");
    const record = await Otp.findOne({ identifier: "otp@example.com" });
    expect(record).not.toBeNull();
    expect(record.otpHash).not.toContain("123456");
    expect(record.otpHash).toHaveLength(64); // sha256 hex
    expect(record.attempts).toBe(0);
    expect(record.verified).toBe(false);
  });

  it("sends a phone OTP (200)", async () => {
    const res = await api.post("/auth/send-otp").send({ phone: "+15551234567" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("OTP sent on phone");
    expect(vi.mocked(sendOTPSMS).mock.calls.length).toBeGreaterThan(0);
  });

  it("returns 500 when email delivery actually fails (no silent 200)", async () => {
    vi.mocked(sendOTPEmail).mockRejectedValueOnce(new Error("SMTP down"));
    const res = await api.post("/auth/send-otp").send({ email: "fail@example.com" });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("OTP_SEND_FAILED");
    // Nothing was delivered, so nothing is stored to verify against.
    expect(await Otp.countDocuments({ identifier: "fail@example.com" })).toBe(0);
  });

  it("rejects a resend within the 60 s cooldown with 429", async () => {
    const first = await api.post("/auth/send-otp").send({ email: "cool@example.com" });
    expect(first.status).toBe(200);
    const second = await api.post("/auth/send-otp").send({ email: "cool@example.com" });
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe("RATE_LIMITED");
  });
});

describe("POST /auth/verify-otp", () => {
  it("rejects a missing otp (400)", async () => {
    const res = await api.post("/auth/verify-otp").send({ email: "otp@example.com" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a non-6-digit otp (400)", async () => {
    const res = await api
      .post("/auth/verify-otp")
      .send({ email: "otp@example.com", otp: "123" });
    expect(res.status).toBe(400);
  });

  it("rejects a request with neither email nor phone (400)", async () => {
    const res = await api.post("/auth/verify-otp").send({ otp: "123456" });
    expect(res.status).toBe(400);
  });

  it("rejects a wrong otp with 400 (Invalid OTP)", async () => {
    await api.post("/auth/send-otp").send({ email: "verify@example.com" });
    const res = await api
      .post("/auth/verify-otp")
      .send({ email: "verify@example.com", otp: "000000" });
    expect(res.status).toBe(400);
    expect(res.text).toBe("Invalid OTP");
  });

  it("accepts the correct otp (200) and marks the record verified", async () => {
    await api.post("/auth/send-otp").send({ email: "good@example.com" });
    const res = await api
      .post("/auth/verify-otp")
      .send({ email: "good@example.com", otp: "123456" });
    expect(res.status).toBe(200);
    expect(res.text).toBe("OTP verified");
    const record = await Otp.findOne({ identifier: "good@example.com" });
    expect(record.verified).toBe(true);
    expect(new Date(record.verifiedUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects an expired otp with 400 (OTP expired)", async () => {
    await api.post("/auth/send-otp").send({ email: "old@example.com" });
    await Otp.updateOne(
      { identifier: "old@example.com" },
      { expiresAt: new Date(Date.now() - 1000) },
    );
    const res = await api
      .post("/auth/verify-otp")
      .send({ email: "old@example.com", otp: "123456" });
    expect(res.status).toBe(400);
    expect(res.text).toBe("OTP expired");
  });

  it("invalidates the OTP after 5 wrong attempts (429 on the 5th)", async () => {
    await api.post("/auth/send-otp").send({ email: "locked@example.com" });
    for (let i = 0; i < 4; i++) {
      const res = await api
        .post("/auth/verify-otp")
        .send({ email: "locked@example.com", otp: "000000" });
      expect(res.status).toBe(400);
    }
    const fifth = await api
      .post("/auth/verify-otp")
      .send({ email: "locked@example.com", otp: "000000" });
    expect(fifth.status).toBe(429);
    // The code is invalidated: even the correct OTP no longer verifies.
    const correct = await api
      .post("/auth/verify-otp")
      .send({ email: "locked@example.com", otp: "123456" });
    expect(correct.status).toBe(400);
    expect(await Otp.countDocuments({ identifier: "locked@example.com" })).toBe(0);
  });
});
