// Home feed personalization: signed-in Home uses GET /feed (with
// ?tag= when a chip other than "All" is selected) and renders the
// server-supplied reason line; logged-out Home keeps the unchanged
// getvideos feed with client-side chip filtering. Pagination /
// infinite scroll behaviour is unchanged on both feeds.
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
import {
  createTestStore,
  renderWithProviders,
  testSession,
} from "./testUtils";
import Home from "../Pages/Home/Home";
import {
  HOME_PAGE_SIZE,
  usePersonalizedFeed,
} from "../Pages/Home/usePagedVideos";
import type { FeedVideo, Video } from "../types";

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

// 45 videos: page 1 (1–20) tagged coding, 1–5 also python; page 2
// (21–40) coding + react; page 3 (41–45) coding + java. The first
// four carry the reason shapes the contract defines: a "Because you
// watched" tag reason, cold-start trending / newest labels, and an
// explicit null.
const allVideos: Video[] = Array.from({ length: 45 }, (_, i) => {
  const n = i + 1;
  const tags = ["coding"];
  if (n <= 5) tags.push("python");
  if (n >= 21 && n <= 40) tags.push("react");
  if (n >= 41) tags.push("java");
  return makeVideo(n, tags);
});

const allFeedVideos: FeedVideo[] = allVideos.map((v, i) => {
  if (i === 0)
    return {
      ...v,
      reason: {
        type: "watched",
        label: "Because you watched Python Basics Tutorial",
      },
    };
  if (i === 1)
    return { ...v, reason: { type: "trending", label: "Trending now" } };
  if (i === 2)
    return { ...v, reason: { type: "newest", label: "Newest" } };
  if (i === 3) return { ...v, reason: null };
  return { ...v, reason: null };
});

interface SeenRequest {
  page: number;
  limit: number;
  tag: string | null;
  auth: string | null;
}
let feedRequests: SeenRequest[] = [];
let getvideosRequests: SeenRequest[] = [];

// GET /feed handler honouring ?page&limit&tag: a tag narrows the
// candidate pool server-side before paging, as the contract says.
function useFeedHandler(
  videos: FeedVideo[] = allFeedVideos,
  opts: { page2Items?: FeedVideo[] } = {},
) {
  server.use(
    http.get("*/feed", ({ request }) => {
      const url = new URL(request.url);
      const page = Number(url.searchParams.get("page") ?? "1");
      const limit = Number(url.searchParams.get("limit") ?? "20");
      const tag = url.searchParams.get("tag");
      feedRequests.push({
        page,
        limit,
        tag,
        auth: request.headers.get("authorization"),
      });
      const pool = tag
        ? videos.filter((v) =>
            (v.tags ?? []).some(
              (t) => t.toLowerCase() === tag.toLowerCase(),
            ),
          )
        : videos;
      const items =
        page === 2 && opts.page2Items
          ? opts.page2Items
          : pool.slice((page - 1) * limit, page * limit);
      return HttpResponse.json({
        items,
        page,
        limit,
        total: pool.length,
        totalPages: Math.max(1, Math.ceil(pool.length / limit)),
      });
    }),
  );
}

// Recording GET /video/getvideos handler (same paging as the feed
// handler, without reasons) so tests can prove which feed fired.
function useGetvideosHandler(videos: Video[] = allVideos) {
  server.use(
    http.get("*/video/getvideos", ({ request }) => {
      const url = new URL(request.url);
      getvideosRequests.push({
        page: Number(url.searchParams.get("page") ?? "1"),
        limit: Number(url.searchParams.get("limit") ?? "20"),
        tag: url.searchParams.get("tag"),
        auth: request.headers.get("authorization"),
      });
      const page = Number(url.searchParams.get("page") ?? "1");
      const limit = Number(url.searchParams.get("limit") ?? "20");
      const items = videos.slice((page - 1) * limit, page * limit);
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
      <Provider store={createTestStore({ session: testSession })}>
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
  feedRequests = [];
  getvideosRequests = [];
  ioCallback = undefined;
  ioInstance = undefined;
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem("Profile");
});

describe("usePersonalizedFeed", () => {
  it("calls GET /feed with page, limit and ?tag=", async () => {
    useFeedHandler();
    localStorage.setItem("Profile", JSON.stringify(testSession));
    const queryClient = createClient();
    const { result } = renderHook(() => usePersonalizedFeed("react"), {
      wrapper: hookWrapper(queryClient),
    });
    await waitFor(() =>
      expect(result.current.data?.pages).toHaveLength(1),
    );
    expect(result.current.data?.pages[0].items).toHaveLength(20);
    expect(feedRequests).toEqual([
      { page: 1, limit: HOME_PAGE_SIZE, tag: "react", auth: "Bearer test-token" },
    ]);
    expect(getvideosRequests).toEqual([]);
  });

  it("omits ?tag= when no chip is selected", async () => {
    useFeedHandler();
    localStorage.setItem("Profile", JSON.stringify(testSession));
    const queryClient = createClient();
    const { result } = renderHook(() => usePersonalizedFeed(null), {
      wrapper: hookWrapper(queryClient),
    });
    await waitFor(() =>
      expect(result.current.data?.pages).toHaveLength(1),
    );
    expect(feedRequests).toEqual([
      { page: 1, limit: HOME_PAGE_SIZE, tag: null, auth: "Bearer test-token" },
    ]);
  });
});

describe("Home feed selection", () => {
  it("signed in: calls GET /feed (page 1, limit 20, Bearer token) and never getvideos", async () => {
    useFeedHandler();
    useGetvideosHandler();
    localStorage.setItem("Profile", JSON.stringify(testSession));
    renderWithProviders(<Home />, { session: testSession });
    await screen.findByText("Video 20");
    expect(feedRequests).toEqual([
      { page: 1, limit: 20, tag: null, auth: "Bearer test-token" },
    ]);
    expect(getvideosRequests).toEqual([]);
  });

  it("logged out: calls getvideos (page 1, limit 20) and never /feed", async () => {
    useFeedHandler();
    useGetvideosHandler();
    renderWithProviders(<Home />);
    await screen.findByText("Video 20");
    expect(getvideosRequests).toEqual([
      { page: 1, limit: 20, tag: null, auth: null },
    ]);
    expect(feedRequests).toEqual([]);
  });
});

describe("Home feed reason line", () => {
  it("renders reason labels exactly as supplied; cold-start labels show; no invented Because line", async () => {
    useFeedHandler();
    localStorage.setItem("Profile", JSON.stringify(testSession));
    renderWithProviders(<Home />, { session: testSession });
    await screen.findByText("Video 20");
    // The tag reason renders verbatim, exactly once.
    expect(
      screen.getByText("Because you watched Python Basics Tutorial"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Because you watched/)).toHaveLength(1);
    // Cold-start items show their own labels.
    expect(screen.getByText("Trending now")).toBeInTheDocument();
    expect(screen.getByText("Newest")).toBeInTheDocument();
    // Only the three items with a reason render a reason line.
    expect(document.querySelectorAll(".home-video-reason")).toHaveLength(3);
  });

  it("logged out: no reason line renders (getvideos items carry none)", async () => {
    useGetvideosHandler();
    renderWithProviders(<Home />);
    await screen.findByText("Video 20");
    expect(document.querySelectorAll(".home-video-reason")).toHaveLength(0);
    expect(screen.queryByText(/Because you watched/)).not.toBeInTheDocument();
  });
});

describe("Home tag chips with the feed", () => {
  it("signed in: selecting a chip passes ?tag= and shows only that tag's videos", async () => {
    useFeedHandler();
    useGetvideosHandler();
    localStorage.setItem("Profile", JSON.stringify(testSession));
    const user = userEvent.setup();
    renderWithProviders(<Home />, { session: testSession });
    await screen.findByText("Video 20");
    // "react" only exists on page 2 — load it first so the chip exists.
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Video 21");
    await user.click(screen.getByRole("button", { name: "react" }));
    await screen.findByText("Video 21");
    await waitFor(() =>
      expect(
        feedRequests.some(
          (r) => r.page === 1 && r.limit === 20 && r.tag === "react",
        ),
      ).toBe(true),
    );
    // Server-narrowed: only the react videos remain, no client filter.
    expect(screen.queryByText("Video 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Video 20")).not.toBeInTheDocument();
    expect(screen.getByText("Video 40")).toBeInTheDocument();
    expect(getvideosRequests).toEqual([]);
  });

  it("logged out: selecting a chip filters client-side with no new request and no /feed call", async () => {
    useFeedHandler();
    useGetvideosHandler();
    const user = userEvent.setup();
    renderWithProviders(<Home />);
    await screen.findByText("Video 20");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Video 21");
    expect(getvideosRequests).toHaveLength(2);
    // "python" lives on page 1 only, so the client-side filter is
    // observable after the tag change resets pagination to page 1.
    await user.click(screen.getByRole("button", { name: "python" }));
    await waitFor(() =>
      expect(screen.queryByText("Video 6")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Video 1")).toBeInTheDocument();
    expect(screen.getByText("Video 5")).toBeInTheDocument();
    // The reset refetched nothing and the feed was never touched.
    expect(getvideosRequests).toHaveLength(2);
    expect(feedRequests).toEqual([]);
  });

  it("signed in: returning to All restarts from page 1", async () => {
    useFeedHandler();
    localStorage.setItem("Profile", JSON.stringify(testSession));
    const user = userEvent.setup();
    renderWithProviders(<Home />, { session: testSession });
    await screen.findByText("Video 20");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Video 21");
    await user.click(screen.getByRole("button", { name: "react" }));
    await screen.findByText("Video 40");
    await user.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() =>
      expect(screen.queryByText("Video 21")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Video 1")).toBeInTheDocument();
  });
});

describe("Home personalised feed pagination", () => {
  it("appends page 2 via the sentinel, still 20/page", async () => {
    useFeedHandler();
    localStorage.setItem("Profile", JSON.stringify(testSession));
    renderWithProviders(<Home />, { session: testSession });
    await screen.findByText("Video 20");
    expect(ioCallback).toBeDefined();
    await triggerSentinelIntersecting();
    await screen.findByText("Video 21");
    await screen.findByText("Video 40");
    expect(screen.queryByText("Video 41")).not.toBeInTheDocument();
    expect(feedRequests).toEqual([
      { page: 1, limit: 20, tag: null, auth: "Bearer test-token" },
      { page: 2, limit: 20, tag: null, auth: "Bearer test-token" },
    ]);
  });

  it("appends page 2 via Load more and never renders the same video twice", async () => {
    const page2Items = [allFeedVideos[4], ...allFeedVideos.slice(20, 39)];
    useFeedHandler(allFeedVideos, { page2Items });
    localStorage.setItem("Profile", JSON.stringify(testSession));
    const user = userEvent.setup();
    renderWithProviders(<Home />, { session: testSession });
    await screen.findByText("Video 20");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Video 21");
    expect(screen.getAllByText("Video 5")).toHaveLength(1);
    expect(document.querySelectorAll(".home-video-card")).toHaveLength(39);
  });
});
