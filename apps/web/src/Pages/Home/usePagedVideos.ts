// Home feed pagination (follow-up requirement on the Home rebuild).
//
// The Home page must NOT fetch a bulk 100–1000+ videos in one query.
// It loads page 1 only, then appends further pages as the user scrolls
// (IntersectionObserver sentinel + a "Load more" fallback button).
//
// The API already paginates: GET /video/getvideos?page&limit answers
// { items, page, limit, total, totalPages } (apps/api/Controllers/
// video.js `getallvideos`, via utils/pagination.js `paginate`; the
// query is validated by paginationQuerySchema in
// packages/shared/src/schemas.ts, which CLAMPS limit to
// MAX_PAGE_LIMIT = 50). No API change was needed.
//
// Page size: HOME_PAGE_SIZE = 20 — the server's DEFAULT_PAGE_LIMIT
// (packages/shared/src/constants.ts), inside the required 12–24 range,
// so a request that omitted limit would return the same size.
//
// This hook is Home-only on purpose: the shared `useVideos` hook
// (query/hooks.ts, key ["videos"]) is still used by Channel, Search,
// Watch, Library, History and Playlist, which need the whole list at
// once — changing it would change every page. This hook uses its own
// key so the two caches never collide.
import {
  useInfiniteQuery,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { getPersonalizedFeed, getvideos } from "../../Api";
import type { FeedVideo, PagedResult, Video } from "../../types";

/** Videos per Home page — the server default, inside the 12–24 range. */
export const HOME_PAGE_SIZE = 20;

/** Distinct TanStack key for the Home paged feed. */
export const HOME_PAGED_VIDEOS_KEY = [
  "videos",
  "paged",
  HOME_PAGE_SIZE,
] as const;

/** Prefix for the personalised-feed keys. The selected tag is part of
 * the key (see homeFeedKey): a different tag is a different feed and
 * starts at page 1 with its own cache. */
export const HOME_FEED_KEY_PREFIX = [
  "videos",
  "feed",
  HOME_PAGE_SIZE,
] as const;

/** Key for one personalised feed: `tag` is the selected chip, or
 * "all" when no chip is selected. */
export function homeFeedKey(tag: string | null): readonly unknown[] {
  return [...HOME_FEED_KEY_PREFIX, tag ?? "all"] as const;
}

// The list endpoint answers the paged shape; older / stubbed responses
// may still be a bare array (the MSW tagless-video override in
// home.test.tsx answers one). Accept both so a bare array behaves as
// a single page instead of crashing the feed.
function normalizePage<T extends Video>(
  data: unknown,
  page: number,
): PagedResult<T> {
  if (Array.isArray(data)) {
    const items = data as T[];
    return {
      items,
      page,
      limit: HOME_PAGE_SIZE,
      total: items.length,
      totalPages: 1,
    };
  }
  return data as PagedResult<T>;
}

export function usePagedVideos(options: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: HOME_PAGED_VIDEOS_KEY,
    queryFn: async ({ pageParam }): Promise<PagedResult<Video>> => {
      const { data } = await getvideos(pageParam, HOME_PAGE_SIZE);
      return normalizePage<Video>(data, pageParam);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    enabled: options.enabled ?? true,
  });
}

/** Personalised Home feed (signed-in only): GET /feed, same shape and
 * page size as the public feed, items carrying the server-supplied
 * `reason` (or null). `tag` is the selected chip other than "All" —
 * it is sent as ?tag= so the server narrows the candidate pool before
 * ranking, and it is part of the query key so each tag has its own
 * page-1 cache. Pass null for "All" (no ?tag= param). The hook is
 * Home-only, like usePagedVideos; other callers keep their own keys.
 * `enabled` lets Home mount both feed hooks unconditionally (hooks
 * cannot be conditional) and run only the one matching the session:
 * signed in → this hook, logged out → usePagedVideos. */
export function usePersonalizedFeed(
  tag: string | null,
  options: { enabled?: boolean } = {},
) {
  return useInfiniteQuery({
    queryKey: homeFeedKey(tag),
    queryFn: async ({
      pageParam,
    }): Promise<PagedResult<FeedVideo>> => {
      const { data } = await getPersonalizedFeed(
        pageParam,
        HOME_PAGE_SIZE,
        tag ?? undefined,
      );
      return normalizePage<FeedVideo>(data, pageParam);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    enabled: options.enabled ?? true,
  });
}

/** Flatten loaded pages into one list, deduped by video id — a page
 * must never show the same video twice even if the server repeats a
 * row across pages. First-seen order is kept. Generic so the
 * personalised feed keeps its FeedVideo (reason) typing. */
export function dedupeVideos<T extends Video>(
  pages: PagedResult<T>[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of pages) {
    for (const video of page.items ?? []) {
      if (!video || seen.has(video._id)) continue;
      seen.add(video._id);
      out.push(video);
    }
  }
  return out;
}

/** Reset the Home feed pagination to page 1 WITHOUT refetching page 1:
 * page 1 is already cached, so the extra pages are dropped from the
 * cache in place and the sentinel can load page 2 again. Used when
 * the category-tag filter changes — the filtered view restarts from
 * page 1 and no new video-list request fires for the reset itself. */
export function resetPagedVideosToFirstPage(
  queryClient: QueryClient,
): void {
  void queryClient.cancelQueries({ queryKey: HOME_PAGED_VIDEOS_KEY });
  queryClient.setQueryData<InfiniteData<PagedResult<Video>>>(
    HOME_PAGED_VIDEOS_KEY,
    (old) => {
      if (!old || old.pages.length <= 1) return old;
      return {
        pages: old.pages.slice(0, 1),
        pageParams: old.pageParams.slice(0, 1),
      };
    },
  );
}

/** Same reset for the personalised feed — but the tag is part of the
 * feed key, so there is one cache per visited tag. Truncate EVERY
 * feed key to page 1 in place (no refetch): the tag just selected
 * fetches its own page 1 (or reuses its truncated cache), and a tag
 * revisited later restarts from page 1 instead of resuming at page 2+.
 * Called on every tag change alongside resetPagedVideosToFirstPage;
 * each is a no-op for the feed the user is not on. */
export function resetPersonalizedFeedToFirstPage(
  queryClient: QueryClient,
): void {
  void queryClient.cancelQueries({ queryKey: HOME_FEED_KEY_PREFIX });
  for (const query of queryClient
    .getQueryCache()
    .findAll({ queryKey: HOME_FEED_KEY_PREFIX })) {
    queryClient.setQueryData<InfiniteData<PagedResult<FeedVideo>>>(
      query.queryKey,
      (old) => {
        if (!old || old.pages.length <= 1) return old;
        return {
          pages: old.pages.slice(0, 1),
          pageParams: old.pageParams.slice(0, 1),
        };
      },
    );
  }
}
