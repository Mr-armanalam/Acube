// Home feed pagination — Playwright e2e (Phase 5 config: production
// build on :4173 + real API on :5000 with PHASE5_SEED=1).
//
// The seeded DB holds only one video, so the videos endpoint is
// stubbed at the network layer (page.route) with a 45-video paginated
// feed — the client, the production build, the browser and the scroll
// behaviour are all real. Assertions are on the actual network
// requests and the rendered card counts, never on implementation
// details: exactly ONE /video/getvideos request (page=1&limit=20) on
// first paint, a second request only after scrolling, a third via the
// "Load more" button, then the end-of-list state.
import { test, expect, type Page, type Request } from "@playwright/test";

const TOTAL_VIDEOS = 45;
const PAGE_SIZE = 20;

function videoRow(n: number) {
  return {
    _id: `e2e-vid-${n}`,
    videotitle: `E2E Page Video ${n}`,
    videochanel: "507f1f77bcf86cd799439012",
    filepath: `/videos/e2e-${n}.mp4`,
    uploader: "e2euser",
    Like: 0,
    views: n,
    createdat: "2026-11-01T00:00:00.000Z",
    description: `E2E pagination fixture ${n}.`,
    tags: n <= 20 ? ["coding"] : ["coding", "react"],
    durationSec: 120,
    visibility: "public",
    deletedAt: null,
  };
}

async function stubPagedFeed(page: Page, seen: Request[]) {
  await page.route("**/video/getvideos*", async (route) => {
    const url = new URL(route.request().url());
    const pageParam = Number(url.searchParams.get("page") ?? "1");
    const limit = Number(url.searchParams.get("limit") ?? "20");
    seen.push(route.request());
    const start = (pageParam - 1) * limit;
    const items = Array.from(
      { length: TOTAL_VIDEOS },
      (_, i) => videoRow(i + 1),
    ).slice(start, start + limit);
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
}

function getvideosParams(requests: Request[]): string[] {
  return requests.map((r) => {
    const url = new URL(r.url());
    return `page=${url.searchParams.get("page")}&limit=${url.searchParams.get("limit")}`;
  });
}

test("Home loads only page 1, then appends pages on scroll and Load more", async ({
  page,
}) => {
  const seen: Request[] = [];
  await stubPagedFeed(page, seen);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto("/");
  await expect(page.locator(".home-video-card")).toHaveCount(PAGE_SIZE);
  await expect(
    page.getByText("E2E Page Video 20"),
  ).toBeVisible();
  await expect(
    page.getByText("E2E Page Video 21"),
  ).toHaveCount(0);

  // Let any eager second fetch settle: still exactly one request.
  await page.waitForTimeout(1000);
  expect(getvideosParams(seen)).toEqual(["page=1&limit=20"]);

  // Scroll near the bottom — the sentinel loads page 2. NOTE: the
  // page scrolls inside .container2_Pages_App (overflow-y: auto;
  // body is overflow: hidden), so window.scrollTo does nothing here.
  await page.evaluate(() => {
    const scroller = document.querySelector(".container2_Pages_App");
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
  await expect(page.locator(".home-video-card")).toHaveCount(40);
  await expect(page.getByText("E2E Page Video 40")).toBeVisible();
  expect(getvideosParams(seen)).toEqual([
    "page=1&limit=20",
    "page=2&limit=20",
  ]);

  // The "Load more" fallback loads the last page.
  await expect(
    page.getByRole("button", { name: "Load more" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.locator(".home-video-card")).toHaveCount(TOTAL_VIDEOS);
  await expect(page.getByText("E2E Page Video 45")).toBeVisible();
  expect(getvideosParams(seen)).toEqual([
    "page=1&limit=20",
    "page=2&limit=20",
    "page=3&limit=20",
  ]);

  // End of list: no more requests, no Load more button.
  await expect(page.getByText("You've reached the end.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load more" }),
  ).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(seen).toHaveLength(3);

  expect(errors).toEqual([]);
});
