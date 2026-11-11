// Settings + Watch polish — Playwright click-through against the real
// API on in-memory MongoDB (playwright.phase5.config.ts starts it with
// PHASE5_SEED=1) and the production build. Covers the three polish
// items the unit tests can only mock:
//
//   (a) live handle check — taken / free / own handle;
//   (b) Watch Autoplay — ON advances at video end, OFF stops with
//       Up Next visible, preference persists across reload;
//   (c) banner/avatar upload — the new image is visible in Settings
//       without a reload, reaches the Studio identity header and the
//       channel header, and Remove restores the defaults.
//
// Cloudinary is UNCONFIGURED here, so the local /uploads/ fallback is
// what gets exercised; the Cloudinary-configured path is verified only
// via the mocked API tests (studio-settings-upload.test.js). The video
// files themselves do not exist, so "video end" is simulated by
// dispatching an `ended` event on the <video> element — the handler
// under test (Watch.handleEnded) is the real one.
//
// Run (from apps/web):
//   pnpm test:e2e:phase5 -- settings-watch-polish.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { deflateSync } from "node:zlib";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SHOT_DIR = fileURLToPath(
  new URL("../../../docs/screenshots", import.meta.url),
);
mkdirSync(SHOT_DIR, { recursive: true });
const shot = (name: string) => path.join(SHOT_DIR, name);

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
const DEMO_VIDEO_1 = "507f1f77bcf86cd799430201"; // Getting Started with React Hooks
const DEMO_VIDEO_2 = "507f1f77bcf86cd799430202"; // TypeScript Generics, Explained
const AUTOPLAY_KEY = "acube:watch:autoplay";

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

// Minimal PNG encoder (no dependency): solid horizontal gradient.
// Used so the uploaded banner/avatar are real, visible images.
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function makePng(
  width: number,
  height: number,
  from: [number, number, number],
  to: [number, number, number],
): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const t = width === 1 ? 0 : x / (width - 1);
      const off = y * (1 + width * 3) + 1 + x * 3;
      raw[off] = Math.round(from[0] + (to[0] - from[0]) * t);
      raw[off + 1] = Math.round(from[1] + (to[1] - from[1]) * t);
      raw[off + 2] = Math.round(from[2] + (to[2] - from[2]) * t);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// The <video> file does not exist in e2e, so the end of a video is
// simulated by dispatching the event the player listens for.
async function fireVideoEnded(page: Page) {
  await page.evaluate(() => {
    const video = document.querySelector("video");
    if (!video) throw new Error("no <video> element on the Watch page");
    video.dispatchEvent(new Event("ended", { bubbles: true }));
  });
}

test.use({ viewport: { width: 1280, height: 800 } });

test.describe("Settings + Watch polish (real API, local /uploads/ fallback)", () => {
  test("1. handle check: own handle available, taken handle rejected, free handle available", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await page.goto("/studio/settings");
    await expect(
      page.getByRole("heading", { name: "Channel settings" }),
    ).toBeVisible();

    const handle = page.getByLabel("Handle · unique");
    // The form prefills the username as the handle (no handle stored
    // yet for the e2e user) — the user's own handle shows available.
    await expect(handle).toHaveValue("e2euser");
    await expect(page.getByText("✓ available")).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: shot("settings-polish-handle-available.png") });

    // A handle held by the demo channel (Code Streamer) is taken.
    await handle.fill("codestreamer");
    await expect(page.getByText("✗ taken")).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: shot("settings-polish-handle-taken.png") });

    // A handle nobody holds is available.
    await handle.fill("zxqv-free-99");
    await expect(page.getByText("✓ available")).toBeVisible({ timeout: 10_000 });

    expect(errors).toEqual([]);
    await page.screenshot({ path: shot("settings-polish-settings-desktop.png") });
  });

  test("2. banner/avatar upload shows live, reaches identity + channel header, remove restores defaults", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await page.goto("/studio/settings");
    await expect(
      page.getByRole("heading", { name: "Channel settings" }),
    ).toBeVisible();

    const banner = page.locator(".studio-banner");
    const bannerPng = makePng(1200, 300, [43, 58, 85], [245, 158, 11]);
    const avatarPng = makePng(200, 200, [13, 148, 136], [45, 212, 191]);

    // Banner upload: the preview updates without a reload, and the
    // image behind it really loads from the API origin.
    await page
      .getByLabel("Choose banner image")
      .setInputFiles({ name: "banner.png", mimeType: "image/png", buffer: bannerPng });
    await expect
      .poll(async () => banner.evaluate((el) => el.style.backgroundImage))
      .toContain("/uploads/");
    const bannerUrl = await banner.evaluate((el) => {
      const m = el.style.backgroundImage.match(/url\("([^"]+)"\)/);
      return m?.[1] ?? "";
    });
    expect(bannerUrl).toContain("http://localhost:5000/uploads/");
    const bannerLoads = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return res.ok && (res.headers.get("content-type") ?? "").startsWith("image/");
    }, bannerUrl);
    expect(bannerLoads).toBe(true);

    // Avatar upload: the preview img swaps to the uploaded file and
    // really loads (naturalWidth > 0, not a broken icon).
    await page
      .getByLabel("Choose profile picture")
      .setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: avatarPng });
    const avatarPreview = page.getByAltText("Profile picture preview");
    await expect(avatarPreview).toBeVisible();
    await expect
      .poll(async () => avatarPreview.getAttribute("src"))
      .toContain("/uploads/");
    await expect
      .poll(async () =>
        avatarPreview.evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);

    // The Studio identity header follows the upload (avatar preferred
    // over the Google login photo) without a reload.
    const identity = page.locator(".studio-identity-avatar-img");
    await expect(identity).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(async () => identity.getAttribute("src"))
      .toContain("/uploads/");
    await expect
      .poll(async () =>
        identity.evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);

    await page.screenshot({ path: shot("settings-polish-settings-uploaded.png") });

    // The channel header shows the same banner + avatar.
    await page.goto(`/channel/${FAKE_USER_ID}`);
    const channelBanner = page.locator(".channel_banner");
    await expect(channelBanner).toBeVisible();
    await expect
      .poll(async () => channelBanner.evaluate((el) => el.style.backgroundImage))
      .toContain("/uploads/");
    // Channel rebuild renamed the avatar wrapper (.chanel_logo_chanel
    // is now .channel_avatar); the img itself still renders the
    // uploaded avatar.
    const channelAvatar = page.locator(".channel_avatar img");
    await expect(channelAvatar).toBeVisible();
    await expect
      .poll(async () =>
        channelAvatar.evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);

    // Remove restores the defaults: gradient banner, initials avatar,
    // and the identity header back to initials.
    await page.goto("/studio/settings");
    await expect(
      page.getByRole("heading", { name: "Channel settings" }),
    ).toBeVisible();
    const removeButtons = page.getByRole("button", { name: "Remove" });
    await removeButtons.nth(0).click(); // banner
    await expect
      .poll(async () =>
        page.locator(".studio-banner").evaluate((el) => el.style.backgroundImage),
      )
      .not.toContain("/uploads/");
    await removeButtons.nth(1).click(); // avatar
    await expect(page.getByAltText("Profile picture preview")).toHaveCount(0);
    await expect(page.locator(".studio-identity-avatar-img")).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test("3. Autoplay ON advances at video end, OFF stops with Up Next, preference persists", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await page.goto(`/watch/${DEMO_VIDEO_1}`);
    await expect(
      page.getByText("Getting Started with React Hooks").first(),
    ).toBeVisible();
    // The Learning Path playlist showcase lists this video first.
    await expect(
      page.getByText("Learning Path: Full-Stack Foundations"),
    ).toBeVisible();

    const autoplay = page.getByRole("button", { name: /Autoplay/ });
    await expect(autoplay).toHaveText("Autoplay ON");
    await page.screenshot({ path: shot("settings-polish-watch-autoplay-on.png") });

    // Video end with Autoplay ON advances to the next playlist video.
    await fireVideoEnded(page);
    await expect(page).toHaveURL(new RegExp(`/watch/${DEMO_VIDEO_2}$`));
    await expect(
      page.getByText("TypeScript Generics, Explained").first(),
    ).toBeVisible();

    // Video end with Autoplay OFF stops: same URL, Up Next visible.
    await page.getByRole("button", { name: "Autoplay ON" }).click();
    await expect(page.getByRole("button", { name: "Autoplay OFF" })).toBeVisible();
    await fireVideoEnded(page);
    await expect(page).toHaveURL(new RegExp(`/watch/${DEMO_VIDEO_2}$`));
    await expect(page.getByRole("heading", { name: "Up next" })).toBeVisible();

    // The OFF preference survives a reload, and ON does too.
    await page.reload();
    await expect(page.getByRole("button", { name: "Autoplay OFF" })).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), AUTOPLAY_KEY)).toBe(
      "false",
    );
    await page.getByRole("button", { name: "Autoplay OFF" }).click();
    await expect(page.getByRole("button", { name: "Autoplay ON" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Autoplay ON" })).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), AUTOPLAY_KEY)).toBe(
      "true",
    );

    expect(errors).toEqual([]);
  });
});

test.describe("Settings + Watch polish — mobile screenshots", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("4. mobile: Settings + Watch with Autoplay ON", async ({ page }) => {
    const errors = collectPageErrors(page);
    await seedFakeSession(page);
    await page.goto("/studio/settings");
    await expect(
      page.getByRole("heading", { name: "Channel settings" }),
    ).toBeVisible();
    await page.screenshot({ path: shot("settings-polish-settings-mobile.png") });

    await page.goto(`/watch/${DEMO_VIDEO_1}`);
    await expect(
      page.getByText("Getting Started with React Hooks").first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Autoplay ON" })).toBeVisible();
    await page.screenshot({ path: shot("settings-polish-watch-mobile.png") });

    expect(errors).toEqual([]);
  });
});
