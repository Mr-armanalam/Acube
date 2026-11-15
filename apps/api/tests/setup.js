// Runs before every test file (vitest setupFiles). Sets dummy credentials
// so module-level clients (Twilio, Stripe) construct without real accounts,
// connects mongoose to the in-memory server from globalSetup, and wipes
// every collection before each test so tests are isolated.
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach } from "vitest";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-for-tests-only";
process.env.ACCOUNT_SID = "ACtest0000000000000000000000000000";
process.env.ACCOUNT_TOKEN = "test-twilio-token";
process.env.TWILIO_NUMBER = "+10000000000";
process.env.STP_USER = "test@example.com";
process.env.STP_PASSWORD = "test-smtp-password";
process.env.STRIPE_SK = "sk_test_dummy_key_for_tests";
// Phase 3b: webhook signature secret (dummy in tests — the Stripe mock
// in download.test.js accepts only the "valid-sig" test signature).
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret_for_tests";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.PORT = "5000";
// Google login is mocked in auth.test.js (vi.mock ../utils/googleAuth.js);
// this dummy value only documents that the variable must exist in real runs.
process.env.GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";

beforeAll(async () => {
  const uri = process.env.MONGO_MEMORY_URI;
  if (!uri) throw new Error("MONGO_MEMORY_URI not set — globalSetup did not run");
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }
});

afterAll(async () => {
  await mongoose.disconnect();
});

beforeEach(async () => {
  // Wipe every registered collection so each test starts from an empty DB.
  const models = Object.values(mongoose.models);
  await Promise.all(models.map((model) => model.deleteMany({})));
});
