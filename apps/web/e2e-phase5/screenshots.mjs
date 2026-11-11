// Phase 5 verification screenshots — desktop 1280x800 + mobile 390x844,
// fullPage (below-fold included), against the REAL API on the demo seed
// (`pnpm --filter @acube/api seed:demo`, same dataset as PHASE5_SEED).
//
// Assumes the servers are already running:
//   API  : http://localhost:5000  (node apps/api/index.js with
//          DB_URL=<seeded mongo>, JWT_SECRET=seed-shot-test-secret,
//          FRONTEND_URL=http://localhost:4173)
//   Web  : http://localhost:4173  (pnpm preview, production build)
//
// Run:  node e2e-phase5/screenshots.mjs
// Output: docs/screenshots/phase5-<screen>-full.png (desktop, full page)
//         docs/screenshots/phase5-<screen>-mobile.png (mobile, full page)
//         plus phase5-upload-step2-full.png / phase5-upload-step3-full.png
//         (wizard steps 2-3, desktop, file picked but NOT submitted).
// Demo data only: channel "Acube Studio" (owner session) and demo
// viewer01 (history/library session). No real credentials anywhere.
import { chromium } from "@playwright/test";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SHOT_DIR = fileURLToPath(
  new URL("../../../docs/screenshots", import.meta.url),
);
mkdirSync(SHOT_DIR, { recursive: true });
const shot = (name) => path.join(SHOT_DIR, name);

const BASE = "http://localhost:4173";
const JWT_SECRET = "seed-shot-test-secret";
// Fixed seed ObjectIds (apps/api/scripts/seedDemo.js): channel 1 =
// Acube Studio, viewer01 = first demo viewer (history Today+Yest.).
const STUDIO_ID = "507f1f77bcf86cd799430001";
const VIEWER01_ID = "507f1f77bcf86cd799430101";
const VIDEO1_ID = "507f1f77bcf86cd799430201"; // "Getting Started with React Hooks"

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
    JSON.stringify({ id, sub: "demo", name, exp: 9999999999 }),
  );
  const signature = base64url(
    createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

async function seedSession(page, id, name, username, email) {
  const token = mintJwt(id, name);
  await page.addInitScript(
    ({ id: uid, name: n, username: u, email: e, token: t }) => {
      localStorage.setItem(
        "Profile",
        JSON.stringify({
          result: { _id: uid, name: n, username: u, email: e },
          token: t,
        }),
      );
    },
    { id, name, username, email, token },
  );
}

// [screen, route, session, wait]
// wait is [kind, text]: "text" = getByText, "heading" = getByRole heading.
// Dashboard/Analytics/Comments use heading waits: on mobile the Studio
// sidebar is hidden and its nav links ("Dashboard" etc.) match a text
// query first but never become visible, so a text wait times out.
const SCREENS = [
  ["home", "/", null, ["text", "Getting Started with React Hooks"]],
  ["dashboard", "/studio", "studio", ["heading", "Channel dashboard"]],
  ["content", "/studio/content", "studio", ["text", "Getting Started with React Hooks"]],
  ["analytics", "/studio/analytics", "studio", ["heading", "Analytics"]],
  ["upload", "/studio/upload", "studio", ["text", "Step 1 of 3"]],
  ["comments", "/studio/comments", "studio", ["heading", "Comments"]],
  ["settings", "/studio/settings", "studio", ["heading", "Channel settings"]],
  ["watch", `/watch/${VIDEO1_ID}`, "viewer", ["text", "Getting Started with React Hooks"]],
  ["history", "/history", "viewer", ["heading", "Watch history"]],
  ["library", "/library", "viewer", ["heading", "Your library"]],
];

const browser = await chromium.launch();
const failures = [];

for (const [name, route, session, [waitKind, waitText]] of SCREENS) {
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
    // Diagnose API/connectivity failures (the 19:06 run lost 14
    // screens to wait timeouts with no page error at all).
    // Only localhost failures are fatal: the sandbox has no external
    // internet, so Google Fonts / GSI / ipapi / example.com demo-asset
    // failures are environmental and recorded as informational only.
    page.on("requestfailed", (req) => {
      const url = req.url();
      const msg = `REQFAIL ${url} :: ${req.failure()?.errorText ?? ""}`;
      if (url.startsWith("http://localhost:")) errors.push(msg);
      else console.log(`   [external] ${msg}`);
    });
    page.on("response", (res) => {
      if (res.status() >= 400 && res.url().startsWith("http://localhost:")) {
        errors.push(`HTTP ${res.status()} ${res.url()}`);
      }
    });
    if (session === "studio") {
      await seedSession(
        page,
        STUDIO_ID,
        "Acube Studio",
        "acubestudio",
        "demo-channel-acube@demo.acube.test",
      );
    } else if (session === "viewer") {
      await seedSession(
        page,
        VIEWER01_ID,
        "Demo Viewer 01",
        "demoviewer01",
        "demo-viewer-01@demo.acube.test",
      );
    }
    try {
      await page.goto(BASE + route, { waitUntil: "networkidle" });
      const waitLocator =
        waitKind === "heading"
          ? page.getByRole("heading", { name: waitText }).first()
          : page.getByText(waitText).first();
      await waitLocator.waitFor({ timeout: 15000 });
      await page.waitForTimeout(500);
      const file =
        mode === "desktop"
          ? `phase5-${name}-full.png`
          : `phase5-${name}-mobile.png`;
      await page.screenshot({ path: shot(file), fullPage: true });
      console.log(
        `${name} ${mode}: ok${errors.length ? ` (page errors: ${errors.join("; ")})` : ""}`,
      );
      if (errors.length > 0) failures.push(`${name}/${mode}: ${errors.join("; ")}`);
    } catch (err) {
      console.log(`${name} ${mode}: FAILED — ${err.message.split("\n")[0]}`);
      failures.push(`${name}/${mode}: ${err.message.split("\n")[0]}`);
    }
    await context.close();
  }
}

// Upload wizard steps 2 + 3 (desktop): pick a file, fill the title,
// advance — but do NOT submit (no Cloudinary in this environment).
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await seedSession(
    page,
    STUDIO_ID,
    "Acube Studio",
    "acubestudio",
    "demo-channel-acube@demo.acube.test",
  );
  try {
    writeFileSync("/tmp/shot-upload.mp4", Buffer.from("fake-mp4-bytes"));
    await page.goto(`${BASE}/studio/upload`, { waitUntil: "networkidle" });
    await page
      .getByLabel("Choose video file")
      .setInputFiles("/tmp/shot-upload.mp4");
    await page.getByRole("button", { name: "Continue to details" }).click();
    await page.getByText("Step 2 of 3").waitFor({ timeout: 10000 });
    await page.getByLabel("Title").fill("How I plan my week");
    await page.getByLabel("Description").fill("Sunday routine");
    await page.getByLabel("Tags").fill("planning, routine");
    await page.screenshot({ path: shot("phase5-upload-step2-full.png"), fullPage: true });
    console.log("upload step2: ok");
    await page.getByRole("button", { name: "Continue to review" }).click();
    await page.getByText("Step 3 of 3").waitFor({ timeout: 10000 });
    await page.screenshot({ path: shot("phase5-upload-step3-full.png"), fullPage: true });
    console.log("upload step3: ok");
    if (errors.length > 0) failures.push(`upload steps: ${errors.join("; ")}`);
  } catch (err) {
    console.log(`upload steps: FAILED — ${err.message.split("\n")[0]}`);
    failures.push(`upload steps: ${err.message.split("\n")[0]}`);
  }
  await context.close();
}

await browser.close();
if (failures.length > 0) {
  console.log(`\nFAILURES (${failures.length}):`);
  for (const f of failures) console.log(` - ${f}`);
  process.exitCode = 1;
} else {
  console.log("\nAll 22 screenshots taken, no page errors.");
}
