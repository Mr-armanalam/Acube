// PR #6 verification screenshots — desktop 1280x800 + mobile 390x844,
// fullPage, against the REAL API on the Phase 5 seed (PHASE5_SEED=1,
// same servers as `pnpm test:e2e:phase5`).
//
// Assumes the servers are already running:
//   API  : http://localhost:5000  (PHASE5_SEED=1 node apps/api/e2e-server.mjs)
//   Web  : http://localhost:4173  (pnpm preview, production build)
//
// Run:  node e2e-phase5/screenshots-pr6.mjs
// Output (docs/screenshots/):
//   phase5-home-clean-full.png / -mobile.png
//   phase5-channel-clean-full.png / -mobile.png
//   phase5-account-menu-full.png / -mobile.png  (avatar menu open)
//   phase5-history-clean-full.png / -mobile.png
//   phase5-library-clean-full.png / -mobile.png
// Demo data only: fake e2e user (channel owner) + demo viewer01.
// No real credentials anywhere.
import { chromium } from "@playwright/test";
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SHOT_DIR = fileURLToPath(
  new URL("../../../docs/screenshots", import.meta.url),
);
mkdirSync(SHOT_DIR, { recursive: true });
const shot = (name) => path.join(SHOT_DIR, name);

const BASE = "http://localhost:4173";

// Same secret as the specs: read it from e2e-server.mjs at runtime.
const serverSrc = readFileSync(
  fileURLToPath(new URL("../../api/e2e-server.mjs", import.meta.url)),
  "utf8",
);
const E2E_JWT_SECRET = serverSrc.match(/JWT_SECRET\s*=\s*"([^"]+)"/)?.[1];
if (!E2E_JWT_SECRET) throw new Error("JWT_SECRET not found in e2e-server.mjs");

// Fixed seed ObjectIds (apps/api/e2e-server.mjs PHASE5_SEED + seedDemo).
const FAKE_USER_ID = "507f1f77bcf86cd799439012"; // E2E User, owns the smoke video
const VIEWER01_ID = "507f1f77bcf86cd799430101"; // demo viewer01 (history/library)

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
    createHmac("sha256", E2E_JWT_SECRET).update(`${header}.${payload}`).digest(),
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

const browser = await chromium.launch();
const failures = [];

async function take(name, route, session, waitFor, extra) {
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
    page.on("requestfailed", (req) => {
      if (req.url().startsWith("http://localhost:"))
        errors.push(`REQFAIL ${req.url()} :: ${req.failure()?.errorText ?? ""}`);
    });
    page.on("response", (res) => {
      if (res.status() >= 400 && res.url().startsWith("http://localhost:"))
        errors.push(`HTTP ${res.status()} ${res.url()}`);
    });
    if (session === "owner") {
      await seedSession(page, FAKE_USER_ID, "E2E User", "e2euser", "e2e@example.com");
    } else if (session === "viewer") {
      await seedSession(page, VIEWER01_ID, "Demo Viewer 01", "demoviewer01", "demo-viewer-01@demo.acube.test");
    }
    try {
      await page.goto(BASE + route, { waitUntil: "networkidle" });
      await waitFor(page);
      if (extra) await extra(page);
      await page.waitForTimeout(500);
      const file =
        mode === "desktop"
          ? `phase5-${name}-clean-full.png`
          : `phase5-${name}-clean-mobile.png`;
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

// (a) Home — tag chips + cards (owner session: avatar in TopBar).
await take("home", "/", "owner", async (page) => {
  await page.getByText("E2E Smoke Video").first().waitFor({ timeout: 15000 });
});

// (b) Channel page — owner view (header + tabs + video grid).
await take("channel", `/channel/${FAKE_USER_ID}`, "owner", async (page) => {
  await page.getByText("E2E Smoke Video").first().waitFor({ timeout: 15000 });
});

// (c) Account menu open — "Your account" above "Your channel".
await take(
  "account-menu",
  "/",
  "owner",
  async (page) => {
    await page.getByText("E2E Smoke Video").first().waitFor({ timeout: 15000 });
  },
  async (page) => {
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("link", { name: "Your account" }).waitFor({ timeout: 5000 });
  },
);

// (d) History page — viewer01 (Today + Yesterday rows).
await take("history", "/history", "viewer", async (page) => {
  await page.getByRole("heading", { name: "Watch history" }).first().waitFor({ timeout: 15000 });
});

// (e) Library page — viewer01 (Watch Later / Liked / playlists).
await take("library", "/library", "viewer", async (page) => {
  await page.getByRole("heading", { name: "Your library" }).first().waitFor({ timeout: 15000 });
});

await browser.close();
if (failures.length > 0) {
  console.log(`\nFAILURES (${failures.length}):`);
  for (const f of failures) console.log(` - ${f}`);
  process.exitCode = 1;
} else {
  console.log("\nAll 10 PR6 screenshots taken, no page errors.");
}
