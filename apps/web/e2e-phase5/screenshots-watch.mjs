// Watch page verification screenshots — desktop 1280x850 + mobile
// 390x844, fullPage, against the REAL API on the demo seed
// (PHASE5_SEED=1) and the production build.
//
// Assumes the servers are already running:
//   API  : http://localhost:5000  (PHASE5_SEED=1 node apps/api/e2e-server.mjs)
//   Web  : http://localhost:4173  (pnpm preview, production build)
//
// The seeded demo video points at https://example.com/demo-201.mp4
// (dead), so the script serves a REAL 420s black video for it
// (ffmpeg-generated into the OS tmp dir, range-aware fulfill — see
// watch-page.spec.ts for why ranges matter). The player is left
// PAUSED so the controls + chapter bar stay visible in the shot.
// The poster is the seeded thumbnail URL (example.com — dead), so
// the video area is black in these shots; that is the seeded data,
// not a rendering bug.
//
// Run:  node e2e-phase5/screenshots-watch.mjs
// Output: docs/screenshots/watch-page-desktop.png (full page)
//         docs/screenshots/watch-page-mobile.png (full page)
//         docs/screenshots/watch-player-desktop.png (player element)
//         docs/screenshots/watch-comments-desktop.png (comments element)
import { chromium } from "@playwright/test";
import { createHmac } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SHOT_DIR = fileURLToPath(
  new URL("../../../docs/screenshots", import.meta.url),
);
mkdirSync(SHOT_DIR, { recursive: true });
const shot = (name) => path.join(SHOT_DIR, name);

const BASE = "http://localhost:4173";
const VIDEO_ID = "507f1f77bcf86cd799430201"; // "Getting Started with React Hooks"
const FAKE_USER_ID = "507f1f77bcf86cd799439012";

function e2eJwtSecret() {
  const src = readFileSync(
    fileURLToPath(new URL("../../api/e2e-server.mjs", import.meta.url)),
    "utf8",
  );
  const m = src.match(/JWT_SECRET\s*=\s*"([^"]+)"/);
  if (!m) throw new Error("JWT secret not found in e2e-server.mjs");
  return m[1];
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function mintJwt() {
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
    createHmac("sha256", e2eJwtSecret())
      .update(`${header}.${payload}`)
      .digest(),
  );
  return `${header}.${payload}.${signature}`;
}

const FIXTURE_PATH = path.join(tmpdir(), "acube-watch-e2e-420s.mp4");
if (!existsSync(FIXTURE_PATH)) {
  execSync(
    `ffmpeg -y -v error -f lavfi -i "color=c=black:s=320x180:r=1:d=420" -an -c:v libx264 -preset ultrafast -pix_fmt yuv420p -movflags +faststart "${FIXTURE_PATH}"`,
    { stdio: "ignore" },
  );
}
const fixtureBytes = readFileSync(FIXTURE_PATH);

async function routeDemoVideo(page) {
  await page.route("**/demo-201.mp4", async (route) => {
    const range = route.request().headers()["range"];
    if (!range) {
      return route.fulfill({
        contentType: "video/mp4",
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": String(fixtureBytes.length),
        },
        body: fixtureBytes,
      });
    }
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    if (!m) return route.fulfill({ status: 416, body: "" });
    const start = Number(m[1]);
    const end = m[2]
      ? Math.min(Number(m[2]), fixtureBytes.length - 1)
      : fixtureBytes.length - 1;
    return route.fulfill({
      status: 206,
      contentType: "video/mp4",
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${fixtureBytes.length}`,
        "Content-Length": String(end - start + 1),
      },
      body: fixtureBytes.subarray(start, end + 1),
    });
  });
}

async function seedSession(page) {
  const token = mintJwt();
  await page.addInitScript((t) => {
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

const browser = await chromium.launch();
try {
  for (const mode of ["desktop", "mobile"]) {
    const context = await browser.newContext({
      viewport:
        mode === "desktop"
          ? { width: 1280, height: 850 }
          : { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await seedSession(page);
    await routeDemoVideo(page);
    await page.goto(`${BASE}/watch/${VIDEO_ID}`);
    await page
      .getByRole("heading", { name: "Getting Started with React Hooks" })
      .waitFor({ timeout: 10_000 });
    // Wait for the real duration so the chapter bar renders, and for
    // the seeded comments + Up Next to arrive.
    await page
      .getByRole("group", { name: "Chapters" })
      .waitFor({ timeout: 10_000 });
    await page.getByText("This finally made hooks click").waitFor();
    await page.getByRole("heading", { name: "Up next" }).waitFor();
    await page.waitForTimeout(500);
    // The Watch page scrolls inside .watch-page (overflow:auto) while
    // the document itself is overflow:hidden, so a plain fullPage
    // shot only captures the viewport. Un-constrain the scroller for
    // the shot only — this changes nothing in the app.
    await page.addStyleTag({
      content:
        ".watch-page{height:auto!important;overflow:visible!important}",
    });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: shot(`watch-page-${mode}.png`),
      fullPage: true,
    });
    console.log(`wrote watch-page-${mode}.png`);
    if (mode === "desktop") {
      await page
        .locator(".acube-player")
        .screenshot({ path: shot("watch-player-desktop.png") });
      // Comments element: NestedComments' root div (parent of the
      // "Comments N" header).
      const comments = page.locator(".watch-comments-header").locator("xpath=..");
      await comments.screenshot({
        path: shot("watch-comments-desktop.png"),
      });
      console.log("wrote watch-player-desktop.png + watch-comments-desktop.png");
    }
    await context.close();
  }
} finally {
  await browser.close();
}
