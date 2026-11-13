// Light theme ("Porcelain") — Playwright verification.
//
// Runs against the Phase 5 e2e stack (playwright.phase5.config.ts):
// production build on :4173 + PHASE5_SEED=1 API on :5000.
//   pnpm exec playwright test -c playwright.phase5.config.ts e2e-phase5/light-theme.spec.ts
// (TMPDIR=$HOME/workspace/.tmp-mongo — /tmp is a 512 MB tmpfs and
// mongod needs the room; see §8.9.21.)
//
// What it proves:
//  - dark baseline: with theme=dark the shipped Obsidian palette is
//    intact (body bg #0c0b0a, no white-theme class) on every key page,
//    BEFORE and AFTER the light-theme change (screenshots compared
//    by eye / pixel-diff in the PR report);
//  - light theme: with theme=light every key page renders on the
//    Porcelain tokens (body bg #f5f5f2, white-theme class, white
//    surfaces, ink text, deepened brand #d93a22);
//  - toggle: the TopBar button cycles System -> Light -> Dark ->
//    System, persists the choice in localStorage, and the choice
//    survives a reload;
//  - system: with theme=auto (System) the effective theme follows
//    prefers-color-scheme (emulated light/dark).
//
// Screenshots land in docs/screenshots/light-theme/ (local only —
// never pushed; the snapshot-push flow excludes binaries).
import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SHOT_DIR = fileURLToPath(
  new URL("../../../docs/screenshots/light-theme", import.meta.url),
);
mkdirSync(SHOT_DIR, { recursive: true });

// Must match apps/api/e2e-server.mjs (PHASE5_SEED=1).
const FAKE_USER_ID = "507f1f77bcf86cd799439012";
const SEEDED_VIDEO_ID = "507f1f77bcf86cd799439011";
const E2E_JWT_SECRET = "e2e-test-secret-not-a-real-secret";

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

/** Sign in as the seeded e2e user and pin the theme mode. */
async function signIn(page: Page, theme: "auto" | "light" | "dark") {
  await page.addInitScript(
    ({ token, mode }: { token: string; mode: string }) => {
      localStorage.setItem(
        "Profile",
        JSON.stringify({
          result: {
            _id: "507f1f77bcf86cd799439012",
            name: "E2E User",
            username: "e2euser",
            email: "e2e@example.com",
          },
          token,
        }),
      );
      localStorage.setItem("theme", mode);
    },
    { token: mintE2EJwt(), mode: theme },
  );
}

async function bodyBg(page: Page): Promise<string> {
  return page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
}

async function hasWhiteTheme(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    document.body.classList.contains("white-theme"),
  );
}

// Pages every theme must render: [shot name, path, ready text].
const PAGES: Array<[string, string, string]> = [
  ["home", "/", "E2E Smoke Video"],
  ["watch", `/watch/${SEEDED_VIDEO_ID}`, "E2E Smoke Video"],
  ["search", "/search/E2E", "E2E Smoke Video"],
  ["search-empty", "/search/zzz-no-such-video", 'No results for "zzz-no-such-video"'],
  ["channel", `/channel/${FAKE_USER_ID}`, "E2E User"],
  ["library", "/library", "E2E User"],
  ["history", "/history", "E2E Smoke Video"],
  ["studio-content", "/studio/content", "Content"],
  ["studio-analytics", "/studio/analytics", "Analytics"],
  ["studio-comments", "/studio/comments", "Comments"],
  ["studio-settings", "/studio/settings", "Channel settings"],
  ["studio-upload", "/studio/upload", "Upload"],
];

test.describe("dark baseline", () => {
  for (const [name, url, ready] of PAGES) {
    test(`dark: ${name} renders Obsidian`, async ({ page }) => {
      await signIn(page, "dark");
      await page.goto(url);
      await page.getByText(ready).first().waitFor({ timeout: 15000 });
      await expect(page.locator("body")).not.toHaveClass(/white-theme/);
      expect(await bodyBg(page)).toBe("rgb(12, 11, 10)");
      await page.screenshot({ path: path.join(SHOT_DIR, `dark-${name}.png`) });
    });
  }

  test("dark: mobile home + watch", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "dark");
    await page.goto("/");
    await page.getByText("E2E Smoke Video").first().waitFor({ timeout: 15000 });
    await page.screenshot({ path: path.join(SHOT_DIR, "dark-home-mobile.png") });
    await page.goto(`/watch/${SEEDED_VIDEO_ID}`);
    await page.getByText("E2E Smoke Video").first().waitFor({ timeout: 15000 });
    await page.screenshot({ path: path.join(SHOT_DIR, "dark-watch-mobile.png") });
  });
});

test.describe("light theme", () => {
  for (const [name, url, ready] of PAGES) {
    test(`light: ${name} renders Porcelain`, async ({ page }) => {
      await signIn(page, "light");
      await page.goto(url);
      await page.getByText(ready).first().waitFor({ timeout: 15000 });
      expect(await hasWhiteTheme(page)).toBe(true);
      // Porcelain page background #F5F5F2.
      expect(await bodyBg(page)).toBe("rgb(245, 245, 242)");
      await page.screenshot({ path: path.join(SHOT_DIR, `light-${name}.png`) });
    });
  }

  test("light: Porcelain token values on Home", async ({ page }) => {
    await signIn(page, "light");
    await page.goto("/");
    await page.getByText("E2E Smoke Video").first().waitFor({ timeout: 15000 });
    const tokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      return {
        bgApp: cs.getPropertyValue("--bg-app").trim(),
        surface: cs.getPropertyValue("--bg-surface").trim(),
        ink1: cs.getPropertyValue("--ink-1").trim(),
        brand: cs.getPropertyValue("--brand").trim(),
        brandStrong: cs.getPropertyValue("--brand-strong").trim(),
        gold: cs.getPropertyValue("--gold").trim(),
        success: cs.getPropertyValue("--success").trim(),
        player: cs.getPropertyValue("--player").trim(),
        accent: cs.getPropertyValue("--accent").trim(),
      };
    });
    // getComputedStyle returns hex in lowercase.
    expect(tokens).toEqual({
      bgApp: "#f5f5f2",
      surface: "#ffffff",
      ink1: "#16130f",
      brand: "#d93a22",
      brandStrong: "#bc2e18",
      gold: "#8a6414",
      success: "#177245",
      player: "#12100e",
      accent: "#d93a22",
    });
    // The player stays dark in light mode — checked on the Watch page,
    // where the player lives (Home has no .acube-player element).
    await page.goto(`/watch/${SEEDED_VIDEO_ID}`);
    await page.getByText("E2E Smoke Video").first().waitFor({ timeout: 15000 });
    const playerBg = await page.evaluate(() => {
      const el = document.querySelector(".acube-player");
      return el ? getComputedStyle(el).backgroundColor : null;
    });
    expect(playerBg).toBe("rgb(0, 0, 0)");
  });

  test("light: mobile home + watch", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "light");
    await page.goto("/");
    await page.getByText("E2E Smoke Video").first().waitFor({ timeout: 15000 });
    await page.screenshot({ path: path.join(SHOT_DIR, "light-home-mobile.png") });
    await page.goto(`/watch/${SEEDED_VIDEO_ID}`);
    await page.getByText("E2E Smoke Video").first().waitFor({ timeout: 15000 });
    await page.screenshot({ path: path.join(SHOT_DIR, "light-watch-mobile.png") });
  });
});

test.describe("theme toggle + system", () => {
  test("toggle cycles System -> Light -> Dark -> System and persists", async ({
    page,
  }) => {
    await signIn(page, "auto");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.getByText("E2E Smoke Video").first().waitFor({ timeout: 15000 });
    const toggle = page.getByTestId("theme-toggle");
    await expect(toggle).toBeVisible();

    // System (auto) + dark OS = dark.
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("auto");
    expect(await hasWhiteTheme(page)).toBe(false);

    // -> Light.
    await toggle.click();
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
    expect(await hasWhiteTheme(page)).toBe(true);

    // -> Dark.
    await toggle.click();
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("dark");
    expect(await hasWhiteTheme(page)).toBe(false);

    // -> System again.
    await toggle.click();
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("auto");

    // Persistence across reload: click once more to Light (the app
    // writes "light" to localStorage via the store subscriber), then
    // open a fresh page in the same context — page.addInitScript is
    // page-scoped, so the new page does NOT re-seed "auto" the way a
    // reload of this page would — and the stored choice must load.
    await toggle.click();
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
    const page2 = await page.context().newPage();
    await page2.goto("/");
    await page2.getByText("E2E Smoke Video").first().waitFor({ timeout: 15000 });
    expect(await page2.evaluate(() => localStorage.getItem("theme"))).toBe("light");
    expect(await hasWhiteTheme(page2)).toBe(true);
    await page2.close();
  });

  test("system (auto) follows prefers-color-scheme", async ({ page }) => {
    await signIn(page, "auto");
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.getByText("E2E Smoke Video").first().waitFor({ timeout: 15000 });
    expect(await hasWhiteTheme(page)).toBe(true);
    expect(await bodyBg(page)).toBe("rgb(245, 245, 242)");

    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForTimeout(300);
    expect(await hasWhiteTheme(page)).toBe(false);
    expect(await bodyBg(page)).toBe("rgb(12, 11, 10)");
  });

  test("account menu theme row switches mode", async ({ page }) => {
    await signIn(page, "dark");
    await page.goto("/");
    await page.getByText("E2E Smoke Video").first().waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByTestId("theme-menu-light").click();
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
    expect(await hasWhiteTheme(page)).toBe(true);
  });

  test("Studio Settings Appearance pill switches mode", async ({ page }) => {
    await signIn(page, "dark");
    await page.goto("/studio/settings");
    await page.getByText("Channel settings").first().waitFor({ timeout: 15000 });
    await page.getByTestId("appearance-light").click();
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
    expect(await hasWhiteTheme(page)).toBe(true);
  });
});
