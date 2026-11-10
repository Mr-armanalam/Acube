import crypto from "node:crypto";
import twilio from 'twilio'; 
import nodemailer from 'nodemailer';
import { OTP_LENGTH } from "@acube/shared";

// OTP validity / limits (enforced in Controllers/OtpAuth.js).
export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

// SHA-256 hex digest of an OTP. OTPs are stored hashed only — the
// plaintext code is never written to the database (see Models/Otp.js).
export function hashOtp(otp) {
  return crypto.createHash("sha256").update(String(otp)).digest("hex");
}

export function generateOTP(length = OTP_LENGTH) {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    // crypto.randomInt, never Math.random: OTPs must not be predictable.
    otp += digits[crypto.randomInt(0, 10)];
  }
  return otp;
}


// Phase 3a: the senders now THROW on failure (they used to swallow the
// error and return undefined, so SendOtp answered 200 even when nothing
// was sent). The controller awaits them and answers 500
// {error:{code:"OTP_SEND_FAILED"}} when delivery actually fails.
export async function sendOTPEmail(recipientEmail, otp) {
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.STP_USER,
      pass: process.env.STP_PASSWORD,
    },
  });

  let mailOptions = {
    from: 'Your-tube',
    to: recipientEmail,
    subject: 'Your OTP Code',
    text: `Your OTP code is ${otp}. It is valid for 10 minutes.`,
  };

  let info = await transporter.sendMail(mailOptions);
  return info;
}


const accountSid = process.env.ACCOUNT_SID;
const authToken = process.env.ACCOUNT_TOKEN;
const client = twilio(accountSid, authToken);

export async function sendOTPSMS(recipientNumber, otp) {
  await client.messages.create({
    body: `Your OTP code is ${otp}. It is valid for 10 minutes.`,
    from: process.env.TWILIO_NUMBER,
    to: recipientNumber,
  });
}
