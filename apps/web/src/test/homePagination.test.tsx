// Home feed pagination (follow-up requirement on the Home rebuild):
// page 1 only on first paint (HOME_PAGE_SIZE = 20), append on the
// IntersectionObserver sentinel or the "Load more" button, dedupe by
// id, reset to page 1 on tag change, end-of-list when all pages load.
//
// The default MSW handler answers one page of 3 fixtures, so these
// tests override GET /video/getvideos with a handler that honours
// ?page&limit over a 45-video list (3 pages at limit 20).
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import type { ReactNode } from "react";
import { server } from "../mocks/server";
import { createTestStore, renderWithProviders } from "./testUtils";
import Home from "../Pages/Home/Home";
import {
  HOME_PAGE_SIZE,
  dedupeVideos,
  resetPagedVideosToFirstPage,
  usePagedVideos,
} from "../Pages/Home/usePagedVideos";
import type { PagedResult, Video } from "../types";

function makeVideo(n: number, tags: string[]): Video {
  return {
    _id: `vid-${n}`,
    videotitle: `Video ${n}`,
    videochanel: "ch1",
    filepath: `/videos/v${n}.mp4`,
    uploader: "alice",
    Like: 0,
    views: n,
    createdat: "2026-11-01T00:00:00.000Z",
    tags,
    visibility: "public",
    deletedAt: null,
  };
}

// 45 videos: page 1 (1–20) tagged coding; page 2 (21–40) coding +
// react; page 3 (41–45) coding + java.
const allVideos: Video[] = Array.from({ length: 45 }, (_, i) => {
  const n = i + 1;
  const tags = ["coding"];
  if (n >= 21 && n <= 40) tags.push("react");
  if (n >= 41) tags.push("java");
  return makeVideo(n, tags);
});

interface SeenRequest {
  page: number;
  limit: number;
}
let requests: SeenRequest[] = [];

// Paged MSW handler honouring ?page&limit. `page2Items` lets one test
// make page 2 repeat a page-1 video (dedupe); `page2DelayMs` lets
// another observe the loading indicator mid-fetch.
function usePagedHandler(
  videos: Video[] = allVideos,
  opts: { page2Items?: Video[]; page2DelayMs?: number } = {},
) {
  server.use(
    http.get("*/video/getvideos", async ({ request }) => {
      const url = new URL(request.url);
      const page = Number(url.searchParams.get("page") ?? "1");
      const limit = Number(url.searchParams.get("limit") ?? "20");
      requests.push({ page, limit });
      if (page === 2 && opts.page2DelayMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, opts.page2DelayMs),
        );
      }
      const items =
        page === 2 && opts.page2Items
          ? opts.page2Items
          : videos.slice((page - 1) * limit, page * limit);
      return HttpResponse.json({
        items,
        page,
        limit,
        total: videos.length,
        totalPages: Math.max(1, Math.ceil(videos.length / limit)),
      });
    }),
  );
}

// jsdom has no IntersectionObserver — capture the callback so tests
// can fire it on demand.
let ioCallback: IntersectionObserverCallback | undefined;
let ioInstance: IntersectionObserver | undefined;
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin = "";
  readonly thresholds: readonly number[] = [];
  constructor(callback: IntersectionObserverCallback) {
    ioCallback = callback;
  }
  observe(): void {
    ioInstance = this as unknown as IntersectionObserver;
  }
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

async function triggerSentinelIntersecting() {
  await act(async () => {
    ioCallback?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      ioInstance as IntersectionObserver,
    );
  });
}

function hookWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={createTestStore()}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </Provider>
    );
  };
}

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
}

beforeEach(() => {
  requests = [];
  ioCallback = undefined;
  ioInstance = undefined;
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("usePagedVideos", () => {
  it("requests page 1 only, with limit 20, on first load", async () => {
    usePagedHandler();
    const queryClient = createClient();
    const { result } = renderHook(() => usePagedVideos(), {
      wrapper: hookWrapper(queryClient),
    });
    await waitFor(() =>
      expect(result.current.data?.pages).toHaveLength(1),
    );
    expect(result.current.data?.pages[0].items).toHaveLength(20);
    expect(result.current.data?.pages[0]).toMatchObject({
      page: 1,
      limit: 20,
      total: 45,
      totalPages: 3,
    });
    expect(requests).toEqual([{ page: 1, limit: HOME_PAGE_SIZE }]);
    expect(HOME_PAGE_SIZE).toBe(20);
  });

  it("appends page 2 via fetchNextPage without refetching page 1", async () => {
    usePagedHandler();
    const queryClient = createClient();
    const { result } = renderHook(() => usePagedVideos(), {
      wrapper: hookWrapper(queryClient),
    });
    await waitFor(() =>
      expect(result.current.data?.pages).toHaveLength(1),
    );
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() =>
      expect(result.current.data?.pages).toHaveLength(2),
    );
    expect(result.current.hasNextPage).toBe(true);
    const videos = dedupeVideos(result.current.data?.pages ?? []);
    expect(videos).toHaveLength(40);
    expect(requests).toEqual([
      { page: 1, limit: 20 },
      { page: 2, limit: 20 },
    ]);
  });

  it("reports no next page after the last page", async () => {
    usePagedHandler();
    const queryClient = createClient();
    const { result } = renderHook(() => usePagedVideos(), {
      wrapper: hookWrapper(queryClient),
    });
    await waitFor(() =>
      expect(result.current.data?.pages).toHaveLength(1),
    );
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() =>
      expect(result.current.data?.pages).toHaveLength(3),
    );
    expect(result.current.hasNextPage).toBe(false);
    expect(dedupeVideos(result.current.data?.pages ?? [])).toHaveLength(45);
    expect(requests).toEqual([
      { page: 1, limit: 20 },
      { page: 2, limit: 20 },
      { page: 3, limit: 20 },
    ]);
  });

  it("resetPagedVideosToFirstPage drops pages past page 1 with no new request", async () => {
    usePagedHandler();
    const queryClient = createClient();
    const { result } = renderHook(() => usePagedVideos(), {
      wrapper: hookWrapper(queryClient),
    });
    await waitFor(() =>
      expect(result.current.data?.pages).toHaveLength(1),
    );
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() =>
      expect(result.current.data?.pages).toHaveLength(2),
    );
    expect(requests).toHaveLength(2);
    await act(async () => {
      resetPagedVideosToFirstPage(queryClient);
    });
    await waitFor(() =>
      expect(result.current.data?.pages).toHaveLength(1),
    );
    expect(result.current.data?.pages[0].page).toBe(1);
    expect(result.current.hasNextPage).toBe(true);
    // The reset refetches nothing — page 1 was already cached.
    expect(requests).toHaveLength(2);
  });
});

describe("dedupeVideos", () => {
  it("keeps first-seen order and drops repeated ids across pages", () => {
    const a = makeVideo(1, ["coding"]);
    const b = makeVideo(2, ["coding"]);
    const pages: PagedResult<Video>[] = [
      { items: [a, b], page: 1, limit: 20, total: 3, totalPages: 2 },
      { items: [b, makeVideo(3, ["coding"])], page: 2, limit: 20, total: 3, totalPages: 2 },
    ];
    expect(dedupeVideos(pages).map((v) => v._id)).toEqual([
      "vid-1",
      "vid-2",
      "vid-3",
    ]);
  });
});

describe("Home pagination", () => {
  it("renders only page 1 on first paint — one request, 20 cards", async () => {
    usePagedHandler();
    renderWithProviders(<Home />);
    await screen.findByText("Video 20");
    expect(screen.queryByText("Video 21")).not.toBeInTheDocument();
    expect(
      document.querySelectorAll(".home-video-card"),
    ).toHaveLength(20);
    // Let any eager second fetch settle, then confirm only page 1 fired.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(requests).toEqual([{ page: 1, limit: 20 }]);
  });

  it("appends page 2 when the sentinel intersects", async () => {
    usePagedHandler();
    renderWithProviders(<Home />);
    await screen.findByText("Video 20");
    expect(ioCallback).toBeDefined();
    await triggerSentinelIntersecting();
    await screen.findByText("Video 21");
    await screen.findByText("Video 40");
    expect(screen.queryByText("Video 41")).not.toBeInTheDocument();
    expect(requests).toEqual([
      { page: 1, limit: 20 },
      { page: 2, limit: 20 },
    ]);
  });

  it("appends page 2 via the Load more fallback button", async () => {
    usePagedHandler();
    const user = userEvent.setup();
    renderWithProviders(<Home />);
    await screen.findByText("Video 20");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Video 21");
    expect(requests).toEqual([
      { page: 1, limit: 20 },
      { page: 2, limit: 20 },
    ]);
  });

  it("shows a loading indicator at the sentinel while fetching the next page", async () => {
    usePagedHandler(allVideos, { page2DelayMs: 200 });
    renderWithProviders(<Home />);
    await screen.findByText("Video 20");
    await triggerSentinelIntersecting();
    expect(
      await screen.findByText(/Loading more videos/),
    ).toBeInTheDocument();
    await screen.findByText("Video 21");
  });

  it("never renders the same video twice when a page repeats an id", async () => {
    const page2Items = [allVideos[4], ...allVideos.slice(20, 39)];
    usePagedHandler(allVideos, { page2Items });
    renderWithProviders(<Home />);
    await screen.findByText("Video 20");
    await triggerSentinelIntersecting();
    await screen.findByText("Video 21");
    expect(screen.getAllByText("Video 5")).toHaveLength(1);
    expect(
      document.querySelectorAll(".home-video-card"),
    ).toHaveLength(39);
  });

  it("tag change resets to page 1 with no new request", async () => {
    usePagedHandler();
    const user = userEvent.setup();
    renderWithProviders(<Home />);
    await screen.findByText("Video 20");
    await triggerSentinelIntersecting();
    await screen.findByText("Video 21");
    expect(requests).toHaveLength(2);
    // "react" only exists on page 2 — after the reset the chip is gone
    // (categories come from loaded videos) and the grid is page 1 again.
    await user.click(screen.getByRole("button", { name: "react" }));
    await waitFor(() =>
      expect(screen.queryByText("Video 21")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Video 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "react" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toHaveClass("active");
    // The reset refetched nothing — page 1 was already cached.
    expect(requests).toHaveLength(2);
  });

  it("shows the end-of-list state after the last page, with no Load more button", async () => {
    usePagedHandler();
    renderWithProviders(<Home />);
    await screen.findByText("Video 20");
    await triggerSentinelIntersecting();
    await screen.findByText("Video 40");
    await triggerSentinelIntersecting();
    await screen.findByText("Video 45");
    expect(
      await screen.findByText("You've reached the end."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
    expect(requests).toEqual([
      { page: 1, limit: 20 },
      { page: 2, limit: 20 },
      { page: 3, limit: 20 },
    ]);
  });
});
