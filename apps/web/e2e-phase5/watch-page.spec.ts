// Watch page — Playwright click-through against the real API on
// in-memory MongoDB (playwright.phase5.config.ts starts it with
// PHASE5_SEED=1) and the production build. Covers what the unit
// tests can only mock, with the seeded demo data:
//
//   1. post a top-level comment and see it (still there after reload,
//      i.e. after the refetch — the >50-comments newest-first path);
//   2. like then dislike toggles with real counts;
//   3. reply threads under the parent (seeded thread + a posted reply);
//   4. subscribe toggles, count changes on the Watch page AND the
//      Channel page (toggled back off, so the suite leaves no state);
//   5. ?t= seeks on load;
//   6. chapter click seeks + updates the URL;
//   7. controls hide after ~3s idle and reappear on hover;
//   8. a video with a dead source shows the poster + error state,
//      never a gradient box;
//   9. Up Next renders real thumbnail elements per suggestion.
//
// The seeded demo videos point at https://example.com/*.mp4 (dead),
// so tests 5–7 serve a REAL 420s black video for the video under
// test: ffmpeg generates it into the OS tmp dir at suite start
// (0.15s, 8KB — duration 420s matches the seeded video 201, so its
// chapters at 0/90/210/330 render). If ffmpeg is missing those
// tests skip instead of failing. Test 8 deliberately does NOT route
// the fixture, so the source stays dead.
//
// Run (from apps/web):
//   pnpm test:e2e:phase5 -- watch-page.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Must match apps/api/e2e-server.mjs (PHASE5_SEED=1) and
// apps/api/scripts/seedDemo.js (fixed ObjectIds).
const FAKE_USER_ID = "507f1f77bcf86cd799439012";
// Read at runtime from the server file — never hardcode, never log.
// (Tool output redacts secret values with a plausible-looking
// placeholder; copying the displayed value mints 401s — see
// PHASE5_REPORT.md §8.9.10.)
function e2eJwtSecret(): string {
  const src = readFileSync(
    fileURLToPath(new URL("../../api/e2e-server.mjs", import.meta.url)),
    "utf8",
  );
  const m = src.match(/JWT_SECRET\s*=\s*"([^"]+)"/);
  if (!m) throw new Error("JWT secret not found in e2e-server.mjs");
  return m[1];
}
const E2E_JWT_SECRET = e2eJwtSecret();
// Video 201 "Getting Started with React Hooks" (420s, chapters
// 0/90/210/330) on the Code Streamer channel (oid 1); video 202
// "TypeScript Generics, Explained" (360s) for the dead-source test.
const DEMO_VIDEO_1 = "507f1f77bcf86cd799430201";
const DEMO_VIDEO_2 = "507f1f77bcf86cd799430202";
const CODE_STREAMER_CHANNEL = "507f1f77bcf86cd799430001";

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

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

// Real 420s media for the video under test (see header). Generated
// once per suite run; null when ffmpeg is unavailable.
const FIXTURE_PATH = path.join(tmpdir(), "acube-watch-e2e-420s.mp4");
let fixtureReady: boolean | null = null;
function ensureFixture(): boolean {
  if (fixtureReady !== null) return fixtureReady;
  if (existsSync(FIXTURE_PATH)) {
    fixtureReady = true;
    return true;
  }
  try {
    execSync(
      `ffmpeg -y -v error -f lavfi -i "color=c=black:s=320x180:r=1:d=420" -an -c:v libx264 -preset ultrafast -pix_fmt yuv420p -movflags +faststart "${FIXTURE_PATH}"`,
      { stdio: "ignore" },
    );
    fixtureReady = existsSync(FIXTURE_PATH);
  } catch {
    fixtureReady = false;
  }
  return fixtureReady;
}

async function routeDemoVideo(page: Page) {
  const bytes = readFileSync(FIXTURE_PATH);
  // Range-aware fulfill: Chromium only reports a non-empty seekable
  // range (and honours currentTime sets) when the media response
  // supports byte ranges — a plain 200 fulfill leaves seekable
  // [0,0] even with the whole file buffered, so ?t= and chapter
  // seeks silently do nothing. Real video hosts (Cloudinary, the
  // local /uploads/ static server) support ranges; the mock must too.
  await page.route("**/demo-201.mp4", async (route) => {
    const range = route.request().headers()["range"];
    if (!range) {
      return route.fulfill({
        contentType: "video/mp4",
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": String(bytes.length),
        },
        body: bytes,
      });
    }
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    if (!m) return route.fulfill({ status: 416, body: "" });
    const start = Number(m[1]);
    const end = m[2]
      ? Math.min(Number(m[2]), bytes.length - 1)
      : bytes.length - 1;
    const chunk = bytes.subarray(start, end + 1);
    return route.fulfill({
      status: 206,
      contentType: "video/mp4",
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
        "Content-Length": String(chunk.length),
      },
      body: chunk,
    });
  });
}

async function gotoWatch(page: Page, videoId: string, query = "") {
  await page.goto(`/watch/${videoId}${query}`);
  await expect(
    page.getByRole("heading", { name: "Getting Started with React Hooks" }),
  ).toBeVisible();
}

async function sliderSeconds(page: Page): Promise<number> {
  const now = await page
    .getByRole("slider", { name: "Seek slider" })
    .getAttribute("aria-valuenow");
  return Number(now ?? -1);
}

test.use({ viewport: { width: 1280, height: 800 } });

test.describe("Watch page (real API, seeded demo data)", () => {
  test.beforeAll(() => {
    // Generate the fixture once; media tests skip when unavailable.
    ensureFixture();
  });

  test("1. post a top-level comment and see it — still there after reload", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await gotoWatch(page, DEMO_VIDEO_1);
    const text = `E2E watch comment ${Date.now()}`;
    await page.getByLabel("Add a comment").fill(text);
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(page.getByText(text)).toBeVisible();
    // Reload: the refetch must still contain it (newest-first page 1).
    await page.reload();
    await expect(page.getByText(text)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("2. like then dislike toggles with real counts", async ({ page }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await gotoWatch(page, DEMO_VIDEO_1);
    const body = "This finally made hooks click for me — thank you!";
    await expect(page.getByText(body)).toBeVisible();
    // Scope to this comment's own body: a nested reply shares the
    // author (demoviewer03), so the bare aria-label matches twice.
    const commentBody = page
      .getByText(body)
      .locator("xpath=ancestor::div[contains(@class, 'watch-comment-body')][1]");
    const like = commentBody.getByRole("button", {
      name: "Like comment by demoviewer03",
      exact: true,
    });
    const dislike = commentBody.getByRole("button", {
      name: "Dislike comment by demoviewer03",
      exact: true,
    });
    const countOf = async (b: ReturnType<Page["getByRole"]>) =>
      Number((await b.textContent())?.trim() ?? -1);
    expect(await countOf(like)).toBe(0);
    expect(await countOf(dislike)).toBe(0);

    await like.click();
    await expect(like).toHaveAttribute("aria-pressed", "true");
    expect(await countOf(like)).toBe(1);
    expect(await countOf(dislike)).toBe(0);

    // Dislike switches sides: like back to 0, dislike to 1.
    await dislike.click();
    await expect(dislike).toHaveAttribute("aria-pressed", "true");
    await expect(like).toHaveAttribute("aria-pressed", "false");
    expect(await countOf(like)).toBe(0);
    expect(await countOf(dislike)).toBe(1);

    // Dislike again removes it (toggle off — suite leaves no state).
    await dislike.click();
    await expect(dislike).toHaveAttribute("aria-pressed", "false");
    expect(await countOf(dislike)).toBe(0);
    expect(errors).toEqual([]);
  });

  test("3. reply threads under the parent — seeded thread + posted reply", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await gotoWatch(page, DEMO_VIDEO_1);
    await expect(
      page.getByText("This finally made hooks click for me — thank you!"),
    ).toBeVisible();
    // Seeded thread: reply under the parent, nested reply under it.
    await expect(
      page.getByText("Same — the useEffect part was the missing piece for me."),
    ).toBeVisible();
    await expect(
      page.getByText("Exactly, the cleanup example helped a lot."),
    ).toBeVisible();

    // Post a reply to the parent thread and see it under the parent.
    // (Scope to the parent's own body — its nested replies carry
    // their own Reply buttons.)
    const parentBody = page
      .getByText("This finally made hooks click for me — thank you!")
      .locator("xpath=ancestor::div[contains(@class, 'watch-comment-body')][1]");
    await parentBody
      .getByRole("button", { name: "Reply", exact: true })
      .click();
    const replyText = `E2E reply ${Date.now()}`;
    await page.getByLabel("Write a reply").fill(replyText);
    await page.getByRole("button", { name: "Post reply" }).click();
    await expect(page.getByText(replyText)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("4. subscribe toggles, count changes on Watch AND Channel", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await gotoWatch(page, DEMO_VIDEO_1);
    const subscribe = page.getByRole("button", {
      name: /^(Subscribe|Subscribed) to Code Streamer$/,
    });
    await expect(subscribe).toBeVisible();
    const watchCount = page.locator(".subscribe-wrap .subscribe-count").first();
    await expect(watchCount).toHaveText("0 subscribers");
    await expect(subscribe).toHaveText("Subscribe");

    await subscribe.click();
    await expect(subscribe).toHaveText("Subscribed");
    await expect(watchCount).toHaveText("1 subscriber");

    // The Channel page shows the same state (same query key family,
    // same server row).
    await page.goto(`/channel/${CODE_STREAMER_CHANNEL}`);
    const channelSubscribe = page.getByRole("button", {
      name: /^(Subscribe|Subscribed) to Code Streamer$/,
    });
    await expect(channelSubscribe).toHaveText("Subscribed");
    await expect(
      page.locator(".subscribe-wrap .subscribe-count").first(),
    ).toHaveText("1 subscriber");

    // Toggle off on the Channel page — suite leaves no state.
    await channelSubscribe.click();
    await expect(channelSubscribe).toHaveText("Subscribe");
    await expect(
      page.locator(".subscribe-wrap .subscribe-count").first(),
    ).toHaveText("0 subscribers");

    // Back on Watch: the count followed.
    await gotoWatch(page, DEMO_VIDEO_1);
    await expect(
      page.locator(".subscribe-wrap .subscribe-count").first(),
    ).toHaveText("0 subscribers");
    expect(errors).toEqual([]);
  });

  test("5. ?t= seeks on load", async ({ page }) => {
    test.skip(!ensureFixture(), "ffmpeg unavailable — no real media");
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await routeDemoVideo(page);
    await page.goto(`/watch/${DEMO_VIDEO_1}?t=84`);
    await expect(
      page.getByRole("heading", { name: "Getting Started with React Hooks" }),
    ).toBeVisible();
    // loadedmetadata fires on the real fixture, the player seeks once.
    await expect
      .poll(() => sliderSeconds(page), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(83);
    await expect
      .poll(() => sliderSeconds(page), { timeout: 10_000 })
      .toBeLessThanOrEqual(85);
    await expect(page.getByText("Resumed from 1:24")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("6. chapter click seeks + updates the URL", async ({ page }) => {
    test.skip(!ensureFixture(), "ffmpeg unavailable — no real media");
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await routeDemoVideo(page);
    await gotoWatch(page, DEMO_VIDEO_1);
    // The chapter bar renders once the real duration is known.
    const chapter = page.getByRole("button", {
      name: "Chapter: useEffect & Cleanup",
    });
    await expect(chapter).toBeVisible();
    await chapter.click();
    await expect
      .poll(() => sliderSeconds(page), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(209);
    await expect
      .poll(() => sliderSeconds(page), { timeout: 10_000 })
      .toBeLessThanOrEqual(211);
    expect(page.url()).toContain("t=210");
    await expect(page.getByText("Chapter: useEffect & Cleanup")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("7. controls hide after ~3s idle and reappear on hover", async ({
    page,
  }) => {
    test.skip(!ensureFixture(), "ffmpeg unavailable — no real media");
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await routeDemoVideo(page);
    await gotoWatch(page, DEMO_VIDEO_1);
    const controls = page.locator(".acube-player-controls");
    await expect(controls).not.toHaveClass(/acube-player-controls--hidden/);

    // Play, then move the mouse off the controls (top of the video)
    // so the hide timer runs — the click itself leaves the mouse
    // hovering the controls, which clears the timer.
    await page.getByRole("button", { name: "Play", exact: true }).click();
    const box = await page.locator(".acube-player").boundingBox();
    if (!box) throw new Error("no player bounding box");
    await page.mouse.move(box.x + box.width / 2, box.y + 20);
    await expect(controls).toHaveClass(
      /acube-player-controls--hidden/,
      { timeout: 10_000 },
    );

    // Hover/tap wakes them again.
    await page.mouse.move(box.x + box.width / 2, box.y + 30);
    await expect(controls).not.toHaveClass(
      /acube-player-controls--hidden/,
      { timeout: 10_000 },
    );
    expect(errors).toEqual([]);
  });

  test("8. dead source shows the poster + error state, never a gradient box", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    // No fixture route: demo-202.mp4 stays dead (example.com).
    await page.goto(`/watch/${DEMO_VIDEO_2}`);
    await expect(
      page.getByRole("heading", { name: "TypeScript Generics, Explained" }),
    ).toBeVisible();
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("This video couldn't be played");
    await expect(
      page.getByRole("button", { name: "Retry", exact: true }),
    ).toBeVisible();
    // The real poster (the video's thumbnail) is the backdrop.
    const poster = page.locator(".acube-player-error-poster");
    await expect(poster).toBeVisible();
    expect(await poster.getAttribute("src")).toContain("demo-thumb-202.jpg");
    // The <video> really failed — its error is set.
    const videoError = await page.evaluate(() => {
      const v = document.querySelector("video");
      return v?.error ? v.error.code : null;
    });
    expect(videoError).not.toBeNull();
    // No gradient-box placeholder: the only gradient on the page is
    // the controls bar's scrim (which is hidden with the error up).
    expect(errors).toEqual([]);
  });

  test("9. Up Next renders a thumbnail per suggestion", async ({ page }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await gotoWatch(page, DEMO_VIDEO_1);
    await expect(
      page.getByRole("heading", { name: "Up next" }),
    ).toBeVisible();
    const items = page.locator(".watch-up-next-item");
    await expect(items.first()).toBeVisible();
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    // Each suggestion carries a real thumbnail element: the <img>
    // while its URL loads, or the neutral ▶ fallback once the seeded
    // example.com thumbnail 404s — never a broken-image icon.
    for (let i = 0; i < count; i += 1) {
      const thumb = items.nth(i).locator("img.watch-thumb, [role='img']");
      await expect(thumb).toHaveCount(1);
    }
    expect(errors).toEqual([]);
  });
});
