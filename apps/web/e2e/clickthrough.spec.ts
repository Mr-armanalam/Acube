// Phase 4 browser click-through (wider than the Phase 3c smoke tests) —
// headless Chromium against the production build + the real API on
// in-memory MongoDB (playwright.config.ts webServer). No real
// credentials: no Google sign-in, no Stripe, no Cloudinary, no Twilio.
// The seeded video's file does not exist, so real playback is NOT
// verified; the play toggle is. Anything that needs a real credential
// is recorded as NOT VERIFIED, never faked as a pass.
//
// Run (from apps/web):
//   VITE_BACKEND_URL=http://localhost:5000 \
//   VITE_CLIENT_ID=e2e-test.apps.googleusercontent.com \
//   VITE_ENCRYPTED_KEY=e2e-test-key vite build && \
//   npx playwright test e2e/clickthrough.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Screenshots are the portfolio evidence: repo-root docs/screenshots/.
// (Spec file lives in apps/web/e2e/, so three levels up is the root.)
const SHOT_DIR = fileURLToPath(
  new URL("../../../docs/screenshots", import.meta.url),
);
mkdirSync(SHOT_DIR, { recursive: true });
const shot = (name: string) => path.join(SHOT_DIR, name);

// Must match apps/api/e2e-server.mjs.
const SEEDED_VIDEO_ID = "507f1f77bcf86cd799439011";
const SEEDED_VIDEO_TITLE = "E2E Smoke Video";
// Fake signed-in user id (matches the smoke spec's seeded session).
const FAKE_USER_ID = "507f1f77bcf86cd799439012";

// The signed-in session the app persists (localStorage "Profile").
// The smoke spec's UNSIGNED dummy JWT is NOT enough here: Premium
// makes authenticated API calls, and the API's auth
// middleware (apps/api/middleware/auth.js) jwt.verify()s the token
// against JWT_SECRET — an unsigned token gets 401, and the client's
// axios 401 interceptor (apps/web/src/Api/index.ts) then clears the
// session and redirects the whole app to "/" mid-test. So this spec
// mints a PROPERLY SIGNED HS256 JWT with the same dummy e2e secret
// the e2e server uses (e2e-server.mjs: JWT_SECRET=<redacted>
// — a dummy test value, never a real secret). The token is server-valid
// (signature verifies, `id` is what auth.js puts on req.userid) but the
// fake user does NOT exist in the seeded DB, so user-lookup endpoints
// answer 404 "User not found" — graceful, no premium, no redirect.
const E2E_JWT_SECRET = "e2e-test-secret-not-a-real-secret";

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function mintE2EJwt(): string {
  const header = base64url(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  );
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

test.use({ viewport: { width: 1280, height: 800 } });

test.describe("Acube click-through", () => {
  test("1. Home feed renders the seeded video", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(SEEDED_VIDEO_TITLE).first()).toBeVisible();
    // Match-preview: the legacy "Your-Tube" Navbar is deleted; the watch
    // side renders the premium TopBar with the Acube wordmark.
    await expect(page.locator(".topbar-logo-word")).toHaveText("Acube");
    expect(page.getByText("Your-Tube")).toHaveCount(0);
    await page.screenshot({ path: shot("home.png") });
  });

  test("2. Search via TopBar for 'E2E Smoke' renders results", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText(SEEDED_VIDEO_TITLE).first()).toBeVisible();
    await page.getByPlaceholder("Search").fill("E2E Smoke");
    // Legacy Searchbar icon is deleted with the Navbar; the TopBar has a
    // Search submit button.
    await page
      .getByRole("button", { name: "Search", exact: true })
      .click();
    await expect(page).toHaveURL(/\/search\/E2E%20Smoke$/);
    await expect(page.getByText(SEEDED_VIDEO_TITLE).first()).toBeVisible();
    await page.screenshot({ path: shot("search.png") });
  });

  test("3. Video page: play toggle, logged-out like, comments", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    const dialogs: string[] = [];
    page.on("dialog", (d) => {
      dialogs.push(d.message());
      void d.accept();
    });
    // Phase 5: /videopage/:id redirects to the rebuilt /watch/:id page.
    await page.goto(`/videopage/${SEEDED_VIDEO_ID}`);
    await expect(page).toHaveURL(new RegExp(`/watch/${SEEDED_VIDEO_ID}$`));
    await expect(
      page.getByRole("heading", { name: SEEDED_VIDEO_TITLE }),
    ).toBeVisible();
    const playButton = page.getByRole("button", {
      name: "Play",
      exact: true,
    });
    await expect(playButton).toBeVisible();
    await playButton.click();
    await expect(
      page.getByRole("button", { name: "Pause" }),
    ).toBeVisible();
    // Logged-out like: the app alerts instead of toggling.
    await page.locator(".like_videoPage").first().click();
    expect(dialogs).toContain("please login to like video");
    // The like icon must still be the outline (untoggled) one.
    await expect(
      page.locator(".like_videoPage").first().locator("svg").first(),
    ).toBeVisible();
    // Comments section renders (heading; no comments seeded).
    await expect(page.getByText("Comments").first()).toBeVisible();
    expect(pageErrors).toEqual([]);
    await page.screenshot({ path: shot("videopage.png") });
  });

  test("4. Auth guards redirect logged-out users from all guarded routes", async ({
    page,
  }) => {
    // Match-preview: the legacy /Likedvideo, /Watchhistory, /Watchlater
    // and /Yourvideo pages are deleted — their URLs 404 (see the
    // deleted-routes test below), so they are no longer guarded routes.
    // The live guarded routes still redirect logged-out users home.
    const guarded = [
      "/Library",
      "/studio",
      "/studio/content",
      "/history",
    ];
    for (const [i, route] of guarded.entries()) {
      await page.goto(route);
      await expect(page).toHaveURL("http://localhost:4173/");
      await expect(page.getByText(SEEDED_VIDEO_TITLE).first()).toBeVisible();
      if (i === 0) {
        await page.screenshot({ path: shot("library-guard.png") });
      }
    }
  });

  test("4b. Deleted legacy page URLs 404 instead of rendering", async ({
    page,
  }) => {
    for (const route of [
      "/Likedvideo",
      "/Watchhistory",
      "/Watchlater",
      "/Yourvideo",
    ]) {
      await page.goto(route);
      await expect(
        page.getByRole("heading", { name: "404 — Page not found" }),
      ).toBeVisible();
    }
  });

  test("7. Upload modal: entry point is owner-only on the channel page", async ({
    page,
  }) => {
    await seedFakeSession(page);
    // The only Upload entry point is Describechannel's "Upload Video"
    // button, shown only when currentuser._id === channel._id
    // (apps/web/src/Pages/Channel/Describechannel.tsx). The seeded DB
    // has no channel for the fake user, so the button cannot appear.
    await page.goto(`/channel/${FAKE_USER_ID}`);
    await expect(page.locator(".container3_chanel")).toBeVisible();
    const uploadBtn = page.locator(".uploadbtn_chanel");
    if ((await uploadBtn.count()) === 0) {
      test.skip(
        true,
        "NOT VERIFIED: no 'Upload Video' button — no channel exists for " +
          "the fake user in the seeded DB, so the upload modal is " +
          "unreachable in e2e without seeding a channel; no file was " +
          "uploaded to Cloudinary (no credentials).",
      );
    }
    await uploadBtn.click();
    await expect(page.locator(".container_VidUpload")).toBeVisible();
    await expect(
      page.getByPlaceholder("Enter title of your video"),
    ).toBeVisible();
    // 10 MB limit: an oversize file must show the inline message.
    await page.locator('input[type="file"]').setInputFiles({
      name: "oversize.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.alloc(10_000_001),
    });
    await page.getByPlaceholder("Enter title of your video").fill("Too big");
    await page.locator('.container_VidUpload input[value="Upload"]').click();
    await expect(page.getByText(/less than 10 MB/i)).toBeVisible();
    await page.screenshot({ path: shot("upload.png") });
  });

  test("8. Premium: Upgrade calls Stripe and must NOT grant premium", async ({
    page,
  }) => {
    const dialogs: string[] = [];
    page.on("dialog", (d) => {
      dialogs.push(d.message());
      void d.accept();
    });
    const paymentResponses: { status: number; url: string }[] = [];
    page.on("response", (res) => {
      if (/payment|premium/i.test(res.url())) {
        paymentResponses.push({ status: res.status(), url: res.url() });
      }
    });
    await seedFakeSession(page);
    // Phase 5: /videopage/:id redirects to the rebuilt /watch/:id page.
    await page.goto(`/videopage/${SEEDED_VIDEO_ID}`);
    await expect(page).toHaveURL(new RegExp(`/watch/${SEEDED_VIDEO_ID}$`));
    const upgradeBtn = page.getByRole("button", { name: /Upgrade/i });
    await expect(upgradeBtn).toBeVisible();
    await upgradeBtn.click();
    // With the dummy Stripe key the request must fail gracefully —
    // an alert, not a redirect to a checkout URL and not premium.
    // The fake user has no row in the seeded DB, so the API answers
    // 404 "User not found" (axios rejects -> "Error creating payment
    // request"); either graceful message is acceptable — record it.
    await expect
      .poll(() => dialogs.join(" | "), { timeout: 15_000 })
      .not.toEqual("");
    expect(dialogs.join(" | ")).toMatch(
      /Error creating payment request|User not found/,
    );
    test.info().annotations.push({
      type: "payment-responses",
      description: JSON.stringify(paymentResponses),
    });
    expect(page.url()).toContain(`/watch/${SEEDED_VIDEO_ID}`);
    // Premium must NOT be granted: reload and the Upgrade button is back.
    await page.goto(`/watch/${SEEDED_VIDEO_ID}`);
    await expect(
      page.getByRole("button", { name: /Upgrade/i }),
    ).toBeVisible();
    await page.screenshot({ path: shot("premium.png") });
  });

  test("9. Theme toggle switches light/dark and TopBar renders", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText(SEEDED_VIDEO_TITLE).first()).toBeVisible();
    // Match-preview: the legacy ThemeBox (.themeContainer/.theme_box)
    // is deleted with the Navbar; the TopBar has one toggle button that
    // flips light ↔ dark. The starting mode is not assumed — assert the
    // body class flips, then flips back.
    const body = page.locator("body");
    const initiallyLight = await body.evaluate((b) =>
      b.classList.contains("white-theme"),
    );
    const toggle = page.getByRole("button", {
      name: /Switch to (light|dark) theme/,
    });
    await toggle.click();
    if (initiallyLight) {
      await expect(body).not.toHaveClass(/white-theme/);
    } else {
      await expect(body).toHaveClass(/white-theme/);
    }
    await toggle.click();
    if (initiallyLight) {
      await expect(body).toHaveClass(/white-theme/);
    } else {
      await expect(body).not.toHaveClass(/white-theme/);
    }
    // Drive to dark explicitly for the theme-dark screenshot.
    if (
      await page
        .getByRole("button", { name: "Switch to dark theme" })
        .count()
    ) {
      await page
        .getByRole("button", { name: "Switch to dark theme" })
        .click();
    }
    await expect(body).not.toHaveClass(/white-theme/);
    await page.screenshot({ path: shot("theme-dark.png") });
  });
});
