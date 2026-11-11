// Watch details + comments redesign (image-37) — Playwright
// click-through against the real API on in-memory MongoDB
// (playwright.phase5.config.ts starts it with PHASE5_SEED=1) and the
// production build. Covers what the unit tests can only mock, with
// the seeded demo data:
//
//   1. post a top-level comment and see it (still there after reload);
//   2. video Like pill: like then dislike toggles with real counts;
//   3. comment like/dislike toggle (text actions, no dislike count);
//   4. reply threads under the parent (seeded thread + posted reply);
//   5. sort switching Top <-> Newest (pinned stays first);
//   6. subscribe toggle (normalised first, toggled back off);
//   7. description Show more / Show less (long description via a
//      route override — the seeded description is short);
//   8. "··· More" menu: Copy link, Copy link at current time (real
//      clipboard), Thanks posts a real comment;
//   9. layout: no pill-styled buttons in the details/comments section;
//  10. desktop + mobile screenshots of the rebuilt section.
//
// Every state-changing test leaves no state behind (toggles are
// toggled back), except posted comments — the same precedent as
// watch-page.spec.ts test 1.
//
// Run (from apps/web):
//   pnpm test:e2e:phase5 -- watch-details-comments.spec.ts
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
// Video 201 "Getting Started with React Hooks" (420s, chapters
// 0/90/210/330) on the Code Streamer channel (oid 1).
const DEMO_VIDEO_1 = "507f1f77bcf86cd799430201";

const SHOT_DIR = fileURLToPath(
  new URL("../../../docs/screenshots", import.meta.url),
);
mkdirSync(SHOT_DIR, { recursive: true });

const TOP_COMMENT = "This finally made hooks click for me — thank you!";
const PINNED_COMMENT =
  "Pinned by the creator: the companion repo is linked in the description.";

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
  await expect(page.getByText(TOP_COMMENT)).toBeVisible();
}

/** Order of the top-level comment bodies in the rendered list. */
async function rootCommentOrder(page: Page): Promise<string> {
  return (await page.locator(".watch-comments").innerText()).valueOf();
}

test.describe("Watch details + comments (real API, seeded demo data)", () => {
  test("1. post a top-level comment and see it — still there after reload", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await gotoWatch(page, DEMO_VIDEO_1);
    await expect(
      page.getByRole("heading", { name: /Comments · \d+/ }),
    ).toBeVisible();
    const text = `E2E details comment ${Date.now()}`;
    await page
      .getByPlaceholder("Be specific — what part helped?")
      .fill(text);
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(page.getByText(text)).toBeVisible();
    await page.reload();
    await expect(page.getByText(text)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("2. video Like pill: like then dislike toggles with real counts", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await gotoWatch(page, DEMO_VIDEO_1);
    const like = page.getByRole("button", {
      name: "Like this video",
      exact: true,
    });
    const dislike = page.getByRole("button", {
      name: "Dislike this video",
      exact: true,
    });
    // Normalise: another run of this spec may have left a like behind.
    if ((await like.getAttribute("aria-pressed")) === "true") {
      await like.click();
      await expect(like).toHaveAttribute("aria-pressed", "false");
    }
    const countOf = async () => Number((await like.textContent())?.trim() ?? -1);
    const before = await countOf();

    await like.click();
    await expect(like).toHaveAttribute("aria-pressed", "true");
    expect(await countOf()).toBe(before + 1);

    // Dislike switches sides: like back down, dislike on.
    await dislike.click();
    await expect(dislike).toHaveAttribute("aria-pressed", "true");
    await expect(like).toHaveAttribute("aria-pressed", "false");
    expect(await countOf()).toBe(before);

    // Dislike again removes it — suite leaves no state.
    await dislike.click();
    await expect(dislike).toHaveAttribute("aria-pressed", "false");
    expect(await countOf()).toBe(before);
    expect(errors).toEqual([]);
  });

  test("3. comment like/dislike toggle — text actions, no dislike count", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await gotoWatch(page, DEMO_VIDEO_1);
    const commentBody = page
      .getByText(TOP_COMMENT)
      .locator("xpath=ancestor::div[contains(@class, 'watch-comment-body')][1]");
    const like = commentBody.getByRole("button", {
      name: "Like comment by demoviewer03",
      exact: true,
    });
    const dislike = commentBody.getByRole("button", {
      name: "Dislike comment by demoviewer03",
      exact: true,
    });
    // The dislike control shows no count (preview): only the icon.
    expect((await dislike.textContent())?.trim()).toBe("");
    // Normalise.
    if ((await like.getAttribute("aria-pressed")) === "true") {
      await like.click();
      await expect(like).toHaveAttribute("aria-pressed", "false");
    }
    expect(Number((await like.textContent())?.trim() ?? -1)).toBe(0);

    await like.click();
    await expect(like).toHaveAttribute("aria-pressed", "true");
    expect(Number((await like.textContent())?.trim() ?? -1)).toBe(1);

    await dislike.click();
    await expect(dislike).toHaveAttribute("aria-pressed", "true");
    await expect(like).toHaveAttribute("aria-pressed", "false");
    expect(Number((await like.textContent())?.trim() ?? -1)).toBe(0);

    await dislike.click();
    await expect(dislike).toHaveAttribute("aria-pressed", "false");
    expect(errors).toEqual([]);
  });

  test("4. reply threads under the parent — seeded thread + posted reply", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await gotoWatch(page, DEMO_VIDEO_1);
    await expect(
      page.getByText("Same — the useEffect part was the missing piece for me."),
    ).toBeVisible();
    await expect(
      page.getByText("Exactly, the cleanup example helped a lot."),
    ).toBeVisible();

    const parentBody = page
      .getByText(TOP_COMMENT)
      .locator("xpath=ancestor::div[contains(@class, 'watch-comment-body')][1]");
    await parentBody
      .getByRole("button", { name: "Reply", exact: true })
      .click();
    const replyText = `E2E details reply ${Date.now()}`;
    await page.getByLabel("Write a reply").fill(replyText);
    await page.getByRole("button", { name: "Post reply" }).click();
    await expect(page.getByText(replyText)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("5. sort switching Top <-> Newest, pinned stays first", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await gotoWatch(page, DEMO_VIDEO_1);
    const probe = `E2E sort probe ${Date.now()}`;
    await page
      .getByPlaceholder("Be specific — what part helped?")
      .fill(probe);
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(page.getByText(probe)).toBeVisible();

    // Give the seeded top comment a like so Top and Newest disagree:
    // Top = pinned, liked top comment, probe; Newest = pinned, probe,
    // top comment.
    const commentBody = page
      .getByText(TOP_COMMENT)
      .locator("xpath=ancestor::div[contains(@class, 'watch-comment-body')][1]");
    const like = commentBody.getByRole("button", {
      name: "Like comment by demoviewer03",
      exact: true,
    });
    if ((await like.getAttribute("aria-pressed")) !== "true") {
      await like.click();
      await expect(like).toHaveAttribute("aria-pressed", "true");
    }

    const sortButton = page.getByRole("button", { name: "Sort comments" });
    await expect(sortButton).toHaveText("Sort: Top ▾");
    let text = await rootCommentOrder(page);
    expect(text.indexOf(PINNED_COMMENT)).toBeLessThan(text.indexOf(TOP_COMMENT));
    expect(text.indexOf(TOP_COMMENT)).toBeLessThan(text.indexOf(probe));

    await sortButton.click();
    await page.getByRole("menuitemradio", { name: "Newest" }).click();
    await expect(sortButton).toHaveText("Sort: Newest ▾");
    text = await rootCommentOrder(page);
    expect(text.indexOf(PINNED_COMMENT)).toBeLessThan(text.indexOf(probe));
    expect(text.indexOf(probe)).toBeLessThan(text.indexOf(TOP_COMMENT));

    // Back to Top, and unlike — suite leaves no state.
    await sortButton.click();
    await page.getByRole("menuitemradio", { name: "Top" }).click();
    await expect(sortButton).toHaveText("Sort: Top ▾");
    await like.click();
    await expect(like).toHaveAttribute("aria-pressed", "false");
    expect(errors).toEqual([]);
  });

  test("6. subscribe toggle (normalised, toggled back off)", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await gotoWatch(page, DEMO_VIDEO_1);
    const subscribe = page.getByRole("button", {
      name: /^(Subscribe|Subscribed) to Code Streamer$/,
    });
    await expect(subscribe).toBeVisible();
    const count = page.locator(".subscribe-wrap .subscribe-count").first();
    // Normalise: unsubscribe first if a previous run left it on.
    if ((await subscribe.textContent())?.trim() === "Subscribed") {
      await subscribe.click();
      await expect(subscribe).toHaveText("Subscribe");
    }
    await expect(count).toHaveText("0 subscribers");

    await subscribe.click();
    await expect(subscribe).toHaveText("Subscribed");
    await expect(count).toHaveText("1 subscriber");

    await subscribe.click();
    await expect(subscribe).toHaveText("Subscribe");
    await expect(count).toHaveText("0 subscribers");
    expect(errors).toEqual([]);
  });

  test("7. description Show more / Show less (long description)", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    // The seeded description is short, so the toggle never renders —
    // lengthen it via a route override (the video DTO is the only
    // thing changed; everything else comes from the real API).
    const longDescription =
      "Learn hooks from scratch in this full walkthrough. We cover useState, " +
      "useEffect, and custom hooks, then build a small project end to end so " +
      "every idea lands in real code you can run yourself afterwards.";
    await page.route(`**/video/${DEMO_VIDEO_1}`, async (route) => {
      const response = await route.fetch();
      const json = (await response.json()) as Record<string, unknown>;
      json.description = longDescription;
      await route.fulfill({ response, json });
    });
    await gotoWatch(page, DEMO_VIDEO_1);
    const description = page.locator(".watch-description");
    // Plain text, no card box; truncated at 140 chars.
    await expect(description.locator(".acube-card")).toHaveCount(0);
    await expect(description).toContainText("Learn hooks from scratch");
    expect(await description.innerText()).not.toContain(
      "every idea lands in real code",
    );
    await page.getByRole("button", { name: "Show more" }).click();
    await expect(description).toContainText("every idea lands in real code");
    await page.getByRole("button", { name: "Show less" }).click();
    expect(await description.innerText()).not.toContain(
      "every idea lands in real code",
    );
    expect(errors).toEqual([]);
  });

  test("8. More menu: Copy link, Copy link at current time, Thanks", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await seedFakeSession(page);
    // ?t=84 so "current time" has a real position to stamp.
    await gotoWatch(page, DEMO_VIDEO_1, "?t=84");
    await page.getByRole("button", { name: "··· More" }).click();
    await page.getByRole("menuitem", { name: "Copy link at current time" }).click();
    await expect(
      page.getByRole("menuitem", { name: "✓ Link copied" }),
    ).toBeVisible();
    const timed = await page.evaluate(() => navigator.clipboard.readText());
    expect(timed).toContain(`/watch/${DEMO_VIDEO_1}`);
    expect(timed).toContain("t=84");

    // Close, then reopen for the plain copy (the menu stays open
    // after a copy, and two "✓ Link copied" items would collide).
    await page.getByRole("button", { name: "··· More" }).click();
    await page.getByRole("button", { name: "··· More" }).click();
    await page.getByRole("menuitem", { name: "Copy link" }).click();
    await expect(
      page.getByRole("menuitem", { name: "✓ Link copied" }),
    ).toBeVisible();
    const plain = await page.evaluate(() => navigator.clipboard.readText());
    expect(plain).toContain(`/watch/${DEMO_VIDEO_1}`);

    // Thanks posts a real comment — it appears in the list.
    await page.getByRole("button", { name: "··· More" }).click();
    await page.getByRole("button", { name: "··· More" }).click();
    await page.getByRole("menuitem", { name: "♥ Thanks" }).click();
    await expect(page.getByText("Thanks for this video!")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("9. no pill-styled action buttons in the details/comments section", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await gotoWatch(page, DEMO_VIDEO_1);
    const details = page.locator(".watch-details");
    await expect(
      details.locator(
        ".acube-btn, .acube-btn-secondary, .acube-btn-danger",
      ),
    ).toHaveCount(0);
    // The action row is exactly the uniform pill set.
    await expect(details.locator(".watch-action-pill")).toHaveCount(4);
    await expect(details.locator(".watch-like-pill")).toHaveCount(1);
    // Reply / Delete / Comment-submit are TEXT: transparent background,
    // no border.
    const styleOf = async (name: string) =>
      page
        .getByRole("button", { name, exact: true })
        .first()
        .evaluate((el) => {
          const cs = getComputedStyle(el);
          return { background: cs.backgroundColor, border: cs.borderTopWidth };
        });
    expect(await styleOf("Reply")).toEqual({
      background: "rgba(0, 0, 0, 0)",
      border: "0px",
    });
    expect(await styleOf("Comment")).toEqual({
      background: "rgba(0, 0, 0, 0)",
      border: "0px",
    });
    // The Download pill renders its label (via the shared control).
    await expect(details.locator(".watch-download-pill")).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("Watch details + comments — screenshots", () => {
  test.use({ viewport: { width: 1280, height: 850 } });

  test("10. desktop screenshot of the rebuilt details + comments", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await gotoWatch(page, DEMO_VIDEO_1);
    // Un-constrain the .watch-page scroller for the shot (the
    // screenshots-watch.mjs precedent): an element capture inside
    // the max-height scroller clips the title off the top. The
    // sticky TopBar is hidden for the shot only — it would cover
    // the title at the top of the capture.
    await page.evaluate(() => {
      const scroller = document.querySelector(".watch-page") as HTMLElement | null;
      if (scroller) {
        scroller.style.maxHeight = "none";
        scroller.style.overflow = "visible";
      }
      const topbar = document.querySelector(".topbar") as HTMLElement | null;
      if (topbar) topbar.style.display = "none";
    });
    await page
      .locator(".watch-details")
      .screenshot({
        path: `${SHOT_DIR}/phase5-watch-details-comments-desktop.png`,
      });
    await page.screenshot({
      path: `${SHOT_DIR}/phase5-watch-details-comments-full-desktop.png`,
    });
    expect(errors).toEqual([]);
  });
});

test.describe("Watch details + comments — screenshots (mobile)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("11. mobile screenshot of the rebuilt details + comments", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await gotoWatch(page, DEMO_VIDEO_1);
    // Same scroller un-constraining + TopBar hiding as the desktop
    // shot (see above).
    await page.evaluate(() => {
      const scroller = document.querySelector(".watch-page") as HTMLElement | null;
      if (scroller) {
        scroller.style.maxHeight = "none";
        scroller.style.overflow = "visible";
      }
      const topbar = document.querySelector(".topbar") as HTMLElement | null;
      if (topbar) topbar.style.display = "none";
    });
    await page
      .locator(".watch-details")
      .screenshot({
        path: `${SHOT_DIR}/phase5-watch-details-comments-mobile.png`,
      });
    // No horizontal overflow at mobile width.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    expect(errors).toEqual([]);
  });
});
