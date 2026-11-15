// Playwright smoke tests (Phase 3c) — headless Chromium against the
// production build + the real API on in-memory MongoDB (see
// playwright.config.ts). No real credentials: there is no Google
// sign-in, no Stripe, no Cloudinary, and the seeded video's file does
// not exist, so actual video playback with sound is NOT verified here
// (the play button is clicked and its toggle is asserted; the media
// itself cannot load — see the note in the video-page test).
import { test, expect } from "@playwright/test";

// Must match apps/api/e2e-server.mjs (duplicated here because importing
// that module would boot the server a second time).
const SEEDED_VIDEO_ID = "507f1f77bcf86cd799439011";
const SEEDED_VIDEO_TITLE = "E2E Smoke Video";

test.describe("Acube smoke", () => {
  test("Home feed renders the seeded video", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(SEEDED_VIDEO_TITLE).first()).toBeVisible();
  });

  test("search navigation via the TopBar search box", async ({ page }) => {
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
  });

  test("video page renders playback controls and play toggles", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    // Phase 5: /videopage/:id redirects to the rebuilt /watch/:id page.
    await page.goto(`/videopage/${SEEDED_VIDEO_ID}`);
    await expect(page).toHaveURL(new RegExp(`/watch/${SEEDED_VIDEO_ID}$`));
    await expect(
      page.getByRole("heading", { name: SEEDED_VIDEO_TITLE }),
    ).toBeVisible();
    const video = page.locator(".watch-page video");
    await expect(video).toHaveCount(1);
    const playButton = page.getByRole("button", {
      name: "Play",
      exact: true,
    });
    await expect(playButton).toBeVisible();
    // The seeded filepath (/videos/e2e-smoke.mp4) does not exist, so the
    // media cannot actually play — what is asserted is that the play
    // attempt toggles the player to the playing state without throwing.
    // A rejected play() promise must not surface as an unhandled error.
    await playButton.click();
    await expect(
      page.getByRole("button", { name: "Pause" }),
    ).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("auth guard redirects a logged-out user from /Library to Home", async ({
    page,
  }) => {
    await page.goto("/Library");
    await expect(page).toHaveURL("http://localhost:4173/");
    await expect(page.getByText(SEEDED_VIDEO_TITLE).first()).toBeVisible();
  });

  test("search route loads its lazy chunk on demand", async ({ page }) => {
    const searchChunk = page.waitForResponse((res) =>
      /\/assets\/Search-.*\.js/.test(res.url()),
    );
    await page.goto("/search/E2E");
    await searchChunk;
    await expect(page.getByText(SEEDED_VIDEO_TITLE).first()).toBeVisible();
  });

});
