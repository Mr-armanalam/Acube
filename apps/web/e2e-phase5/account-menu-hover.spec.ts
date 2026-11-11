// Account-menu hover overflow (Arman screenshot 11 Nov 2026) — the
// hovered item's background painted outside the menu container on the
// right. Regression check: every menu item's border box must stay
// inside the .topbar-menu border box, on hover AND on keyboard focus,
// at desktop (1280px) and mobile (390px) widths. Run (from apps/web):
// pnpm exec playwright test -c playwright.phase5.config.ts e2e-phase5/account-menu-hover.spec.ts
// (full Phase 5 suite via pnpm test:e2e:phase5 picks this spec up too).
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SHOT_DIR = fileURLToPath(
  new URL("../../../docs/screenshots", import.meta.url),
);
mkdirSync(SHOT_DIR, { recursive: true });

// Must match apps/api/e2e-server.mjs (PHASE5_SEED=1).
const FAKE_USER_ID = "507f1f77bcf86cd799439012";
const E2E_JWT_SECRET = "e2e-test-secret-not-a-real-secret";
const MENU_ITEMS = [
  "Your account",
  "Your channel",
  "Create channel",
  "Sign out",
] as const;

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

async function openAccountMenu(page: Page): Promise<Locator> {
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
  }, mintE2EJwt());
  await page.goto("/");
  await page.getByText("E2E Smoke Video").first().waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Account menu" }).click();
  const menu = page.locator(".topbar-menu");
  await expect(menu).toBeVisible();
  return menu;
}

async function expectItemsContained(
  page: Page,
  menu: Locator,
  state: "hover" | "focus",
): Promise<void> {
  const menuBox = await menu.boundingBox();
  expect(menuBox, "menu has a bounding box").not.toBeNull();
  for (const name of MENU_ITEMS) {
    const item =
      name === "Your account" || name === "Your channel"
        ? page.getByRole("link", { name, exact: true })
        : page.getByRole("button", { name, exact: true });
    await expect(item).toBeVisible();
    if (state === "hover") await item.hover();
    else await item.focus();
    const box = await item.boundingBox();
    expect(box, `${name} has a bounding box`).not.toBeNull();
    // Playwright boxes are {x, y, width, height}; derive the edges.
    const left = box!.x;
    const right = box!.x + box!.width;
    const top = box!.y;
    const bottom = box!.y + box!.height;
    const menuRight = menuBox!.x + menuBox!.width;
    const menuBottom = menuBox!.y + menuBox!.height;
    // 0.5px tolerance for sub-pixel rounding only.
    expect(left, `${name} (${state}): left ${left} vs menu left ${menuBox!.x}`).toBeGreaterThanOrEqual(menuBox!.x - 0.5);
    expect(right, `${name} (${state}): right ${right} vs menu right ${menuRight}`).toBeLessThanOrEqual(menuRight + 0.5);
    expect(top, `${name} (${state}): top ${top} vs menu top ${menuBox!.y}`).toBeGreaterThanOrEqual(menuBox!.y - 0.5);
    expect(bottom, `${name} (${state}): bottom ${bottom} vs menu bottom ${menuBottom}`).toBeLessThanOrEqual(menuBottom + 0.5);
  }
}

test.describe("Account menu hover containment", () => {
  test.describe("desktop 1280px", () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test("hovered items stay inside the menu container", async ({ page }) => {
      const menu = await openAccountMenu(page);
      await expectItemsContained(page, menu, "hover");
      // Reference screenshot: "Your account" hovered, background contained.
      await page
        .getByRole("link", { name: "Your account", exact: true })
        .hover();
      await page.screenshot({
        path: path.join(SHOT_DIR, "phase5-account-menu-hover-fixed.png"),
      });
    });

    test("keyboard-focused items stay inside the menu container", async ({
      page,
    }) => {
      const menu = await openAccountMenu(page);
      await expectItemsContained(page, menu, "focus");
    });
  });

  test.describe("mobile 390px", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("hovered items stay inside the menu container", async ({ page }) => {
      const menu = await openAccountMenu(page);
      await expectItemsContained(page, menu, "hover");
    });

    test("keyboard-focused items stay inside the menu container", async ({
      page,
    }) => {
      const menu = await openAccountMenu(page);
      await expectItemsContained(page, menu, "focus");
    });
  });
});
