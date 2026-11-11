// Upload wizard — Playwright e2e WITH Cloudinary credentials present.
//
// The API server (playwright.phase5-cloudinary.config.ts) runs with
// CLOUDINARY_* set to obviously-fake placeholder values and the
// `cloudinary` package redirected to a mock SDK (no real network call
// to Cloudinary ever happens). This is the production bug's scenario:
// credentials ARE in env, so the upload must take the Cloudinary path
// and succeed — the old import-time configuration 400'd here with
// "Must supply api_key". The spec asserts the stored video carries the
// mocked Cloudinary URL (not a local /uploads path) AND that the mock
// SDK was configured with exactly the env values. The unconfigured
// (local-fallback) path is covered by upload-wizard.spec.ts.
//
// Run (from apps/web): pnpm test:e2e:phase5:cloudinary
// (TMPDIR redirect: /tmp is a 512 MB tmpfs and mongod needs the room.)
// No real credentials anywhere: the mp4 is generated with ffmpeg.
import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Must match apps/api/e2e-server.mjs (PHASE5_SEED=1) and
// playwright.phase5-cloudinary.config.ts.
const FAKE_USER_ID = "507f1f77bcf86cd799439012";
const E2E_JWT_SECRET = "e2e-test-secret-not-a-real-secret";
const API_BASE = "http://localhost:5000";
const MOCK_OUT = path.join(tmpdir(), "acube-cloudinary-mock-out.json");
const EXPECTED_CLOUDINARY_URL =
  "https://res.cloudinary.com/test-cloud-name/video/upload/v1/e2e.mp4";

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

const FIXTURE_DIR = path.join(tmpdir(), "acube-upload-wizard-cloudinary-e2e");
const MP4_PATH = path.join(FIXTURE_DIR, "demo.mp4");

test.beforeAll(() => {
  if (existsSync(MOCK_OUT)) rmSync(MOCK_OUT);
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

test.describe("Upload wizard — full flow WITH Cloudinary configured", () => {
  test("Publish takes the Cloudinary path; the SDK was configured with the env values", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    await seedFakeSession(page);
    await page.goto("/studio/upload", { waitUntil: "networkidle" });

    await expect(
      page.getByRole("dialog", { name: "Upload videos" }),
    ).toBeVisible();
    await page.getByLabel("Choose video file").setInputFiles(MP4_PATH);
    await expect(page.getByLabel("Preview of demo.mp4")).toBeVisible();
    await page.getByRole("button", { name: "Continue to details" }).click();

    await expect(page.getByText(/Step 2 of 3/)).toBeVisible();
    await page.getByLabel("Title").fill("E2E Cloudinary Upload");
    await page.getByLabel("Description").fill("Published via the Cloudinary path");
    await page.getByRole("button", { name: "Continue to review" }).click();

    await expect(page.getByText(/Step 3 of 3/)).toBeVisible();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Your video was uploaded.")).toBeVisible();
    const watchHref = await page
      .getByRole("link", { name: "Watch video" })
      .getAttribute("href");
    expect(watchHref).toMatch(/^\/watch\/[0-9a-f]{24}$/);
    const videoId = watchHref!.split("/").pop()!;

    // The stored video carries the Cloudinary URL — not a local
    // /uploads path — with the duration the mock SDK returned.
    const videoRes = await page.request.get(`${API_BASE}/video/${videoId}`);
    expect(videoRes.status()).toBe(200);
    const video = await videoRes.json();
    expect(video.filepath).toBe(EXPECTED_CLOUDINARY_URL);
    expect(video.videotitle).toBe("E2E Cloudinary Upload");
    expect(video.description).toBe("Published via the Cloudinary path");
    expect(video.duration).toBe(12.5);
    expect(video.videochanel).toBe(FAKE_USER_ID);

    // The mock SDK's own record: it was configured at upload time
    // with exactly the env values, and its upload was called once.
    expect(existsSync(MOCK_OUT)).toBe(true);
    const mockRecord = JSON.parse(readFileSync(MOCK_OUT, "utf8"));
    expect(mockRecord.configCalls).toContainEqual({
      cloud_name: "test-cloud-name",
      api_key: "test-key",
      api_secret: "test-secret",
    });
    expect(mockRecord.uploads).toHaveLength(1);
    expect(mockRecord.uploads[0].configured).toEqual({
      cloud_name: "test-cloud-name",
      api_key: "test-key",
      api_secret: "test-secret",
    });
    expect(errors).toEqual([]);
  });
});
