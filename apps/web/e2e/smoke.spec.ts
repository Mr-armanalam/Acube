// Playwright smoke tests (Phase 3c) — headless Chromium against the
// production build + the real API on in-memory MongoDB (see
// playwright.config.ts). No real credentials: there is no Google
// sign-in, no Stripe, no Cloudinary, and the seeded video's file does
// not exist, so actual video playback with sound is NOT verified here
// (the play button is clicked and its toggle is asserted; the media
// itself cannot load — see the note in the video-page test).
import { test, expect } from "@playwright/test";
import CryptoJS from "crypto-js";

// Must match apps/api/e2e-server.mjs (duplicated here because importing
// that module would boot the server a second time).
const SEEDED_VIDEO_ID = "507f1f77bcf86cd799439011";
const SEEDED_VIDEO_TITLE = "E2E Smoke Video";

// Must match the VITE_ENCRYPTED_KEY the `test:e2e` script builds with.
const E2E_ENCRYPTION_KEY = "e2e-test-key";

// Replicates src/utils/toEncrypt.js encryptData2 (AES + base64url).
function encryptData2(data: unknown): string {
  const encrypted = CryptoJS.AES.encrypt(
    JSON.stringify(data),
    E2E_ENCRYPTION_KEY,
  ).toString();
  return encrypted
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

test.describe("Acube smoke", () => {
  test("Home feed renders the seeded video", async ({ page }) => {
    const peerChunkRequested: string[] = [];
    page.on("response", (res) => {
      if (/peer-polyfills/.test(res.url())) {
        peerChunkRequested.push(res.url());
      }
    });
    await page.goto("/");
    await expect(page.getByText(SEEDED_VIDEO_TITLE).first()).toBeVisible();
    // Bundle split: the simple-peer + Node-polyfill chunk must NOT load
    // on Home — it belongs to the lazy StreamRoom route only.
    expect(peerChunkRequested).toEqual([]);
  });

  test("search navigation via the navbar search box", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(SEEDED_VIDEO_TITLE).first()).toBeVisible();
    await page.getByPlaceholder("Search").fill("E2E Smoke");
    await page.locator(".searchIcon_SearchBar").click();
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

  test("StreamRoom loads the peer-polyfills chunk on demand when signed in", async ({
    page,
  }) => {
    // No real Google sign-in in e2e: seed a session the way the app
    // persists one (localStorage "Profile"), so RequireAuth lets the
    // route render. The token is fake but STRUCTURALLY a JWT: the
    // Navbar decodes it with jwt-decode (no signature check), and a
    // bare string throws InvalidTokenError and blanks the app. No API
    // call in this flow needs the token to succeed; what is asserted
    // is the lazy chunk load.
    await page.addInitScript(() => {
      localStorage.setItem(
        "Profile",
        JSON.stringify({
          result: {
            _id: "507f1f77bcf86cd799439012",
            name: "E2E User",
            username: "e2euser",
            email: "e2e@example.com",
          },
          // Header {"alg":"HS256","typ":"JWT"} + payload
          // {"sub":"e2e","name":"E2E User","exp":9999999999} +
          // a dummy signature. Unsigned/unverified — test-only.
          token:
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMmUiLCJuYW1lIjoiRTJFIHVzZXIiLCJleHAiOjk5OTk5OTk5OTl9.e2e-fake-signature",
        }),
      );
    });
    const peerChunk = page.waitForResponse((res) =>
      /\/assets\/peer-polyfills-.*\.js/.test(res.url()),
    );
    const roomId = encryptData2("e2e-room");
    await page.goto(`/video-stream/${roomId}`);
    await peerChunk;
    await expect(page.locator(".video_stream_container")).toBeVisible();
  });
});
