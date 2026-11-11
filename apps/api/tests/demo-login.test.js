// Phase 5 match-preview: env-gated demo sign-in (POST /auth/demo-login).
// The seeded demo users (scripts/seedDemo.js) have no Google account and
// no OTP, so without this route Arman sees nothing after seeding. The
// route is refused (404) unless DEMO_LOGIN_ENABLED=1 AND NODE_ENV is not
// "production". Nothing here touches apps/web.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { api, createUser } from "./helpers.js";
import { seedDemoData } from "../scripts/seedDemo.js";
import { clearStudioCache } from "../utils/studioCache.js";
import Comment from "../Models/comment.js";

const DEMO_CHANNEL_EMAIL = "demo-channel-codestreamer@demo.acube.test";
const DEMO_VIEWER_EMAIL = "demo-viewer-01@demo.acube.test";

let savedFlag;
let savedNodeEnv;

beforeEach(() => {
  clearStudioCache();
  savedFlag = process.env.DEMO_LOGIN_ENABLED;
  savedNodeEnv = process.env.NODE_ENV;
});

afterEach(() => {
  if (savedFlag === undefined) delete process.env.DEMO_LOGIN_ENABLED;
  else process.env.DEMO_LOGIN_ENABLED = savedFlag;
  process.env.NODE_ENV = savedNodeEnv;
});

function enableDemoLogin() {
  process.env.DEMO_LOGIN_ENABLED = "1";
  process.env.NODE_ENV = "test";
}

describe("POST /auth/demo-login", () => {
  it("is refused (404) when DEMO_LOGIN_ENABLED is not set", async () => {
    await seedDemoData();
    delete process.env.DEMO_LOGIN_ENABLED;
    const res = await api
      .post("/auth/demo-login")
      .send({ email: DEMO_CHANNEL_EMAIL });
    expect(res.status).toBe(404);
  });

  it("is refused (404) in production mode even with the flag set", async () => {
    await seedDemoData();
    process.env.DEMO_LOGIN_ENABLED = "1";
    process.env.NODE_ENV = "production";
    const res = await api
      .post("/auth/demo-login")
      .send({ email: DEMO_CHANNEL_EMAIL });
    expect(res.status).toBe(404);
  });

  it("signs in the seeded Code Streamer channel when enabled (non-production)", async () => {
    await seedDemoData();
    enableDemoLogin();
    const res = await api
      .post("/auth/demo-login")
      .send({ email: DEMO_CHANNEL_EMAIL });
    expect(res.status).toBe(200);
    expect(res.body.result.email).toBe(DEMO_CHANNEL_EMAIL);
    expect(res.body.result.name).toBe("Code Streamer");
    expect(res.body.result.demo).toBe(true);
    expect(typeof res.body.token).toBe("string");
    // The issued token is a normal JWT: it opens the Studio dashboard
    // for that channel, with the full preview totals (1,503 / 113).
    const overview = await api
      .get("/studio/overview")
      .set({ Authorization: `Bearer ${res.body.token}` });
    expect(overview.status).toBe(200);
    expect(overview.body.totals.totalViews).toBe(1503);
    expect(overview.body.totals.totalLikes).toBe(113);
    expect(overview.body.totals.totalVideos).toBe(7);
    expect(overview.body.totals.watchHours).toBeGreaterThan(0);
  });

  it("signs in a seeded demo viewer too", async () => {
    await seedDemoData();
    enableDemoLogin();
    const res = await api
      .post("/auth/demo-login")
      .send({ email: DEMO_VIEWER_EMAIL });
    expect(res.status).toBe(200);
    expect(res.body.result.demo).toBe(true);
    expect(typeof res.body.token).toBe("string");
  });

  it("refuses a real (non-demo) account even with the flag set", async () => {
    const real = await createUser();
    enableDemoLogin();
    const res = await api
      .post("/auth/demo-login")
      .send({ email: real.email });
    expect(res.status).toBe(404);
  });

  it("refuses an unknown email with the same 404 (no existence leak)", async () => {
    await seedDemoData();
    enableDemoLogin();
    const res = await api
      .post("/auth/demo-login")
      .send({ email: "nobody@demo.acube.test" });
    expect(res.status).toBe(404);
  });

  it("rejects a malformed body with 400 before the controller runs", async () => {
    enableDemoLogin();
    const res = await api.post("/auth/demo-login").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("seeds staggered comment timestamps (preview's 2h / 5h / 1d / 2d spread, plus 3 pagination extras)", async () => {
    await seedDemoData();
    const times = (
      await Comment.find({ demo: true }).select("commentedon").lean()
    )
      .map((c) => new Date(c.commentedon).getTime())
      .sort((a, b) => a - b);
    // 11 seeded comments: the original 8 + 3 extras (6h / 30h / 72h)
    // so Studio Comments has a page 2 at limit=10.
    expect(times).toHaveLength(11);
    // Not all "just now": the oldest is ~3 days old, the newest <1h.
    expect(times[0]).toBeLessThan(Date.now() - 48 * 60 * 60 * 1000);
    expect(times[times.length - 1]).toBeGreaterThan(
      Date.now() - 60 * 60 * 1000,
    );
    // And they are not all the same instant.
    expect(new Set(times).size).toBeGreaterThan(1);
  });
});
