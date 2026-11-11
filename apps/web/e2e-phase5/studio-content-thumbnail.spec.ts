// Studio Content edit-modal thumbnail upload — Playwright e2e (Phase 5
// config: production build on :4173 + real API on :5000 with
// PHASE5_SEED=1).
//
// Contract (backend commits 6563723 + 7b4dc05): PATCH /video/:id accepts
// multipart with the file part `thumbnail` (JPG/PNG, 5 MB); a chosen
// file wins over a pasted thumbnailUrl; without a file the request
// stays JSON. The local fallback stores under /uploads/ and the row
// resolves it against the API base, so the new thumbnail renders in
// the table after the page-query refetch.
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SHOT_DIR = fileURLToPath(
  new URL("../../../docs/screenshots", import.meta.url),
);
mkdirSync(SHOT_DIR, { recursive: true });
const shot = (name: string) => path.join(SHOT_DIR, name);

const API = "http://localhost:5000";
const DEMO_USER_ID = "507f1f77bcf86cd799430001";
const FIXTURE_PNG = fileURLToPath(
  new URL("./fixtures/test-thumbnail.png", import.meta.url),
);
const VIDEO_TITLE = "CSS Grid in 10 Minutes";

function e2eJwtSecret(): string {
  const src = readFileSync(
    fileURLToPath(new URL("../../api/e2e-server.mjs", import.meta.url)),
    "utf8",
  );
  const m = src.match(/JWT_SECRET\s*=\s*"([^"]+)"/);
  if (!m) throw new Error("JWT secret not found in e2e-server.mjs");
  return m[1];
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function mintDemoJwt(): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      id: DEMO_USER_ID,
      sub: "demo",
      name: "Code Streamer",
      exp: 9999999999,
    }),
  );
  const signature = base64url(
    createHmac("sha256", e2eJwtSecret())
      .update(`${header}.${payload}`)
      .digest(),
  );
  return `${header}.${payload}.${signature}`;
}

async function seedDemoSession(page: Page) {
  const token = mintDemoJwt();
  await page.addInitScript((t: string) => {
    localStorage.setItem(
      "Profile",
      JSON.stringify({
        result: {
          _id: "507f1f77bcf86cd799430001",
          name: "Code Streamer",
          username: "codestreamer",
          email: "demo-channel-codestreamer@demo.acube.test",
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

async function openEditModal(page: Page) {
  await page.goto("/studio/content");
  await expect(page.getByRole("heading", { name: "Channel content" })).toBeVisible();
  await expect(page.getByText(VIDEO_TITLE)).toBeVisible();
  await page.getByRole("button", { name: `Row actions for ${VIDEO_TITLE}` }).click();
  await page.getByRole("menuitem", { name: "Edit details" }).click();
  const dialog = page.getByRole("dialog", { name: `Edit details for ${VIDEO_TITLE}` });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function studioVideoThumb(request: APIRequestContext, title: string) {
  const res = await request.get(`${API}/studio/videos?page=1&limit=10`, {
    headers: { Authorization: `Bearer ${mintDemoJwt()}` },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const video = body.items.find((v: { videotitle: string }) => v.videotitle === title);
  if (!video) throw new Error(`seed video not found: ${title}`);
  return (video.thumbnailUrl ?? video.thumbnail ?? null) as string | null;
}

test.describe("Studio Content thumbnail upload e2e", () => {
  test.use({ viewport: { width: 1280, height: 850 } });

  test("1. Modal keeps the URL input and adds a file picker with live preview", async ({ page }) => {
    const errors = collectPageErrors(page);
    await seedDemoSession(page);
    const dialog = await openEditModal(page);
    await expect(dialog.getByLabel("Thumbnail URL")).toBeVisible();
    // The file input itself is display:none by design — the visible
    // control is its "Choose file" label; assert the input is attached.
    await expect(dialog.getByLabel("Upload thumbnail image")).toBeAttached();
    await expect(dialog.getByText("Choose file")).toBeVisible();
    await expect(dialog.getByText("JPG or PNG, 5 MB or smaller. A chosen file replaces the URL above.")).toBeVisible();
    await dialog.getByLabel("Upload thumbnail image").setInputFiles(FIXTURE_PNG);
    await expect(dialog.getByText("Using test-thumbnail.png — the URL above is ignored.")).toBeVisible();
    const preview = dialog.locator("img").first();
    await expect(preview).toBeVisible();
    expect(await preview.getAttribute("src")).toMatch(/^blob:/);
    await page.screenshot({ path: shot("phase5-content-thumbnail-modal-desktop.png") });
    await dialog.getByRole("button", { name: "Remove" }).click();
    await expect(dialog.getByText(/the URL above is ignored/)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("2. Uploading a local thumbnail saves and the row shows it", async ({ page, request }) => {
    const errors = collectPageErrors(page);
    const before = await studioVideoThumb(request, VIDEO_TITLE);
    expect(before).toMatch(/^https:\/\/example\.com\//);
    await seedDemoSession(page);
    const dialog = await openEditModal(page);
    const row = page.locator("table tbody tr", { hasText: VIDEO_TITLE }).first();
    // Before the save the seeded example.com thumbnail is broken in
    // this sandbox, so the row shows the ▶ placeholder, not an <img>.
    await expect(row.locator("img")).toHaveCount(0);
    await dialog.getByLabel("Upload thumbnail image").setInputFiles(FIXTURE_PNG);
    await expect(dialog.getByText("Using test-thumbnail.png — the URL above is ignored.")).toBeVisible();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    const after = await studioVideoThumb(request, VIDEO_TITLE);
    expect(after).toMatch(/^\/uploads\//);
    // The row refetches without a reload and renders the new thumbnail
    // (API-relative /uploads/ resolved against the API base).
    const img = row.locator("img");
    await expect(img).toHaveCount(1);
    expect(await img.getAttribute("src")).toContain("/uploads/");
    expect(errors).toEqual([]);
  });

  test("3. Modal upload UI fits a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = collectPageErrors(page);
    await seedDemoSession(page);
    const dialog = await openEditModal(page);
    await dialog.getByLabel("Upload thumbnail image").setInputFiles(FIXTURE_PNG);
    await expect(dialog.getByText("Using test-thumbnail.png — the URL above is ignored.")).toBeVisible();
    await page.screenshot({ path: shot("phase5-content-thumbnail-modal-mobile.png") });
    expect(errors).toEqual([]);
  });
});
