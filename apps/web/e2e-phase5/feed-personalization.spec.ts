// Feed personalization — Playwright e2e (Phase 5 feed config:
// production build on :4173 + real API on :5000 with PHASE5_SEED=1
// and DEMO_LOGIN_ENABLED=1).
//
// The seeded demo data on its own CANNOT prove ranking (a): the
// 1,503 seeded ViewEvents belong to the 24 demo viewers
// (demo-viewer-01…24), NOT to the Code Streamer channel account
// (demo-channel-codestreamer@demo.acube.test) — that account starts
// with zero ViewEvents, i.e. a cold-start feed. So each signed-in
// test builds the account's history first, through the REAL view
// endpoint (PATCH /video/view/:id as the signed-in user), exactly
// the way a real user accumulates it: one view of "Getting Started
// with React Hooks" (tags react / javascript / frontend). The
// recordView upsert is deduped per (viewer, video, day), so
// re-running the spec is idempotent — no invented data, no direct
// DB writes.
//
// What the seeded catalogue then proves: with affinity
// react=javascript=frontend≈1 (watched today), the three UNWATCHED
// videos sharing a tag with it — "TypeScript Generics, Explained"
// via javascript, "CSS Grid in 10 Minutes" and "Figma to Code" via
// frontend — must outrank the tagless/cold videos with a real
// "Because you watched Getting Started with React Hooks" label,
// while the watched video itself is deprioritised (×0.25) and never
// its own reason.
//
// Run (from apps/web):
//   VITE_BACKEND_URL=http://localhost:5000 \
//   VITE_CLIENT_ID=e2e-test.apps.googleusercontent.com \
//   VITE_ENCRYPTED_KEY=e2e-test-key vite build && \
//   playwright test -c playwright.phase5-feed.config.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
  type Request,
} from "@playwright/test";

const API_BASE = "http://localhost:5000";
const DEMO_EMAIL = "demo-channel-codestreamer@demo.acube.test";
// Seeded catalogue ids (seedDemo.js oid(201+i)):
//   201 Getting Started with React Hooks [react, javascript, frontend]
//   202 TypeScript Generics, Explained  [typescript, javascript]
//   203 Build a REST API with Express   [nodejs, backend, api]
//   204 CSS Grid in 10 Minutes         [css, frontend]
//   205 Figma to Code                  [design, frontend]
//   206 MongoDB Aggregations Deep Dive [mongodb, database, backend]
//   207 System Design: Caching Basics  [system-design, backend]
// Plus the e2e-server smoke video (no tags). 8 public videos total.
const REACT_HOOKS_ID = "507f1f77bcf86cd799430201";
const WATCHED_TITLE = "Getting Started with React Hooks";
const WATCHED_REASON = `Because you watched ${WATCHED_TITLE}`;
const SCREENSHOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "docs",
  "screenshots",
);

interface DemoSession {
  result: Record<string, unknown>;
  token: string;
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

async function demoLogin(request: APIRequestContext): Promise<DemoSession> {
  const response = await request.post(`${API_BASE}/auth/demo-login`, {
    data: { email: DEMO_EMAIL },
  });
  expect(response.status()).toBe(200);
  const session = (await response.json()) as DemoSession;
  expect(typeof session.token).toBe("string");
  return session;
}

/** Build one real ViewEvent + History row for the signed-in user. */
async function recordView(
  request: APIRequestContext,
  token: string,
  videoId: string,
): Promise<void> {
  const response = await request.patch(`${API_BASE}/video/view/${videoId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
}

async function seedSession(page: Page, session: DemoSession): Promise<void> {
  await page.addInitScript((value: string) => {
    localStorage.setItem("Profile", value);
  }, JSON.stringify(session));
}

function feedRequests(seen: Request[]): Request[] {
  return seen.filter((r) => new URL(r.url()).pathname === "/feed");
}

async function cardTitles(page: Page): Promise<string[]> {
  return page
    .locator(".home-video-card")
    .evaluateAll((cards) =>
      cards.map(
        (card) =>
          card.querySelector("h3, .home-video-title")?.textContent?.trim() ??
          "",
      ),
    );
}

async function cardReasons(page: Page): Promise<string[]> {
  return page
    .locator(".home-video-reason")
    .evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ""));
}

test.describe("Feed personalization (real API, seeded demo data)", () => {
  test("(a) signed-in with built watch history: watched tags rank first with real 'Because you watched' labels", async ({
    page,
    request,
  }) => {
    const errors = collectPageErrors(page);
    const seen: Request[] = [];
    page.on("request", (r) => seen.push(r));

    // History built through the real endpoint, not invented.
    const session = await demoLogin(request);
    await recordView(request, session.token, REACT_HOOKS_ID);

    await seedSession(page, session);
    const feedResponse = page.waitForResponse("**/feed?page=1&limit=20*");
    await page.goto("/");
    await expect(page.locator(".home-video-card")).toHaveCount(8);
    const feedJson = (await feedResponse).json() as Promise<{
      items: Array<{ reason: { type: string; label: string } }>;
      total: number;
    }>;
    const feed = await feedJson;
    expect(feed.total).toBe(8);
    expect(feed.items[0]?.reason.type).toBe("watched");
    expect(feed.items[0]?.reason.label).toBe(WATCHED_REASON);

    // Rendered: the first card carries the real watched reason, and
    // every watched-reason card precedes every cold-start card.
    // Three unwatched videos share a tag with the watched one
    // (TypeScript via javascript, CSS Grid + Figma via frontend).
    const reasons = await cardReasons(page);
    expect(reasons.filter((r) => r === WATCHED_REASON).length).toBe(3);
    expect(reasons[0]).toBe(WATCHED_REASON);
    const firstCold = reasons.findIndex((r) => r !== WATCHED_REASON);
    expect(reasons.slice(firstCold).every((r) => r !== WATCHED_REASON)).toBe(
      true,
    );
    const titles = await cardTitles(page);
    const watchedReasonTitles = titles.filter(
      (_, i) => reasons[i] === WATCHED_REASON,
    );
    expect(watchedReasonTitles.sort()).toEqual([
      "CSS Grid in 10 Minutes",
      "Figma to Code: A Practical Workflow",
      "TypeScript Generics, Explained",
    ]);

    // The watched video itself is deprioritised and never its own
    // reason: its label is a cold-start one (Trending now / Newest).
    const watchedIndex = titles.indexOf(WATCHED_TITLE);
    expect(watchedIndex).toBeGreaterThan(1);
    expect(reasons[watchedIndex]).toMatch(/^(Trending now|Newest)$/);
    expect(errors).toEqual([]);
  });

  test("(b) logged-out: no /feed request, no 'Because you watched' labels", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    const seen: Request[] = [];
    page.on("request", (r) => seen.push(r));

    await page.goto("/");
    await expect(page.locator(".home-video-card")).toHaveCount(8);
    expect(feedRequests(seen)).toHaveLength(0);
    expect(
      seen.some((r) => new URL(r.url()).pathname === "/video/getvideos"),
    ).toBe(true);
    await expect(page.locator(".home-video-reason")).toHaveCount(0);
    await expect(page.getByText("Because you watched")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("(c) tag chip narrows the feed: signed-in via ?tag=, logged-out client-side", async ({
    page,
    request,
    browser,
  }) => {
    const errors = collectPageErrors(page);

    // Signed in: the chip fetches that tag's page 1 from GET /feed.
    const session = await demoLogin(request);
    await recordView(request, session.token, REACT_HOOKS_ID);
    await seedSession(page, session);
    const seenSignedIn: Request[] = [];
    page.on("request", (r) => seenSignedIn.push(r));
    await page.goto("/");
    await expect(page.locator(".home-video-card")).toHaveCount(8);
    const taggedFeed = page.waitForResponse("**/feed?*tag=frontend*");
    await page.getByRole("button", { name: "frontend", exact: true }).click();
    await taggedFeed;
    await expect(page.locator(".home-video-card")).toHaveCount(3);
    expect((await cardTitles(page)).sort()).toEqual([
      "CSS Grid in 10 Minutes",
      "Figma to Code: A Practical Workflow",
      "Getting Started with React Hooks",
    ]);
    expect(
      feedRequests(seenSignedIn).some(
        (r) => new URL(r.url()).searchParams.get("tag") === "frontend",
      ),
    ).toBe(true);

    // Logged out: the same chip filters client-side — no /feed call.
    // A FRESH browser context is required here, not
    // page.context().newPage(): localStorage (and therefore the stored
    // "Profile" session) is shared per context, so a second page in
    // the signed-in context would restore the session and call /feed.
    const loggedOutContext = await browser.newContext();
    const loggedOut = await loggedOutContext.newPage();
    const loggedOutErrors = collectPageErrors(loggedOut);
    const seenLoggedOut: Request[] = [];
    loggedOut.on("request", (r) => seenLoggedOut.push(r));
    await loggedOut.goto("/");
    await expect(loggedOut.locator(".home-video-card")).toHaveCount(8);
    await loggedOut
      .getByRole("button", { name: "backend", exact: true })
      .click();
    await expect(loggedOut.locator(".home-video-card")).toHaveCount(3);
    expect((await cardTitles(loggedOut)).sort()).toEqual([
      "Build a REST API with Express",
      "MongoDB Aggregations Deep Dive",
      "System Design: Caching Basics",
    ]);
    expect(feedRequests(seenLoggedOut)).toHaveLength(0);
    expect(errors).toEqual([]);
    expect(loggedOutErrors).toEqual([]);
    await loggedOutContext.close();
  });

  test("(d) infinite scroll appends page 2 of the personalised feed", async ({
    page,
    request,
  }) => {
    // The real catalogue has only 8 videos (< 1 page), so page 2 is
    // proven against a stubbed /feed — same precedent as
    // home-pagination.spec.ts (45-video stub for getvideos). The
    // client, the production build, the browser and the scroll
    // behaviour are all real; only the feed payload is stubbed.
    const TOTAL_VIDEOS = 45;
    const PAGE_SIZE = 20;
    const seen: Request[] = [];
    await page.route("**/feed*", async (route) => {
      const url = new URL(route.request().url());
      const pageParam = Number(url.searchParams.get("page") ?? "1");
      const limit = Number(url.searchParams.get("limit") ?? "20");
      seen.push(route.request());
      const start = (pageParam - 1) * limit;
      const items = Array.from({ length: TOTAL_VIDEOS }, (_, i) => ({
        _id: `feed-e2e-vid-${i + 1}`,
        videotitle: `Feed E2E Video ${i + 1}`,
        videochanel: "507f1f77bcf86cd799439012",
        filepath: `/videos/feed-e2e-${i + 1}.mp4`,
        uploader: "e2euser",
        Like: 0,
        views: i + 1,
        createdAt: "2026-11-01T00:00:00.000Z",
        description: `Feed pagination fixture ${i + 1}.`,
        tags: ["react"],
        durationSec: 120,
        visibility: "public",
        deletedAt: null,
        reason: { type: "newest", label: "Newest" },
      })).slice(start, start + limit);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items,
          page: pageParam,
          limit,
          total: TOTAL_VIDEOS,
          totalPages: Math.max(1, Math.ceil(TOTAL_VIDEOS / limit)),
        }),
      });
    });
    const errors = collectPageErrors(page);
    const session = await demoLogin(request);
    await seedSession(page, session);

    await page.goto("/");
    await expect(page.locator(".home-video-card")).toHaveCount(PAGE_SIZE);
    await expect(page.getByText("Feed E2E Video 20")).toBeVisible();
    await expect(page.getByText("Feed E2E Video 21")).toHaveCount(0);
    await page.waitForTimeout(1000);
    expect(seen).toHaveLength(1);

    // Scroll near the bottom — the sentinel loads page 2. NOTE: the
    // page scrolls inside .container2_Pages_App (overflow-y: auto;
    // body is overflow: hidden), so window.scrollTo does nothing here.
    await page.evaluate(() => {
      const scroller = document.querySelector(".container2_Pages_App");
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
    await expect(page.locator(".home-video-card")).toHaveCount(40);
    await expect(page.getByText("Feed E2E Video 40")).toBeVisible();
    expect(seen).toHaveLength(2);

    // The "Load more" fallback loads the last page. A plain click
    // cannot prove this step: clicking scrolls the button into view,
    // and the sentinel sits directly above it (200px rootMargin), so
    // the scroll fires the sentinel first — which correctly loads
    // page 3 and unmounts the button before the click lands (the end
    // state is still right: 45 cards, "You've reached the end."). The
    // fallback is therefore clicked without scrolling (force), which
    // proves the button's own handler loads the next page; the
    // sentinel path is already proven by the page-2 scroll above.
    await expect(page.getByRole("button", { name: "Load more" })).toBeVisible();
    await page
      .getByRole("button", { name: "Load more" })
      .click({ force: true });
    await expect(page.locator(".home-video-card")).toHaveCount(TOTAL_VIDEOS);
    await expect(page.getByText("Feed E2E Video 45")).toBeVisible();
    expect(seen).toHaveLength(3);
    await expect(page.getByText("You've reached the end.")).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("Feed personalization screenshots", () => {
  test.use({ viewport: { width: 1280, height: 850 } });

  test("personalized Home, desktop 1280x850, reason labels visible", async ({
    page,
    request,
  }) => {
    const errors = collectPageErrors(page);
    const session = await demoLogin(request);
    await recordView(request, session.token, REACT_HOOKS_ID);
    await seedSession(page, session);
    await page.goto("/");
    await expect(page.locator(".home-video-card")).toHaveCount(8);
    await expect(page.locator(".home-video-reason").first()).toHaveText(
      WATCHED_REASON,
    );
    // Wait for the seeded example.com thumbnails to fail and fall
    // back to their deterministic gradients — screenshotting
    // immediately after the reason text catches the <img> elements
    // mid-load as black boxes instead of the gradient + ▶ fallback.
    await expect(
      page.getByRole("img", { name: "Video thumbnail unavailable" }),
    ).toHaveCount(8);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "phase5-feed-personalized-desktop.png"),
    });
    expect(errors).toEqual([]);
  });
});

test.describe("Feed personalization screenshots (mobile)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("personalized Home, mobile 390x844, reason labels visible", async ({
    page,
    request,
  }) => {
    const errors = collectPageErrors(page);
    const session = await demoLogin(request);
    await recordView(request, session.token, REACT_HOOKS_ID);
    await seedSession(page, session);
    await page.goto("/");
    await expect(page.locator(".home-video-card")).toHaveCount(8);
    await expect(page.locator(".home-video-reason").first()).toHaveText(
      WATCHED_REASON,
    );
    // Same thumbnail-settle wait as the desktop shot (see above).
    await expect(
      page.getByRole("img", { name: "Video thumbnail unavailable" }),
    ).toHaveCount(8);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "phase5-feed-personalized-mobile.png"),
    });
    expect(errors).toEqual([]);
  });
});
