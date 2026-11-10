// Phase 5 browser click-through — headless Chromium against the
// production build + the real API on in-memory MongoDB, seeded with
// Phase 5 Studio data (playwright.phase5.config.ts starts the API with
// PHASE5_SEED=1: a User row for the fake e2e user, the seeded video as
// THEIR video, one ChannelDailyStat row for today — 7 views, 2 likes,
// 12.5 watch minutes, 1 completion — one comment, one history row, one
// playlist, one saved library entry). Every number asserted here is a
// seeded number, never invented. No real credentials: no Google sign-in,
// no Stripe, no Cloudinary, no Twilio; the seeded video file does not
// exist, so real playback with sound is NOT verified — only the player
// controls. Run (from apps/web): pnpm test:e2e:phase5
import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SHOT_DIR = fileURLToPath(
  new URL("../../../docs/screenshots", import.meta.url),
);
mkdirSync(SHOT_DIR, { recursive: true });
const shot = (name: string) => path.join(SHOT_DIR, name);

// Must match apps/api/e2e-server.mjs (PHASE5_SEED=1).
const SEEDED_VIDEO_ID = "507f1f77bcf86cd799439011";
const SEEDED_VIDEO_TITLE = "E2E Smoke Video";
const FAKE_USER_ID = "507f1f77bcf86cd799439012";
const E2E_JWT_SECRET = "e2e-test-secret-not-a-real-secret";

// Same properly-signed HS256 JWT trick as the Phase 4 click-through:
// the fake user DOES exist in the Phase 5 seeded DB, so Studio calls
// return real rows instead of 404 "Channel not found".
function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function mintE2EJwt(): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      id: FAKE_USER_ID,
      sub: "e2e",
      name: "E2E User",
      exp: 9999999999,
    }),
  );
  const signature = base64url(
    createHmac("sha256", E2E_JWT_SECRET).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

async function seedFakeSession(page: Page) {
  const token = mintE2EJwt();
  await page.addInitScript((t: string) => {
    localStorage.setItem(
      "Profile",
      JSON.stringify({
        result: {
          _id: "507f1f77bcf86cd799439012",
          name: "E2E User",
          username: "e2euser",
          email: "e2e@example.com",
        },
        token: t,
      }),
    );
  }, token);
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

test.use({ viewport: { width: 1280, height: 800 } });

test.describe("Acube Phase 5 click-through", () => {
  test("1. Home renders the seeded video (premium look)", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await page.goto("/");
    await expect(page.getByText(SEEDED_VIDEO_TITLE).first()).toBeVisible();
    expect(errors).toEqual([]);
    await page.screenshot({ path: shot("phase5-home.png") });
  });

  test("2. Studio dashboard shows the seeded totals", async ({ page }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await page.goto("/studio");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    // Seeded ChannelDailyStat row: 7 views, 2 likes, 12.5 watch minutes.
    const stats = await page.locator(".studio-stat-grid").innerText();
    expect(stats).toContain("Total views");
    expect(stats).toContain("7");
    expect(stats).toContain("Total likes");
    expect(stats).toContain("2");
    expect(stats).toContain("Total videos");
    expect(stats).toContain("1");
    expect(stats).toContain("Total comments");
    expect(stats).toContain("Watch minutes");
    expect(stats).toContain("12.5");
    // Top videos + latest comments come from the same seeded rows.
    // (The title text appears twice — top-videos link + "on <title>"
    // in the comment — so match the link exactly.)
    await expect(
      page.getByRole("link", { name: SEEDED_VIDEO_TITLE }),
    ).toBeVisible();
    await expect(page.getByText("Great tutorial!")).toBeVisible();
    expect(errors).toEqual([]);
    await page.screenshot({ path: shot("studio-dashboard.png") });
  });

  test("3. Studio Content lists the own video with visibility", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await page.goto("/studio/content");
    await expect(page.getByRole("heading", { name: "Content" })).toBeVisible();
    await expect(page.getByText(SEEDED_VIDEO_TITLE)).toBeVisible();
    await expect(
      page.getByLabel(`Visibility for ${SEEDED_VIDEO_TITLE}`),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Edit title" }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    await page.screenshot({ path: shot("studio-content.png") });
  });

  test("4. Studio Analytics shows the seeded series + best day", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await page.goto("/studio/analytics");
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Last 7 days" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Last 90 days" })).toBeVisible();
    // Best day is today (the only seeded stat day) with 7 views.
    const today = new Date().toISOString().slice(0, 10);
    await expect(page.getByText(`${today} · 7 views`)).toBeVisible();
    expect(errors).toEqual([]);
    await page.screenshot({ path: shot("studio-analytics.png") });
  });

  test("5. Studio Comments lists the seeded comment", async ({ page }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await page.goto("/studio/comments");
    await expect(page.getByRole("heading", { name: "Comments" })).toBeVisible();
    await expect(page.getByText("Great tutorial!")).toBeVisible();
    await expect(page.getByText("carol")).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
    expect(errors).toEqual([]);
    await page.screenshot({ path: shot("studio-comments.png") });
  });

  test("6. Studio Settings is prefilled from the channel", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await page.goto("/studio/settings");
    await expect(
      page.getByRole("heading", { name: "Channel settings" }),
    ).toBeVisible();
    await expect(page.getByLabel("Channel name")).toHaveValue("E2E User");
    await expect(page.getByLabel("Description")).toHaveValue(
      "E2E test channel",
    );
    expect(errors).toEqual([]);
    await page.screenshot({ path: shot("studio-settings.png") });
  });

  test("7. Watch page: player controls, nested comment, playlist showcase", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await page.goto(`/watch/${SEEDED_VIDEO_ID}`);
    await expect(
      page.getByRole("heading", { name: SEEDED_VIDEO_TITLE }),
    ).toBeVisible();
    // "Play" needs exact:true — "Playback speed" also contains "Play".
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Seek slider")).toBeVisible();
    await expect(page.getByLabel("Volume")).toBeVisible();
    await expect(page.getByRole("button", { name: "Fullscreen" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Playback speed" }),
    ).toBeVisible();
    // Play toggle flips even though the seeded file does not exist.
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    // Nested comment + playlist showcase (seeded playlist owns the video).
    await expect(page.getByText("Great tutorial!")).toBeVisible();
    await expect(page.getByText("Playlist: My favourites")).toBeVisible();
    await expect(page.getByText("Up next")).toBeVisible();
    expect(errors).toEqual([]);
    await page.screenshot({ path: shot("watch.png") });
  });

  test("8. History lists the seeded watch with a per-item Remove", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await page.goto("/history");
    await expect(
      page.getByRole("heading", { name: "Watch history" }),
    ).toBeVisible();
    await expect(page.getByText(SEEDED_VIDEO_TITLE)).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: `Remove ${SEEDED_VIDEO_TITLE} from history`,
      }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    await page.screenshot({ path: shot("history.png") });
  });

  test("9. Library shows the Saved shelf and the seeded playlist", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Saved" })).toBeVisible();
    await expect(page.getByText(SEEDED_VIDEO_TITLE)).toBeVisible();
    await expect(page.getByText("My favourites")).toBeVisible();
    expect(errors).toEqual([]);
    await page.screenshot({ path: shot("library.png") });
  });

  test("10. Content title edit persists end to end", async ({ page }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await page.goto("/studio/content");
    await expect(page.getByText(SEEDED_VIDEO_TITLE)).toBeVisible();
    await page.getByRole("button", { name: "Edit title" }).click();
    const input = page.getByLabel("Video title");
    await input.fill("E2E Smoke Video (Edited)");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("E2E Smoke Video (Edited)"),
    ).toBeVisible();
    // The new title is what the Watch page serves now (GET /video/:id).
    await page.goto(`/watch/${SEEDED_VIDEO_ID}`);
    await expect(
      page.getByRole("heading", { name: "E2E Smoke Video (Edited)" }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
});
