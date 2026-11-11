// Upload-wizard fix — Playwright e2e against the REAL API (in-memory
// MongoDB, PHASE5_SEED=1, playwright.phase5.config.ts) with NO
// Cloudinary credentials configured, so the publish step exercises the
// API's local-storage fallback for real: the video must appear in
// Content with its details saved, and its /uploads file must serve.
//
// Run (from apps/web): the phase5 script builds first, then
//   TMPDIR=$HOME/workspace/.tmp-mongo npx playwright test \
//     -c playwright.phase5.config.ts e2e-phase5/upload-wizard.spec.ts
// (TMPDIR redirect: /tmp is a 512 MB tmpfs and mongod needs the room.)
// No real credentials anywhere: the mp4 is generated with ffmpeg.
import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Must match apps/api/e2e-server.mjs (PHASE5_SEED=1) — the value
// there is the e2e JWT secret (verified byte-for-byte with od;
// displayed tool output redacts secret values, so do not copy the
// secret from a rendered log — read the file).
const FAKE_USER_ID = "507f1f77bcf86cd799439012";
const E2E_JWT_SECRET = "e2e-test-secret-not-a-real-secret";
const API_BASE = "http://localhost:5000";

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

const FIXTURE_DIR = path.join(tmpdir(), "acube-upload-wizard-e2e");
const MP4_PATH = path.join(FIXTURE_DIR, "demo.mp4");

test.beforeAll(() => {
  // A real, playable 1-second mp4 (320x180, ~tens of KB) so the
  // wizard's <video> preview has a genuine first frame.
  mkdirSync(FIXTURE_DIR, { recursive: true });
  execFileSync("ffmpeg", [
    "-f",
    "lavfi",
    "-i",
    "testsrc=duration=1:size=320x180:rate=30",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-y",
    MP4_PATH,
  ]);
});

test.afterAll(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

test.use({ viewport: { width: 1280, height: 800 } });

test.describe("Upload wizard — full flow without Cloudinary", () => {
  test("Step 1 modal → Step 2 details → Step 3 review → Publish, video in Content", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    await seedFakeSession(page);
    await page.goto("/studio/upload", { waitUntil: "networkidle" });

    // Step 1 — the modal from reference image-16.
    await expect(
      page.getByRole("dialog", { name: "Upload videos" }),
    ).toBeVisible();
    await expect(
      page.getByText("Drag and drop video files to upload"),
    ).toBeVisible();
    await page.getByLabel("Choose video file").setInputFiles(MP4_PATH);
    const preview = page.getByLabel("Preview of demo.mp4");
    await expect(preview).toBeVisible();
    expect(await preview.getAttribute("src")).toMatch(/^blob:/);
    await page.getByRole("button", { name: "Continue to details" }).click();

    // Step 2 — details.
    await expect(page.getByText(/Step 2 of 3/)).toBeVisible();
    await page.getByLabel("Title").fill("E2E Upload Wizard");
    await page.getByLabel("Description").fill("Published by the e2e spec");
    await page.getByLabel("Tags").fill("e2e, wizard");
    // The thumbnail area shows a frame of the picked video.
    await expect(page.getByLabel("Preview of the picked video")).toBeVisible();
    await page.getByRole("button", { name: "Continue to review" }).click();

    // Step 3 — review shows the entered details + the video preview.
    await expect(page.getByText(/Step 3 of 3/)).toBeVisible();
    await expect(page.getByText("E2E Upload Wizard")).toBeVisible();
    await expect(page.getByText("Published by the e2e spec")).toBeVisible();
    await expect(page.getByText("e2e, wizard")).toBeVisible();
    await expect(page.getByLabel("Preview of demo.mp4")).toBeVisible();

    // Publish — no Cloudinary in this environment, so the API's local
    // fallback must carry it (the old code 400'd here).
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Your video was uploaded.")).toBeVisible();
    const watchHref = await page
      .getByRole("link", { name: "Watch video" })
      .getAttribute("href");
    expect(watchHref).toMatch(/^\/watch\/[0-9a-f]{24}$/);
    const videoId = watchHref!.split("/").pop()!;

    // The stored video has the local filepath and the saved details.
    const videoRes = await page.request.get(`${API_BASE}/video/${videoId}`);
    expect(videoRes.status()).toBe(200);
    const video = await videoRes.json();
    expect(String(video.filepath)).toMatch(/^\/uploads\/[^/]+\.mp4$/);
    expect(video.videotitle).toBe("E2E Upload Wizard");
    expect(video.description).toBe("Published by the e2e spec");
    expect(video.tags).toEqual(["e2e", "wizard"]);
    expect(video.visibility).toBe("public");
    expect(video.videochanel).toBe(FAKE_USER_ID);
    // The local file is really served.
    const fileRes = await page.request.get(`${API_BASE}${video.filepath}`);
    expect(fileRes.status()).toBe(200);
    expect(fileRes.headers()["content-type"]).toMatch(/video\/mp4/);

    // And it appears in Studio Content.
    await page.getByRole("link", { name: "View in Content" }).click();
    await expect(page.getByText("E2E Upload Wizard")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("drag-and-drop selects the file; a dropped non-mp4 is rejected inline", async ({
    page,
  }) => {
    await seedFakeSession(page);
    await page.goto("/studio/upload", { waitUntil: "networkidle" });
    const dropzone = page.getByTestId("upload-dropzone");
    await expect(dropzone).toBeVisible();

    // A real drop event carrying a File, built in-page.
    await page.evaluate(() => {
      const bytes = new Uint8Array(52_000);
      const file = new File([bytes], "dropped.mp4", { type: "video/mp4" });
      const dt = new DataTransfer();
      dt.items.add(file);
      const dropzone = document.querySelector(
        '[data-testid="upload-dropzone"]',
      )!;
      dropzone.dispatchEvent(
        new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }),
      );
    });
    await expect(page.getByLabel("Preview of dropped.mp4")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue to details" }),
    ).toBeEnabled();

    // Back to the empty modal, then drop a text file.
    await page.getByRole("button", { name: "Choose a different file" }).click();
    await page.evaluate(() => {
      const file = new File(["hello"], "notes.txt", { type: "text/plain" });
      const dt = new DataTransfer();
      dt.items.add(file);
      const dropzone = document.querySelector(
        '[data-testid="upload-dropzone"]',
      )!;
      dropzone.dispatchEvent(
        new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }),
      );
    });
    await expect(page.getByRole("alert")).toHaveText(
      "Only mp4 video files are supported",
    );
    await expect(page.getByLabel(/Preview of/)).toHaveCount(0);
  });

  test("X closes the modal and returns to Content", async ({ page }) => {
    await seedFakeSession(page);
    await page.goto("/studio/upload", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("dialog", { name: "Upload videos" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close upload" }).click();
    await expect(page).toHaveURL(/\/studio\/content$/);
    await expect(
      page.getByRole("dialog", { name: "Upload videos" }),
    ).toHaveCount(0);
  });
});
