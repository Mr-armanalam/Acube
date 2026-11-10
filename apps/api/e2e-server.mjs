// E2E support server (Phase 3c) — boots the REAL API against an
// in-memory MongoDB seeded with one video, for the Playwright smoke
// tests (apps/web/e2e/). This is test infrastructure, not part of the
// app: it is started by Playwright's webServer (see
// apps/web/playwright.config.ts), or manually with:
//
//   node e2e-server.mjs   # listens on :5000, seeds one video
//
// No real credentials, no real MongoDB, no real Stripe/Twilio/
// Cloudinary: every secret below is a dummy test value. The seeded
// video's filepath is intentionally NOT a playable file — actual video
// playback with sound is NOT verified here (see PHASE3_REPORT.md).
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { cleanStaleMongoTmp } from "./tests/mongoTmpCleanup.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "e2e-test-secret-not-a-real-secret";
process.env.SECRETKEY_CRYPTO = "e2e-test-crypto-key-not-a-real-secret";
process.env.GOOGLE_CLIENT_ID = "e2e-test.apps.googleusercontent.com";
process.env.STRIPE_SK = "sk_test_e2e_dummy_key";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_e2e_test_dummy_secret";
process.env.ACCOUNT_SID = "ACe2e0000000000000000000000000000";
process.env.ACCOUNT_TOKEN = "e2e_dummy_token";
process.env.TWILIO_NUMBER = "+10000000000";
process.env.STP_USER = "e2e@example.com";
process.env.STP_PASSWORD = "e2e_dummy_password";
// The Playwright web server runs on :4173 — it must be a CORS-allowed
// origin or every API call from the browser gets 403 FORBIDDEN_ORIGIN.
process.env.FRONTEND_URL = "http://localhost:4173";
process.env.PORT = "5000";

// Fixed id so the Playwright tests can link straight to the video page.
export const SEEDED_VIDEO_ID = "507f1f77bcf86cd799439011";
export const SEEDED_VIDEO_TITLE = "E2E Smoke Video";

// Phase 4: same /tmp-exhaustion guard as the unit-test globalSetup —
// killed e2e runs leave ~200 MB mongo-mem-* dirs behind on a 512 MB tmpfs.
await cleanStaleMongoTmp();
const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri());

const { default: Videofiles } = await import("./Models/videofile.js");
// Phase 5: PHASE5_SEED=1 (used by the Phase 5 Playwright config only)
// seeds the Creator Studio data for the fake e2e user — a User row,
// the seeded video as THEIR video, one ChannelDailyStat row, a comment,
// a history row, a playlist and a saved library entry. The default
// (unset) seeding is unchanged, so the Phase 3c/4 specs are unaffected.
const PHASE5_SEED = process.env.PHASE5_SEED === "1";
export const FAKE_USER_ID = "507f1f77bcf86cd799439012";
await Videofiles.create({
  _id: new mongoose.Types.ObjectId(SEEDED_VIDEO_ID),
  videotitle: SEEDED_VIDEO_TITLE,
  filename: "e2e-smoke.mp4",
  filetype: "video/mp4",
  filepath: "/videos/e2e-smoke.mp4",
  filesize: "12345",
  videochanel: PHASE5_SEED ? FAKE_USER_ID : "e2e-channel",
  uploader: "e2e",
  Like: 0,
  views: 0,
});

if (PHASE5_SEED) {
  const { default: User } = await import("./Models/Auth.js");
  const { default: ChannelDailyStat } = await import("./Models/ChannelDailyStat.js");
  const { default: Comment } = await import("./Models/comment.js");
  const { default: History } = await import("./Models/history.js");
  const { default: Playlist } = await import("./Models/Playlist.js");
  const { default: LibraryEntry } = await import("./Models/LibraryEntry.js");
  const today = new Date().toISOString().slice(0, 10);
  await User.create({
    _id: new mongoose.Types.ObjectId(FAKE_USER_ID),
    name: "E2E User",
    username: "e2euser",
    email: "e2e@example.com",
    desc: "E2E test channel",
  });
  // Seeded (not invented-at-runtime) analytics: the dashboard must show
  // exactly these numbers — 7 views, 2 likes, 12.5 watch minutes.
  await ChannelDailyStat.create({
    videochanel: FAKE_USER_ID,
    day: today,
    views: 7,
    likes: 2,
    watchMinutes: 12.5,
    completions: 1,
  });
  await Comment.create({
    videoid: SEEDED_VIDEO_ID,
    userid: "507f1f77bcf86cd799439099",
    commentbody: "Great tutorial!",
    usercommented: "carol",
    commentedon: new Date(),
  });
  await History.create({ videoid: SEEDED_VIDEO_ID, viewer: FAKE_USER_ID });
  await Playlist.create({
    owner: FAKE_USER_ID,
    title: "My favourites",
    description: "E2E playlist",
    visibility: "public",
    videoIds: [SEEDED_VIDEO_ID],
  });
  await LibraryEntry.create({
    userId: FAKE_USER_ID,
    videoid: SEEDED_VIDEO_ID,
    kind: "saved",
  });
}

const { default: app } = await import("./app.js");
const server = app.listen(5000, () => {
  console.log(
    `E2E API listening on :5000 (in-memory MongoDB, seeded video ${SEEDED_VIDEO_ID})`,
  );
});

const shutdown = async () => {
  // Phase 4: without this, keep-alive connections hold server.close()
  // open and Playwright's teardown kills the process before mongod.stop()
  // runs — leaving a ~200 MB mongo-mem-* dir on the 512 MB /tmp tmpfs.
  server.closeAllConnections?.();
  server.close();
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
