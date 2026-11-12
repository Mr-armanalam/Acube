// Watch playlist sidebar redesign (image-40) — Playwright
// click-through against the real API on in-memory MongoDB
// (playwright.phase5.config.ts starts it with PHASE5_SEED=1) and the
// production build. Covers what the unit tests can only mock, with
// the seeded demo data — playlist "Learning Path: Full-Stack
// Foundations" (oid 401), 4 videos on the Code Streamer channel:
//
//   1. playlist renders: header, meta, 4 items with durations and
//      per-item status (Playing now / Up next);
//   2. current item highlighted: red-border class + red ▶ + red
//      computed border colour (#e8482f);
//   3. Shuffle / Loop toggles flip state and restore (Shuffle off
//      restores playlist order);
//   4. Autoplay toggle in the meta line flips and persists to
//      localStorage across a reload, then is restored to ON;
//   5. Play all navigates to the first video in playlist order;
//   6. Save playlist posts a real private copy (verified via the
//      API) and shows the transient "✓ Saved" feedback;
//   7. View full playlist navigates to the playlist page;
//   8. seeded example.com thumbnails render the VideoThumb grey ▶
//      fallback (expected — they never resolve);
//   9. real-thumbnail rendering via a route override of the
//      watch-playlists payload (same override shape as the unit
//      tests), asserting real <img> thumbs, no fallback;
//   10. desktop + mobile screenshots of the rebuilt sidebar.
//
// Every state-changing test leaves no state behind (toggles are
// toggled back), except the saved playlist copy — the same precedent
// as watch-page.spec.ts test 1 (posted comments).
//
// Run (from apps/web):
//   pnpm test:e2e:phase5 -- watch-playlist-sidebar.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

// Learning Path videos (seedDemo.js CATALOGUE order, oids 201/202/203/206):
// 201 "Getting Started with React Hooks" 7:00, 202 "TypeScript Generics,
// Explained" 6:00, 203 "Build a REST API with Express" 9:00, 206 "MongoDB
// Aggregations Deep Dive" 10:00.
const VIDEO_1 = "507f1f77bcf86cd799430201"; // Getting Started with React Hooks, 7:00
const VIDEO_2 = "507f1f77bcf86cd799430202"; // TypeScript Generics, Explained, 6:00
const VIDEO_3 = "507f1f77bcf86cd799430203"; // Build a REST API with Express, 9:00
const VIDEO_6 = "507f1f77bcf86cd799430206"; // MongoDB Aggregations Deep Dive, 10:00
const PLAYLIST_ID = "507f1f77bcf86cd799430401";
const PLAYLIST_TITLE = "Learning Path: Full-Stack Foundations";
const AUTOPLAY_KEY = "acube:watch:autoplay";
// --accent in apps/web/src/index.css.
const ACCENT_RGB = "rgb(232, 72, 47)";

const SHOT_DIR = fileURLToPath(
  new URL("../../../docs/screenshots", import.meta.url),
);
mkdirSync(SHOT_DIR, { recursive: true });

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

async function gotoWatch(page: Page, videoId: string, query = "") {
  await page.goto(`/watch/${videoId}${query}`);
  await expect(
    page.getByRole("heading", { name: "Getting Started with React Hooks" }),
  ).toBeVisible();
}

/** The e2e user's watched video ids, from the real history endpoint.
 * Other spec files in the same suite run visit videos as the same
 * e2e user (e.g. the Autoplay spec advances onto video 202), so the
 * per-item status must be derived from real state, not assumed fresh. */
async function watchedVideoIds(page: Page): Promise<Set<string>> {
  const res = await page.request.get(
    "http://localhost:5000/video/getallhistory?page=1&limit=50",
    { headers: { Authorization: `Bearer ${mintE2EJwt()}` } },
  );
  if (!res.ok()) throw new Error(`getallhistory failed: ${res.status()}`);
  const body = (await res.json()) as {
    items?: Array<{ videoid?: string }>;
  };
  return new Set(
    (body.items ?? []).map((h) => h.videoid).filter((v): v is string => Boolean(v)),
  );
}

/** Expected "duration · status" line for a playlist item, given the
 * real watched set. The current video is always "Playing now", even
 * though visiting it created a history row. */
function expectedStatus(
  videoId: string,
  currentId: string,
  watched: Set<string>,
): string {
  if (videoId === currentId) return "Playing now";
  return watched.has(videoId) ? "✓ Watched" : "Up next";
}
async function playlistCard(page: Page) {
  const card = page.locator(".watch-playlist");
  await expect(
    card.getByRole("heading", {
      name: `Playlist · ${PLAYLIST_TITLE}`,
    }),
  ).toBeVisible();
  return card;
}

test.describe("Watch playlist sidebar (real API, seeded demo data)", () => {
  test("1. playlist renders: header, meta, 4 items with status", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    // Real watched state BEFORE visiting: other spec files may have
    // watched videos 202/203/206 as this user already.
    const watched = await watchedVideoIds(page);
    await gotoWatch(page, VIDEO_1);
    const card = await playlistCard(page);
    // Channel comes from the playlist videos' uploader; the watched
    // count is 0 or 1 depending on whether this visit already
    // recorded a history row for the current video.
    await expect(card.locator(".watch-playlist-meta")).toHaveText(
      /Code Streamer · \d \/ 4 watched · Playing 1 of 4 · Autoplay (ON|OFF)/,
    );
    const items = card.locator(".watch-playlist-item");
    await expect(items).toHaveCount(4);
    const playlistVideos = [
      { id: VIDEO_1, title: "Getting Started with React Hooks", duration: "7:00" },
      { id: VIDEO_2, title: "TypeScript Generics, Explained", duration: "6:00" },
      { id: VIDEO_3, title: "Build a REST API with Express", duration: "9:00" },
      { id: VIDEO_6, title: "MongoDB Aggregations Deep Dive", duration: "10:00" },
    ];
    for (const [i, v] of playlistVideos.entries()) {
      await expect(items.nth(i)).toContainText(v.title);
      await expect(items.nth(i)).toContainText(
        `${v.duration} · ${expectedStatus(v.id, VIDEO_1, watched)}`,
      );
    }
    // No pill buttons in the sidebar.
    await expect(card.locator(".acube-btn-secondary")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("2. current item has red border + red ▶, others have numbers", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await gotoWatch(page, VIDEO_1);
    const card = await playlistCard(page);
    const current = card.locator(
      ".watch-playlist-item--current",
    );
    await expect(current).toHaveCount(1);
    await expect(current).toContainText("Getting Started with React Hooks");
    await expect(current.locator(".watch-playlist-index")).toHaveText("▶");
    const borderColor = await current.evaluate(
      (el) => getComputedStyle(el).borderColor,
    );
    expect(borderColor).toBe(ACCENT_RGB);
    const indexColor = await current
      .locator(".watch-playlist-index")
      .evaluate((el) => getComputedStyle(el).color);
    expect(indexColor).toBe(ACCENT_RGB);
    // The other items show their playlist numbers.
    await expect(
      card.locator(".watch-playlist-item").nth(1).locator(".watch-playlist-index"),
    ).toHaveText("2");
    await expect(
      card.locator(".watch-playlist-item").nth(3).locator(".watch-playlist-index"),
    ).toHaveText("4");
    expect(errors).toEqual([]);
  });

  test("3. Shuffle / Loop toggles flip state; Shuffle off restores order", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await gotoWatch(page, VIDEO_1);
    const card = await playlistCard(page);
    const shuffle = card.getByRole("button", { name: /Shuffle (on|off)/ });
    const loop = card.getByRole("button", { name: /Loop (on|off)/ });
    await expect(shuffle).toHaveAttribute("aria-pressed", "false");
    await expect(loop).toHaveAttribute("aria-pressed", "false");

    await shuffle.click();
    await expect(
      card.getByRole("button", { name: "Shuffle on" }),
    ).toHaveAttribute("aria-pressed", "true");

    await loop.click();
    await expect(
      card.getByRole("button", { name: "Loop on" }),
    ).toHaveAttribute("aria-pressed", "true");

    // Toggle back off — suite leaves no state.
    await shuffle.click();
    await expect(
      card.getByRole("button", { name: "Shuffle off" }),
    ).toHaveAttribute("aria-pressed", "false");
    await loop.click();
    await expect(
      card.getByRole("button", { name: "Loop off" }),
    ).toHaveAttribute("aria-pressed", "false");
    // Playlist order is restored once Shuffle is off.
    const first = card.locator(".watch-playlist-item").first();
    await expect(first).toContainText("Getting Started with React Hooks");
    expect(errors).toEqual([]);
  });

  test("4. Autoplay toggle in the meta line persists across reload", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await gotoWatch(page, VIDEO_1);
    const card = await playlistCard(page);
    const autoplay = card.getByRole("button", { name: /Autoplay (ON|OFF)/ });
    await expect(autoplay).toHaveText("Autoplay ON");

    await autoplay.click();
    await expect(
      card.getByRole("button", { name: "Autoplay OFF" }),
    ).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), AUTOPLAY_KEY)).toBe(
      "false",
    );

    await page.reload();
    const cardAfter = await playlistCard(page);
    await expect(
      cardAfter.getByRole("button", { name: "Autoplay OFF" }),
    ).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), AUTOPLAY_KEY)).toBe(
      "false",
    );

    // Restore ON — suite leaves no state.
    await cardAfter.getByRole("button", { name: "Autoplay OFF" }).click();
    await expect(
      cardAfter.getByRole("button", { name: "Autoplay ON" }),
    ).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), AUTOPLAY_KEY)).toBe(
      "true",
    );
    expect(errors).toEqual([]);
  });

  test("5. Play all navigates to the first video in playlist order", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await page.goto(`/watch/${VIDEO_2}`);
    await expect(
      page.getByRole("heading", { name: "TypeScript Generics, Explained" }),
    ).toBeVisible();
    const card = await playlistCard(page);
    await expect(card.locator(".watch-playlist-meta")).toHaveText(
      /Playing 2 of 4/,
    );
    await card.getByRole("link", { name: /Play all/ }).click();
    await expect(page).toHaveURL(new RegExp(`/watch/${VIDEO_1}$`));
    await expect(
      page.getByRole("heading", { name: "Getting Started with React Hooks" }),
    ).toBeVisible();
    const cardAfter = await playlistCard(page);
    await expect(cardAfter.locator(".watch-playlist-meta")).toHaveText(
      /Playing 1 of 4/,
    );
    expect(errors).toEqual([]);
  });

  test("6. Save playlist posts a real private copy and shows ✓ Saved", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await gotoWatch(page, VIDEO_1);
    const card = await playlistCard(page);
    const save = card.getByRole("button", { name: /Save playlist/ });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(
      card.getByRole("button", { name: /Saved/ }),
    ).toBeVisible();
    // The copy exists server-side (owner-only list, authed as the
    // e2e user) — not just a transient label.
    const res = await page.request.get("http://localhost:5000/studio/playlists", {
      headers: { Authorization: `Bearer ${mintE2EJwt()}` },
    });
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as
      | { items?: Array<{ _id?: string; title?: string }> }
      | Array<{ _id?: string; title?: string }>;
    const lists = Array.isArray(body) ? body : (body.items ?? []);
    const copy = lists.find((p) => p.title === `${PLAYLIST_TITLE} (copy)`);
    expect(copy).toBeDefined();
    // Suite leaves no state: delete the copy again (owner-only
    // DELETE), so later specs see the same playlist list as before.
    const del = await page.request.delete(
      `http://localhost:5000/studio/playlists/${copy?._id}`,
      { headers: { Authorization: `Bearer ${mintE2EJwt()}` } },
    );
    expect(del.ok()).toBe(true);
    const after = await page.request.get(
      "http://localhost:5000/studio/playlists",
      { headers: { Authorization: `Bearer ${mintE2EJwt()}` } },
    );
    const afterBody = (await after.json()) as {
      items?: Array<{ title?: string }>;
    };
    expect(
      (afterBody.items ?? []).some(
        (p) => p.title === `${PLAYLIST_TITLE} (copy)`,
      ),
    ).toBe(false);
    expect(errors).toEqual([]);
  });

  test("7. View full playlist navigates to the playlist page", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await gotoWatch(page, VIDEO_1);
    const card = await playlistCard(page);
    await card.getByRole("link", { name: "View full playlist" }).click();
    await expect(page).toHaveURL(new RegExp(`/playlist/${PLAYLIST_ID}$`));
    await expect(
      page.getByRole("heading", { name: PLAYLIST_TITLE }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("8. seeded example.com thumbnails render the grey ▶ fallback", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await gotoWatch(page, VIDEO_1);
    const card = await playlistCard(page);
    // All 4 seeded thumbs are example.com placeholders that never
    // resolve — the VideoThumb fallback must render instead of a
    // broken-image icon.
    const fallbacks = card.locator('[aria-label="Video thumbnail unavailable"]');
    await expect(fallbacks).toHaveCount(4);
    await expect(card.locator("img.watch-playlist-thumb")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("9. real thumbnails render as <img> when the payload carries them", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    // Same override shape as the unit tests: rewrite the
    // watch-playlists payload so every video carries a resolvable
    // thumbnail (a data-URI image — deterministic, no network).
    const thumb =
      "data:image/svg+xml," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#e8482f"/></svg>`,
      );
    await page.route("**/watch/*/playlists", async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as {
        items?: Array<{
          videos?: Array<Record<string, unknown>>;
          videoIds?: string[];
        }>;
      };
      for (const pl of body.items ?? []) {
        for (const v of pl.videos ?? []) {
          v.thumbnailUrl = thumb;
          v.thumbnail = thumb;
        }
      }
      await route.fulfill({ response: res, json: body });
    });
    await gotoWatch(page, VIDEO_1);
    const card = await playlistCard(page);
    const imgs = card.locator("img.watch-playlist-thumb");
    await expect(imgs).toHaveCount(4);
    for (const img of await imgs.all()) {
      expect(await img.getAttribute("src")).toContain("data:image/svg+xml");
    }
    await expect(
      card.locator('[aria-label="Video thumbnail unavailable"]'),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("10. desktop + mobile screenshots of the rebuilt sidebar", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await page.setViewportSize({ width: 1280, height: 850 });
    await gotoWatch(page, VIDEO_1);
    const card = await playlistCard(page);
    await card.screenshot({
      path: `${SHOT_DIR}/phase5-watch-playlist-sidebar-desktop.png`,
    });
    await page.screenshot({
      path: `${SHOT_DIR}/phase5-watch-playlist-sidebar-full-desktop.png`,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const cardMobile = await playlistCard(page);
    await cardMobile.screenshot({
      path: `${SHOT_DIR}/phase5-watch-playlist-sidebar-mobile.png`,
    });
    expect(errors).toEqual([]);
  });
});
