// Auto-thumbnails + hover preview — Playwright e2e against the REAL
// API (in-memory MongoDB, PHASE5_SEED=1, playwright.phase5.config.ts)
// with NO Cloudinary credentials, so the local fallback path is
// exercised for real: ffmpeg generates the three auto frames under
// /uploads/, and the wizard's thumbnail file part is stored there.
//
// Run (from apps/web): the phase5 script builds first, then
//   TMPDIR=$HOME/workspace/.tmp-mongo npx playwright test \
//     -c playwright.phase5.config.ts e2e-phase5/auto-thumbnails-hover.spec.ts
// (TMPDIR redirect: /tmp is a 512 MB tmpfs and mongod needs the room.)
// No real credentials anywhere: the mp4/png fixtures are generated
// with ffmpeg, and the JWT secret below is the same test-only dummy
// the upload-wizard spec uses (it matches apps/api/e2e-server.mjs).
import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FAKE_USER_ID = "507f1f77bcf86cd799439012";
const E2E_JWT_SECRET = "e2e-test-secret-not-a-real-secret";
const API_BASE = "http://localhost:5000";
const SCREENSHOTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../docs/screenshots",
);

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

const FIXTURE_DIR = path.join(tmpdir(), "acube-auto-thumbnails-e2e");
const MP4_PATH = path.join(FIXTURE_DIR, "demo.mp4");
const PNG_PATH = path.join(FIXTURE_DIR, "thumb.png");

test.beforeAll(() => {
  // A real, playable 3-second mp4 (320x180) — long enough for the
  // wizard's client-side frame extraction (5%/50%/90%) and the
  // server's ffmpeg frames to sample distinct frames.
  mkdirSync(FIXTURE_DIR, { recursive: true });
  execFileSync("ffmpeg", [
    "-f",
    "lavfi",
    "-i",
    "testsrc=duration=3:size=320x180:rate=30",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-y",
    MP4_PATH,
  ]);
  execFileSync("ffmpeg", [
    "-f",
    "lavfi",
    "-i",
    "color=c=red:size=320x180",
    "-frames:v",
    "1",
    "-y",
    PNG_PATH,
  ]);
});

test.afterAll(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

test.use({ viewport: { width: 1280, height: 850 } });

async function uploadVideo(
  page: Page,
  opts: { title: string; thumbnailFile?: string; thumbnailUrl?: string },
): Promise<string> {
  await seedFakeSession(page);
  await page.goto("/studio/upload", { waitUntil: "networkidle" });
  await expect(page.getByRole("dialog", { name: "Upload videos" })).toBeVisible();
  await page.getByLabel("Choose video file").setInputFiles(MP4_PATH);
  await expect(page.getByLabel("Preview of demo.mp4")).toBeVisible();
  await page.getByRole("button", { name: "Continue to details" }).click();
  await expect(page.getByText(/Step 2 of 3/)).toBeVisible();
  await page.getByLabel("Title").fill(opts.title);
  if (opts.thumbnailFile) {
    await page
      .getByLabel("Upload thumbnail image")
      .setInputFiles(opts.thumbnailFile);
    await expect(
      page.getByAltText("Preview of the chosen thumbnail image"),
    ).toBeVisible();
  }
  if (opts.thumbnailUrl) {
    await page.getByLabel("Thumbnail URL").fill(opts.thumbnailUrl);
  }
  await page.getByRole("button", { name: "Continue to review" }).click();
  await expect(page.getByText(/Step 3 of 3/)).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Your video was uploaded.")).toBeVisible();
  const watchHref = await page
    .getByRole("link", { name: "Watch video" })
    .getAttribute("href");
  expect(watchHref).toMatch(/^\/watch\/[0-9a-f]{24}$/);
  return watchHref!.split("/").pop()!;
}

async function fetchVideo(videoId: string) {
  const res = await fetch(`${API_BASE}/video/${videoId}`);
  expect(res.status).toBe(200);
  return res.json() as Promise<{
    filepath: string;
    videotitle: string;
    thumbnailUrl: string | null;
    autoThumbnails: string[] | null;
  }>;
}

test.describe("Auto-thumbnails + hover preview", () => {
  test("wizard Step 2 shows the frame picker; publish stores 3 auto frames", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    await seedFakeSession(page);
    await page.goto("/studio/upload", { waitUntil: "networkidle" });
    await page.getByLabel("Choose video file").setInputFiles(MP4_PATH);
    await expect(page.getByLabel("Preview of demo.mp4")).toBeVisible();
    await page.getByRole("button", { name: "Continue to details" }).click();
    await expect(page.getByText(/Step 2 of 3/)).toBeVisible();
    await page.getByLabel("Title").fill("E2E Auto Thumbnail");
    // The client-side picker extracted 3 real frames from the file.
    await expect(
      page.getByRole("button", { name: "Use auto-generated frame 1" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Use auto-generated frame 2" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Use auto-generated frame 3" }),
    ).toBeVisible();
    await expect(page.getByText("Suggested")).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "phase5-upload-thumbnail-step2.png"),
    });
    await page.getByRole("button", { name: "Continue to review" }).click();
    await expect(page.getByText("Auto-generated by the server")).toBeVisible();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Your video was uploaded.")).toBeVisible();
    const watchHref = await page
      .getByRole("link", { name: "Watch video" })
      .getAttribute("href");
    const videoId = watchHref!.split("/").pop()!;

    // The server generated 3 frames (local ffmpeg fallback) and chose
    // the middle one as the thumbnail.
    const video = await fetchVideo(videoId);
    expect(video.thumbnailUrl).toMatch(/^\/uploads\/[^/]+\.jpg$/);
    expect(video.autoThumbnails).toHaveLength(3);
    for (const candidate of video.autoThumbnails ?? []) {
      expect(candidate).toMatch(/^\/uploads\/[^/]+\.jpg$/);
      const thumbRes = await fetch(`${API_BASE}${candidate}`);
      expect(thumbRes.status).toBe(200);
      expect(thumbRes.headers.get("content-type")).toMatch(/image\/jpeg/);
    }

    // Home shows the real thumbnail (an <img> that actually loads),
    // not the gradient fallback.
    await page.goto("/", { waitUntil: "networkidle" });
    const card = page.locator(".home-video-card", {
      hasText: "E2E Auto Thumbnail",
    });
    await expect(card).toBeVisible();
    const img = card.locator("img").first();
    await expect(img).toBeVisible();
    expect(await img.getAttribute("src")).toContain("/uploads/");
    expect(
      await img.evaluate((el: HTMLImageElement) => el.naturalWidth),
    ).toBeGreaterThan(0);
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "phase5-home-thumbnail-grid.png"),
    });
    expect(errors).toEqual([]);
  });

  test("a custom thumbnail file replaces the auto-generated one", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    const videoId = await uploadVideo(page, {
      title: "E2E Custom Thumbnail",
      thumbnailFile: PNG_PATH,
    });
    const video = await fetchVideo(videoId);
    expect(video.thumbnailUrl).toMatch(/^\/uploads\/[^/]+\.png$/);
    const thumbRes = await fetch(`${API_BASE}${video.thumbnailUrl!}`);
    expect(thumbRes.status).toBe(200);
    expect(thumbRes.headers.get("content-type")).toMatch(/image\/png/);
    // The stored thumbnail is the uploaded file, not one of the auto
    // frames (those are .jpg).
    for (const candidate of video.autoThumbnails ?? []) {
      expect(candidate).not.toBe(video.thumbnailUrl);
    }
    expect(errors).toEqual([]);
  });

  test("a pasted thumbnail URL still works", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    // A URL the server can validate: the thumbnail this run stored
    // for the custom-file video above is a real reachable image on
    // the API origin — reuse it instead of depending on the public
    // internet.
    const customId = await uploadVideo(page, {
      title: "E2E Custom Thumbnail Source",
      thumbnailFile: PNG_PATH,
    });
    const custom = await fetchVideo(customId);
    const reachableUrl = `${API_BASE}${custom.thumbnailUrl}`;
    const videoId = await uploadVideo(page, {
      title: "E2E Pasted Thumbnail URL",
      thumbnailUrl: reachableUrl,
    });
    const video = await fetchVideo(videoId);
    expect(video.thumbnailUrl).toBe(reachableUrl);
    expect(errors).toEqual([]);
  });

  test("hovering a Home card ~1s plays a real preview; leaving stops it", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    await uploadVideo(page, { title: "E2E Hover Preview" });
    await page.goto("/", { waitUntil: "networkidle" });
    const card = page.locator(".home-video-card", {
      hasText: "E2E Hover Preview",
    });
    await expect(card).toBeVisible();
    const preview = card.locator("video[aria-label='Preview of E2E Hover Preview']");
    await expect(preview).toHaveCount(0);
    await card.hover();
    // Past the 900 ms dwell the preview mounts and plays (muted).
    await expect(preview).toBeVisible({ timeout: 5000 });
    await expect
      .poll(
        async () =>
          preview.evaluate((v: HTMLVideoElement) => ({
            playing: !v.paused && v.readyState >= 3,
          })),
        { timeout: 10000 },
      )
      .toMatchObject({ playing: true });
    const firstTime = await preview.evaluate(
      (v: HTMLVideoElement) => v.currentTime,
    );
    await page.waitForTimeout(700);
    const laterTime = await preview.evaluate(
      (v: HTMLVideoElement) => v.currentTime,
    );
    expect(laterTime).toBeGreaterThan(firstTime);
    await page.screenshot({
      path: path.join(
        SCREENSHOTS_DIR,
        "phase5-home-hover-preview-playing.png",
      ),
    });
    // Leaving restores the thumbnail.
    await page.mouse.move(0, 0);
    await expect(preview).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
