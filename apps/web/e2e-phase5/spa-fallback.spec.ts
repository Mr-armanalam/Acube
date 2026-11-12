// SPA fallback — Playwright direct-load proof for the repo-root
// vercel.json catch-all rewrite ({ source: "/(.*)",
// destination: "/index.html" }).
//
// Vercel itself cannot be tested from here, so this spec proves the
// equivalent behaviour against the production build served by a plain
// static server with the SAME rule: a real file in apps/web/dist is
// served as-is, any other path serves dist/index.html with HTTP 200
// and the client router renders the page. The server below is ~50
// lines of node:http — no framework, no vite preview — so the
// fallback being tested is the rule itself, not a dev server.
//
// The API comes from the existing Phase 5 harness
// (playwright.phase5.config.ts): PHASE5_SEED=1 seeds the demo data,
// including video 201 "Getting Started with React Hooks". The static
// server listens on :5173 because the API's CORS allowlist
// (apps/api/app.js) permits http://localhost:5173 alongside the
// :4173 preview origin.
//
// What is covered:
//   1. HTTP level: GET /watch/:id and /search/:query return 200 with
//      the SPA shell (index.html), not a 404 body;
//   2. DIRECT LOAD of /watch/<seeded video id> renders the watch
//      page — title heading + <video> player, no
//      "Could not load this video" (API fetch) error;
//   3. DIRECT LOAD of /search/<matching term> renders results;
//   4. IN-APP search (TopBar form, the real client-side navigation)
//      for a nonsense term shows the new empty state
//      `No results for "<term>"`;
//   5. the same two screens at mobile width, for screenshots.
//
// Run (from apps/web — dist must first be built with the e2e env,
// exactly as `pnpm test:e2e:phase5` builds it):
//   VITE_BACKEND_URL=http://localhost:5000 \
//   VITE_CLIENT_ID=e2e-test.apps.googleusercontent.com \
//   VITE_ENCRYPTED_KEY=e2e-test-key pnpm exec vite build
//   pnpm exec playwright test -c playwright.phase5.config.ts \
//     e2e-phase5/spa-fallback.spec.ts
import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Must match apps/api/scripts/seedDemo.js (PHASE5_SEED=1).
const DEMO_VIDEO_1 = "507f1f77bcf86cd799430201";
const DEMO_VIDEO_1_TITLE = "Getting Started with React Hooks";
const MATCHING_TERM = "React";
const NO_MATCH_TERM = "zzz-no-match";

// CORS-allowed origin for the seeded API (see apps/api/app.js).
const STATIC_PORT = 5173;
const STATIC_BASE = `http://localhost:${STATIC_PORT}`;

const DIST_DIR = fileURLToPath(new URL("../dist", import.meta.url));
const SCREENSHOTS_DIR = fileURLToPath(
  new URL("../../../docs/screenshots", import.meta.url),
);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

// Plain static server with the SPA fallback rule: real file wins,
// anything else serves index.html (HTTP 200) — the exact
// filesystem-first-then-rewrite behaviour of the vercel.json rule.
function startStaticServer(): Promise<Server> {
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent(
      (req.url ?? "/").split("?")[0].split("#")[0],
    );
    const candidate = path.normalize(path.join(DIST_DIR, urlPath));
    // Never serve outside dist (path traversal guard).
    const filePath =
      candidate.startsWith(DIST_DIR) &&
      existsSync(candidate) &&
      statSync(candidate).isFile()
        ? candidate
        : path.join(DIST_DIR, "index.html");
    const body = readFileSync(filePath);
    res.writeHead(200, {
      "content-type":
        MIME[path.extname(filePath).toLowerCase()] ??
        "application/octet-stream",
      "content-length": body.length,
    });
    res.end(body);
  });
  return new Promise<Server>((resolve, reject) => {
    server.once("error", reject);
    server.listen(STATIC_PORT, "127.0.0.1", () => resolve(server));
  });
}

let staticServer: Server | null = null;

test.beforeAll(async () => {
  staticServer = await startStaticServer();
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => {
    if (staticServer) staticServer.close(() => resolve());
    else resolve();
  });
  staticServer = null;
});

test.describe("SPA fallback — direct loads against the static server", () => {
  test.use({ viewport: { width: 1280, height: 850 } });

  test("HTTP: /watch/:id and /search/:query return the SPA shell (200)", async ({
    request,
  }) => {
    for (const p of [`/watch/${DEMO_VIDEO_1}`, `/search/${MATCHING_TERM}`]) {
      const res = await request.get(`${STATIC_BASE}${p}`);
      expect(res.status()).toBe(200);
      const body = await res.text();
      expect(body).toContain('<div id="root">');
      expect(body).not.toContain("404");
    }
    // A real asset is still served as itself, not rewritten.
    const asset = await request.get(`${STATIC_BASE}/manifest.json`);
    expect(asset.status()).toBe(200);
    expect(asset.headers()["content-type"] ?? "").toContain("json");
  });

  test("direct load /watch/:id renders the watch page", async ({ page }) => {
    await page.goto(`${STATIC_BASE}/watch/${DEMO_VIDEO_1}`);
    await expect(
      page.getByRole("heading", { name: DEMO_VIDEO_1_TITLE }),
    ).toBeVisible();
    await expect(page.locator("video").first()).toBeAttached();
    await expect(page.getByText("Could not load this video")).toHaveCount(0);
    await expect(page.getByText("Video not found.")).toHaveCount(0);
    await page.screenshot({
      path: path.join(
        SCREENSHOTS_DIR,
        "phase5-spa-fallback-watch-direct-desktop.png",
      ),
    });
  });

  test("direct load /search/<matching term> renders results", async ({
    page,
  }) => {
    await page.goto(`${STATIC_BASE}/search/${MATCHING_TERM}`);
    // Result cards render the title as a <p>, not a heading.
    await expect(page.getByText(DEMO_VIDEO_1_TITLE).first()).toBeVisible();
    await expect(
      page.getByText(`No results for "${MATCHING_TERM}"`),
    ).toHaveCount(0);
  });

  test("in-app search with zero matches shows the empty state", async ({
    page,
  }) => {
    await page.goto(`${STATIC_BASE}/`);
    await expect(page.getByText(DEMO_VIDEO_1_TITLE).first()).toBeVisible();
    await page.getByLabel("Search videos").fill(NO_MATCH_TERM);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(`${STATIC_BASE}/search/${NO_MATCH_TERM}`);
    await expect(
      page.getByText(`No results for "${NO_MATCH_TERM}"`),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(
        SCREENSHOTS_DIR,
        "phase5-spa-fallback-search-empty-desktop.png",
      ),
    });
  });
});

test.describe("SPA fallback — mobile direct loads", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("direct load /watch/:id renders the watch page", async ({ page }) => {
    await page.goto(`${STATIC_BASE}/watch/${DEMO_VIDEO_1}`);
    await expect(
      page.getByRole("heading", { name: DEMO_VIDEO_1_TITLE }),
    ).toBeVisible();
    await expect(page.getByText("Could not load this video")).toHaveCount(0);
    await page.screenshot({
      path: path.join(
        SCREENSHOTS_DIR,
        "phase5-spa-fallback-watch-direct-mobile.png",
      ),
    });
  });

  test("direct load /search/<nonsense term> shows the empty state", async ({
    page,
  }) => {
    await page.goto(`${STATIC_BASE}/search/${NO_MATCH_TERM}`);
    await expect(
      page.getByText(`No results for "${NO_MATCH_TERM}"`),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(
        SCREENSHOTS_DIR,
        "phase5-spa-fallback-search-empty-mobile.png",
      ),
    });
  });
});
