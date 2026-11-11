// Content cleanup verification — headless Chromium against the
// production build + the real API on in-memory MongoDB, seeded with
// Phase 5 Studio data (playwright.phase5.config.ts starts the API with
// PHASE5_SEED=1). Covers what phase5.spec.ts does NOT: Change
// visibility, Delete (soft-delete) + Restore, View analytics to the
// per-video view (?video=<id>) with real totals, the gradient
// thumbnail, and mobile no-overflow. Run SEPARATELY from
// phase5.spec.ts: this spec renames the seeded video (edit-persist
// test), and phase5.spec.ts asserts the original title — each
// invocation restarts the servers with a fresh seed, so run:
//   pnpm exec playwright test -c playwright.phase5.config.ts e2e-phase5/content-cleanup.spec.ts
// (from apps/web). No real credentials: the JWT secret is read from
// apps/api/e2e-server.mjs at runtime, never copied or printed.
import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SHOT_DIR = fileURLToPath(
  new URL("../../../docs/screenshots", import.meta.url),
);
mkdirSync(SHOT_DIR, { recursive: true });
const shot = (name: string) => path.join(SHOT_DIR, name);

// Must match apps/api/e2e-server.mjs (PHASE5_SEED=1).
const SEEDED_VIDEO_ID = "507f1f77bcf86cd799439011";
const SEEDED_VIDEO_TITLE = "E2E Smoke Video";
const EDITED_TITLE = "E2E Smoke Video (Cleanup Edit)";
const FAKE_USER_ID = "507f1f77bcf86cd799439012";

// Read at runtime from the server file — never hardcode, never log.
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
    createHmac("sha256", e2eJwtSecret())
      .update(`${header}.${payload}`)
      .digest(),
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

async function openRowMenu(page: Page, title: string) {
  await page
    .getByRole("button", { name: `More actions for ${title}` })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Edit details" }),
  ).toBeVisible();
}

test.describe("Acube Content cleanup e2e", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("1. Content table matches preview image 20", async ({ page }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await page.goto("/studio/content");
    await expect(page.getByRole("heading", { name: "Content" })).toBeVisible();
    await expect(page.getByText(SEEDED_VIDEO_TITLE)).toBeVisible();
    // Preview image 20 columns: Video / Visibility / Date / Views /
    // Likes (+ slim checkbox + icon-only actions columns, no labels).
    const table = page.getByRole("table");
    const headers = await table
      .getByRole("columnheader")
      .allTextContents();
    expect(headers.map((h) => h.trim())).toEqual([
      "",
      "Video",
      "Visibility",
      "Date",
      "Views",
      "Likes",
      "",
    ]);
    // No per-row buttons / dropdown / inline edit (old UI, image 19)
    // and no inline edit inputs (old UI, image 21).
    await expect(
      page.getByRole("button", { name: "Edit details" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "View analytics" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
    await expect(
      page.getByLabel(`Visibility for ${SEEDED_VIDEO_TITLE}`),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: `Row actions for ${SEEDED_VIDEO_TITLE}` }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `More actions for ${SEEDED_VIDEO_TITLE}` }),
    ).toBeVisible();
    // Thumbnail gradient renders when there is no thumbnail URL: the
    // seeded video has none, so VideoThumb renders the ▶ span with a
    // deterministic linear-gradient background, never an <img>.
    const thumb = page.locator(".studio-row-thumb").first();
    await expect(thumb).toBeVisible();
    await expect(thumb).toHaveText("▶");
    expect(await thumb.evaluate((el) => el.tagName)).toBe("SPAN");
    expect(await thumb.evaluate((el) => el.outerHTML)).toContain(
      "linear-gradient",
    );
    await expect(page.locator(".studio-video-cell img")).toHaveCount(0);
    // Honest restore wording: "restorable", never a 30-day claim.
    await expect(page.getByText(/soft-delete, restorable/)).toBeVisible();
    expect(await page.content()).not.toContain("30-day");
    expect(await page.content()).not.toContain("30 days");
    expect(errors).toEqual([]);
    await page.screenshot({ path: shot("phase5-content-clean-full.png") });
  });

  test("2. Row menu: Change visibility persists", async ({ page }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await page.goto("/studio/content");
    await expect(page.getByText(SEEDED_VIDEO_TITLE)).toBeVisible();
    await openRowMenu(page, SEEDED_VIDEO_TITLE);
    await expect(
      page.getByRole("menuitem", { name: "Change visibility" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "View analytics" }),
    ).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
    await page.screenshot({ path: shot("phase5-content-menu-full.png") });
    await page.getByRole("menuitem", { name: "Change visibility" }).click();
    await expect(
      page.getByRole("menuitemradio", { name: "Private" }),
    ).toBeVisible();
    await page.getByRole("menuitemradio", { name: "Private" }).click();
    // Pill flips to Private; the row stays put.
    const row = page.getByText(SEEDED_VIDEO_TITLE).locator("xpath=ancestor::tr");
    await expect(row.getByText("Private").first()).toBeVisible();
    // Change it back so later tests see the public video.
    await openRowMenu(page, SEEDED_VIDEO_TITLE);
    await page.getByRole("menuitem", { name: "Change visibility" }).click();
    await page.getByRole("menuitemradio", { name: "Public" }).click();
    await expect(row.getByText("Public").first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("3. View analytics opens the per-video view with real totals", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    // One real view first: the Watch page PATCHes /video/view/:id,
    // which records a deduped ViewEvent for this viewer/video/day.
    await page.goto(`/watch/${SEEDED_VIDEO_ID}`);
    await expect(
      page.getByRole("heading", { name: SEEDED_VIDEO_TITLE }),
    ).toBeVisible();
    await page.goto("/studio/content");
    await expect(page.getByText(SEEDED_VIDEO_TITLE)).toBeVisible();
    await openRowMenu(page, SEEDED_VIDEO_TITLE);
    await page.getByRole("menuitem", { name: "View analytics" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/studio/analytics\\?video=${SEEDED_VIDEO_ID}$`),
    );
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    await expect(page.getByText(/one video/)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: SEEDED_VIDEO_TITLE }),
    ).toBeVisible();
    // Totals from the one recorded view: 1 view, 0 completions, 0 min.
    const stats = await page.locator(".studio-stat-grid").innerText();
    expect(stats).toContain("VIEWS (28D)");
    expect(stats).toContain("1");
    expect(stats).toContain("COMPLETIONS");
    expect(stats).toContain("0");
    expect(stats).toContain("WATCH TIME");
    expect(stats).toContain("0 min");
    expect(stats).toContain("BEST DAY");
    expect(stats).toContain(new Date().toISOString().slice(0, 10));
    await expect(page.getByText("All-time: 1 views · 0 likes.")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("4. Delete soft-deletes and Restore brings the row back", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await page.goto("/studio/content");
    await expect(page.getByText(SEEDED_VIDEO_TITLE)).toBeVisible();
    await openRowMenu(page, SEEDED_VIDEO_TITLE);
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.getByText("Delete this video?")).toBeVisible();
    // Indefinite restore wording, no 30-day claim anywhere in the menu.
    await expect(
      page.getByText("Soft-delete — restorable any time from this menu."),
    ).toBeVisible();
    const menuText = await page.getByRole("menu").innerText();
    expect(menuText).not.toContain("30-day");
    expect(menuText).not.toContain("30 days");
    await page.getByRole("menuitem", { name: "Confirm delete" }).click();
    // The row STAYS listed (owner-only view) with a Deleted badge.
    const row = page.getByText(SEEDED_VIDEO_TITLE).locator("xpath=ancestor::tr");
    await expect(row.getByText("Deleted")).toBeVisible();
    await openRowMenu(page, SEEDED_VIDEO_TITLE);
    await expect(page.getByRole("menuitem", { name: "Restore" })).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Delete" }),
    ).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Restore" }).click();
    await expect(row.getByText("Deleted")).toHaveCount(0);
    await openRowMenu(page, SEEDED_VIDEO_TITLE);
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("5. Edit details modal saves and the title persists", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await page.goto("/studio/content");
    await expect(page.getByText(SEEDED_VIDEO_TITLE)).toBeVisible();
    await openRowMenu(page, SEEDED_VIDEO_TITLE);
    await page.getByRole("menuitem", { name: "Edit details" }).click();
    const dialog = page.getByRole("dialog", {
      name: `Edit details for ${SEEDED_VIDEO_TITLE}`,
    });
    await expect(dialog).toBeVisible();
    // The modal edits — the row itself never shows inputs (image 21).
    await expect(page.locator("tbody input[type='text']")).toHaveCount(0);
    await page.screenshot({
      path: shot("phase5-content-edit-modal-full.png"),
    });
    await page.getByLabel("Video title").fill(EDITED_TITLE);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(EDITED_TITLE)).toBeVisible();
    await page.goto(`/watch/${SEEDED_VIDEO_ID}`);
    await expect(
      page.getByRole("heading", { name: EDITED_TITLE }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("Acube Content cleanup mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("6. Content has no horizontal overflow at 390px", async ({ page }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await page.goto("/studio/content");
    // Title may be the edited one if test 5 ran first in this file —
    // the overflow assertions do not depend on it.
    await expect(page.getByRole("heading", { name: "Content" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
    await page.screenshot({ path: shot("phase5-content-clean-mobile.png") });
    // Menu + modal on mobile too, with the same overflow check.
    const rowButton = page
      .getByRole("button", { name: /More actions for / })
      .first();
    await rowButton.click();
    await expect(
      page.getByRole("menuitem", { name: "Edit details" }),
    ).toBeVisible();
    const menuOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(menuOverflow).toBeLessThanOrEqual(390);
    await page.screenshot({ path: shot("phase5-content-menu-mobile.png") });
    await page.getByRole("menuitem", { name: "Edit details" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const modalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(modalOverflow).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: shot("phase5-content-edit-modal-mobile.png"),
    });
    expect(errors).toEqual([]);
  });
});
