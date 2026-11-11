// Upload-wizard fix — fresh screenshots of the rebuilt 3-step wizard,
// desktop 1280x800 + mobile 390x844, against the REAL API on the demo
// seed with NO Cloudinary credentials (the local-storage fallback), so
// the Publish step is exercised for real.
//
// Assumes the servers are already running:
//   API  : http://localhost:5000  (PHASE5_SEED=1 node ../api/e2e-server.mjs)
//   Web  : http://localhost:4173  (pnpm preview, production build)
//
// Run:  node e2e-phase5/upload-wizard-screenshots.mjs
// Output (docs/screenshots/):
//   phase5-upload-step1-modal-full.png / -mobile.png  (Step 1 modal)
//   phase5-upload-step2-full.png / -mobile.png        (Step 2 details)
//   phase5-upload-step3-full.png / -mobile.png        (Step 3 review)
//   phase5-upload-published-full.png                  (Content, desktop)
import { chromium } from "@playwright/test";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SHOT_DIR = fileURLToPath(
  new URL("../../../docs/screenshots", import.meta.url),
);
mkdirSync(SHOT_DIR, { recursive: true });
const shot = (name) => path.join(SHOT_DIR, name);

const BASE = "http://localhost:4173";
// Must match apps/api/e2e-server.mjs (PHASE5_SEED=1).
const STUDIO_ID = "507f1f77bcf86cd799439012";
const JWT_SECRET = "e2e-test-secret-not-a-real-secret";

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function mintJwt(id, name) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ id, sub: "e2e", name, exp: 9999999999 }),
  );
  const signature = base64url(
    createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

async function seedSession(page) {
  const token = mintJwt(STUDIO_ID, "E2E User");
  await page.addInitScript(
    ({ token: t }) => {
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
    },
    { token },
  );
}

// A real, playable 1-second mp4 so the <video> previews show a frame.
const mp4Path = path.join(tmpdir(), "acube-upload-shot.mp4");
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
  mp4Path,
]);

const browser = await chromium.launch();
const failures = [];

for (const mode of ["desktop", "mobile"]) {
  const context = await browser.newContext({
    viewport:
      mode === "desktop"
        ? { width: 1280, height: 800 }
        : { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("response", (res) => {
    // socket.io polling 404s are expected noise: the e2e server does
    // not mount socket.io (chat), and the app polls it regardless.
    if (
      res.status() >= 400 &&
      res.url().startsWith("http://localhost:") &&
      !res.url().includes("/socket.io/")
    ) {
      errors.push(`HTTP ${res.status()} ${res.url()}`);
    }
  });
  await seedSession(page);
  try {
    await page.goto(`${BASE}/studio/upload`, { waitUntil: "networkidle" });
    await page
      .getByRole("dialog", { name: "Upload videos" })
      .waitFor({ timeout: 15000 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: shot(
        mode === "desktop"
          ? "phase5-upload-step1-modal-full.png"
          : "phase5-upload-step1-modal-mobile.png",
      ),
      fullPage: true,
    });
    console.log(`upload step1 modal ${mode}: ok`);

    await page.getByLabel("Choose video file").setInputFiles(mp4Path);
    await page.getByLabel("Preview of acube-upload-shot.mp4").waitFor({
      timeout: 10000,
    });
    await page.getByRole("button", { name: "Continue to details" }).click();
    await page.getByText(/Step 2 of 3/).waitFor({ timeout: 10000 });
    await page.getByLabel("Title").fill("How I plan my week");
    await page.getByLabel("Description").fill("My Sunday planning routine");
    await page.getByLabel("Tags").fill("planning, routine");
    await page.waitForTimeout(400);
    await page.screenshot({
      path: shot(
        mode === "desktop"
          ? "phase5-upload-step2-full.png"
          : "phase5-upload-step2-mobile.png",
      ),
      fullPage: true,
    });
    console.log(`upload step2 ${mode}: ok`);

    await page.getByRole("button", { name: "Continue to review" }).click();
    await page.getByText(/Step 3 of 3/).waitFor({ timeout: 10000 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: shot(
        mode === "desktop"
          ? "phase5-upload-step3-full.png"
          : "phase5-upload-step3-mobile.png",
      ),
      fullPage: true,
    });
    console.log(`upload step3 ${mode}: ok`);

    if (mode === "desktop") {
      // Publish for real (no Cloudinary — local fallback) and capture
      // the video in Content.
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await page.getByText("Your video was uploaded.").waitFor({
        timeout: 15000,
      });
      await page.getByRole("link", { name: "View in Content" }).click();
      await page.getByText("How I plan my week").waitFor({ timeout: 10000 });
      await page.waitForTimeout(400);
      await page.screenshot({
        path: shot("phase5-upload-published-full.png"),
        fullPage: true,
      });
      console.log("upload published desktop: ok");
    }
    if (errors.length > 0) failures.push(`upload ${mode}: ${errors.join("; ")}`);
  } catch (err) {
    console.log(`upload ${mode}: FAILED — ${err.message.split("\n")[0]}`);
    failures.push(`upload ${mode}: ${err.message.split("\n")[0]}`);
  }
  await context.close();
}

await browser.close();
if (failures.length > 0) {
  console.log(`\nFAILURES (${failures.length}):`);
  for (const f of failures) console.log(` - ${f}`);
  process.exitCode = 1;
} else {
  console.log("\nAll 7 upload screenshots taken, no page errors.");
}
