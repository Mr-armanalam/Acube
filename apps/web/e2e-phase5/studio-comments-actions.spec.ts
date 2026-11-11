// Studio Comments actions + pagination — Playwright e2e (Phase 5
// config: production build on :4173 + real API on :5000 with
// PHASE5_SEED=1; the seed holds 11 demo comments and 11 videos for the
// demo channel, Code Streamer).
//
// The session is a minted JWT for the demo channel owner (same pattern
// as content-cleanup.spec.ts — the secret is read from
// apps/api/e2e-server.mjs at runtime, never copied or printed).
//
// Tests run in declaration order (workers: 1, fullyParallel: false).
// The last test intentionally deletes the seeded oldest comment — it
// must stay last: every earlier test creates its own data and cleans
// up after itself, so the seed counts hold until then.
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SHOT_DIR = fileURLToPath(
  new URL("../../../docs/screenshots", import.meta.url),
);
mkdirSync(SHOT_DIR, { recursive: true });
const shot = (name: string) => path.join(SHOT_DIR, name);

const API = "http://localhost:5000";
const DEMO_USER_ID = "507f1f77bcf86cd799430001";

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

function mintDemoJwt(): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      id: DEMO_USER_ID,
      sub: "demo",
      name: "Code Streamer",
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

async function seedDemoSession(page: Page) {
  const token = mintDemoJwt();
  await page.addInitScript((t: string) => {
    localStorage.setItem(
      "Profile",
      JSON.stringify({
        result: {
          _id: "507f1f77bcf86cd799430001",
          name: "Code Streamer",
          username: "codestreamer",
          email: "demo-channel-codestreamer@demo.acube.test",
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

function apiContext(request: APIRequestContext) {
  const token = mintDemoJwt();
  return {
    headers: { Authorization: `Bearer ${token}` },
    request,
  };
}

async function studioCommentsTotal(request: APIRequestContext): Promise<number> {
  const { headers } = apiContext(request);
  const res = await request.get(`${API}/studio/comments?page=1&limit=10&sort=newest`, { headers });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.total as number;
}

async function firstLiveVideoId(request: APIRequestContext): Promise<string> {
  const { headers } = apiContext(request);
  const res = await request.get(`${API}/studio/videos?page=1&limit=10`, { headers });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const live = body.items.find((v: { deletedAt?: string | null }) => v.deletedAt == null);
  if (!live) throw new Error("no live demo video in the seed");
  return live._id as string;
}

const rowFor = (page: Page, text: string) =>
  page.locator("table tbody tr", { hasText: text }).first();
const rowCount = (page: Page) => page.locator("table tbody tr").count();
const pagerText = (page: Page, label: string) =>
  page.locator(`nav[aria-label="${label}"] span[aria-current="page"]`).textContent();

test.describe("Studio Comments actions + pagination e2e", () => {
  test.use({ viewport: { width: 1280, height: 850 } });

  test("1. Comments pagination: 10 rows, Next → 1 row, Previous returns", async ({ page, request }) => {
    const errors = collectPageErrors(page);
    await seedDemoSession(page);
    expect(await studioCommentsTotal(request)).toBe(11);
    await page.goto("/studio/comments");
    await expect(page.getByRole("heading", { name: "Comments" })).toBeVisible();
    await expect(rowFor(page, "Getting Started")).toBeVisible();
    expect(await rowCount(page)).toBe(10);
    expect((await pagerText(page, "Comments pages"))?.trim()).toBe("Page 1 of 2");
    await page.screenshot({ path: shot("phase5-studio-pagination-comments-p1.png") });
    await page.screenshot({ path: shot("phase5-comments-actions-desktop.png") });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.locator('nav[aria-label="Comments pages"] span[aria-current="page"]')).toHaveText("Page 2 of 2");
    expect(await rowCount(page)).toBe(1);
    await page.screenshot({ path: shot("phase5-studio-pagination-comments-p2.png") });
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await expect(page.locator('nav[aria-label="Comments pages"] span[aria-current="page"]')).toHaveText("Page 1 of 2");
    expect(await rowCount(page)).toBe(10);
    expect(errors).toEqual([]);
  });

  test("2. Content pagination: 10 rows, Next → 1 row, Previous returns", async ({ page }) => {
    const errors = collectPageErrors(page);
    await seedDemoSession(page);
    await page.goto("/studio/content");
    await expect(page.getByRole("heading", { name: "Channel content" })).toBeVisible();
    expect(await rowCount(page)).toBe(10);
    expect((await pagerText(page, "Content pages"))?.trim()).toBe("Page 1 of 2");
    await page.screenshot({ path: shot("phase5-studio-pagination-content-p1.png") });
    const firstPageFirstTitle = await page.locator("table tbody tr").first().textContent();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.locator('nav[aria-label="Content pages"] span[aria-current="page"]')).toHaveText("Page 2 of 2");
    expect(await rowCount(page)).toBe(1);
    const secondPageTitle = await page.locator("table tbody tr").first().textContent();
    expect(secondPageTitle).not.toBe(firstPageFirstTitle);
    await page.screenshot({ path: shot("phase5-studio-pagination-content-p2.png") });
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await expect(page.locator('nav[aria-label="Content pages"] span[aria-current="page"]')).toHaveText("Page 1 of 2");
    expect(await rowCount(page)).toBe(10);
    expect(errors).toEqual([]);
  });

  test("3. Heart toggles the glyph and survives a page change", async ({ page }) => {
    const errors = collectPageErrors(page);
    await seedDemoSession(page);
    await page.goto("/studio/comments");
    await expect(rowFor(page, "Getting Started")).toBeVisible();
    const firstRow = page.locator("table tbody tr").first();
    const heart = firstRow.getByRole("button", { name: /Heart comment by/ });
    await expect(heart).toHaveAttribute("aria-pressed", "false");
    await expect(heart).toHaveText("♡");
    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", "true");
    await expect(heart).toHaveText("♥");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.locator('nav[aria-label="Comments pages"] span[aria-current="page"]')).toHaveText("Page 2 of 2");
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await expect(page.locator('nav[aria-label="Comments pages"] span[aria-current="page"]')).toHaveText("Page 1 of 2");
    const heartAgain = page.locator("table tbody tr").first().getByRole("button", { name: /Heart comment by/ });
    await expect(heartAgain).toHaveAttribute("aria-pressed", "true");
    await expect(heartAgain).toHaveText("♥");
    expect(errors).toEqual([]);
  });

  test("4. Delete removes a row created for the test", async ({ page, request }) => {
    const errors = collectPageErrors(page);
    const { headers } = apiContext(request);
    const videoid = await firstLiveVideoId(request);
    const body = `E2E delete-me ${Date.now()}`;
    const created = await request.post(`${API}/comment/post`, {
      headers,
      data: { videoid, userid: DEMO_USER_ID, commentbody: body, usercommented: "Code Streamer" },
    });
    expect(created.status()).toBe(200);
    expect(await studioCommentsTotal(request)).toBe(12);
    await seedDemoSession(page);
    await page.goto("/studio/comments");
    await expect(rowFor(page, body)).toBeVisible();
    await rowFor(page, body).getByRole("button", { name: "Delete", exact: true }).click();
    await expect(rowFor(page, body)).toHaveCount(0);
    expect(await studioCommentsTotal(request)).toBe(11);
    expect((await pagerText(page, "Comments pages"))?.trim()).toBe("Page 1 of 2");
    expect(errors).toEqual([]);
  });

  test("5. Reply posts and appears under its parent, then cleans up", async ({ page, request }) => {
    const errors = collectPageErrors(page);
    const parentBody = "Grid finally makes sense. More CSS, please!";
    const replyBody = `E2E reply ${Date.now()}`;
    await seedDemoSession(page);
    await page.goto("/studio/comments");
    const parentRow = rowFor(page, parentBody);
    await expect(parentRow).toBeVisible();
    await parentRow.getByRole("button", { name: "Reply", exact: true }).click();
    const composer = page.getByLabel("Write a reply");
    await expect(composer).toBeVisible();
    await composer.fill(replyBody);
    await page.locator("form", { has: page.getByLabel("Write a reply") }).getByRole("button", { name: "Reply", exact: true }).click();
    // The composer closes on success and the reply threads directly
    // under its parent (↳ prefix), before the next top-level comment.
    await expect(page.getByLabel("Write a reply")).toHaveCount(0);
    const replyRow = rowFor(page, replyBody);
    await expect(replyRow).toBeVisible();
    expect(await replyRow.textContent()).toContain("↳");
    const rows = await page.locator("table tbody tr").allTextContents();
    const parentIdx = rows.findIndex((t) => t.includes(parentBody));
    const replyIdx = rows.findIndex((t) => t.includes(replyBody));
    expect(replyIdx).toBe(parentIdx + 1);
    expect(await studioCommentsTotal(request)).toBe(12);
    // Clean up: delete the reply (a leaf), restoring the seed total.
    await replyRow.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(rowFor(page, replyBody)).toHaveCount(0);
    expect(await studioCommentsTotal(request)).toBe(11);
    expect(errors).toEqual([]);
  });

  test("6. Deleting the only row of page 2 falls back to page 1", async ({ page, request }) => {
    const errors = collectPageErrors(page);
    await seedDemoSession(page);
    await page.goto("/studio/comments");
    await expect(rowFor(page, "Getting Started")).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.locator('nav[aria-label="Comments pages"] span[aria-current="page"]')).toHaveText("Page 2 of 2");
    expect(await rowCount(page)).toBe(1);
    const onlyRow = page.locator("table tbody tr").first();
    const onlyRowText = (await onlyRow.textContent()) ?? "";
    expect(onlyRowText.length).toBeGreaterThan(0);
    await onlyRow.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.locator('nav[aria-label="Comments pages"] span[aria-current="page"]')).toHaveText("Page 1 of 1");
    expect(await rowCount(page)).toBe(10);
    expect(await studioCommentsTotal(request)).toBe(10);
    expect(errors).toEqual([]);
  });

  test("7. Restyled actions read Reply · ♡ · Delete on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = collectPageErrors(page);
    await seedDemoSession(page);
    await page.goto("/studio/comments");
    await expect(rowFor(page, "Getting Started")).toBeVisible();
    const firstRow = page.locator("table tbody tr").first();
    const buttons = firstRow.getByRole("button");
    await expect(buttons.nth(0)).toHaveText("Reply");
    await expect(buttons.nth(1)).toHaveText("♡");
    await expect(buttons.nth(2)).toHaveText("Delete");
    // No pill classes anywhere in the Actions column.
    const classes = await firstRow.locator("td").last().locator("button").evaluateAll(
      (els) => els.map((el) => el.className),
    );
    for (const c of classes) expect(c).not.toContain("acube-btn");
    await page.screenshot({ path: shot("phase5-comments-actions-mobile.png") });
    expect(errors).toEqual([]);
  });
});
