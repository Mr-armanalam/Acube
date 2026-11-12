// Home (approved preview, screen A): Obsidian/Red tokens, Plus Jakarta
// Sans + Manrope, 16:9 thumbnails + duration badges + avatars, and a
// chips row with NO background and NO Upload button (the TopBar keeps
// its own + Upload).
//
// Categories are REAL: the chip list is built from the distinct tags
// present in the loaded videos (plus "All"), so a chip can never match
// zero videos. Clicking a chip filters client-side to videos carrying
// that tag (case-insensitive); a video with no tags shows only under
// "All". No hardcoded topic list, no keyword guessing over titles —
// the API has no topic endpoint and none is needed.
//
// Pagination: the feed loads page 1 only (HOME_PAGE_SIZE = 20) and
// appends further pages via an IntersectionObserver sentinel at the
// end of the grid, with a "Load more" fallback button. Pages are
// deduped by video id. Changing the tag filter resets pagination to
// page 1 (the extra pages are dropped from the cache — page 1 is
// already loaded, so the reset itself fires no new request).
//
// Feed personalization: when SIGNED IN the feed comes from GET /feed
// (optionalAuth — the axios interceptor attaches the Bearer token
// when a session is stored), still 20/page over the same sentinel +
// Load more. When LOGGED OUT the feed is the unchanged getvideos
// path. Tag chips interact differently per feed:
//   - Signed in: the selected chip (other than "All") is sent as
//     ?tag= to GET /feed, so the server narrows the candidate pool
//     BEFORE ranking; the tag is part of the feed query key, so each
//     tag has its own page-1 cache and selecting a chip fetches that
//     tag's page 1. No client-side filtering is applied — the server
//     already narrowed the list.
//   - Logged out: the chip filters client-side over the loaded pages
//     (case-insensitive exact tag match), exactly as before; the
//     reset drops pages past 1 with no new request.
// The reason line under each card ("Because you watched …" /
// "Trending now" / "Newest") is rendered verbatim from the /feed
// item's `reason.label`; logged-out items carry no reason and render
// no third line. The client never invents a reason.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import "./Home.css";
import HomeVideoCard from "./HomeVideoCard";
import LoadingCard from "../../Component/LoadingCard";
import { useAppSelector } from "../../store";
import {
  dedupeVideos,
  resetPagedVideosToFirstPage,
  resetPersonalizedFeedToFirstPage,
  usePagedVideos,
  usePersonalizedFeed,
} from "./usePagedVideos";
import type { FeedVideo, PagedResult } from "../../types";

// Sentinel / Load-more / end-of-list styles live inline here (exact
// preview tokens) so no shared stylesheet is touched: the active chip
// is the #f2eee6 pill, body text is var(--forground_text).
const sentinelStatusStyle: React.CSSProperties = {
  color: "var(--forground_text)",
  padding: "1rem",
  textAlign: "center",
  font: "600 13px/20px Manrope, sans-serif",
};

const loadMoreStyle: React.CSSProperties = {
  display: "block",
  margin: "0.5rem auto 2rem",
  padding: "0.5rem 1.25rem",
  borderRadius: "999px",
  cursor: "pointer",
  border: "1px solid #f2eee6",
  backgroundColor: "#f2eee6",
  color: "#0c0b0a",
  font: "600 13px/20px Manrope, sans-serif",
};

const Home = () => {
  const queryClient = useQueryClient();
  const session = useAppSelector((s) => s.auth.session);
  const signedIn = session !== null;
  const [topic, setTopic] = useState("All");
  // Feed source by session. Both hooks mount unconditionally (hooks
  // cannot be conditional) and only the matching one is enabled, so
  // the disabled one never fires a request: signed in → GET /feed,
  // logged out → the unchanged getvideos feed. The feed tag comes
  // from the raw selected chip (not effectiveTopic — the feed itself
  // is what the chip list is built from, so the tag cannot vanish
  // from a server-narrowed feed the way it can from loaded pages).
  const feedTag = signedIn && topic !== "All" ? topic : null;
  const pagedQuery = usePagedVideos({ enabled: !signedIn });
  const feedQuery = usePersonalizedFeed(feedTag, { enabled: signedIn });
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = signedIn ? feedQuery : pagedQuery;
  // Hover preview: the id of the ONE card currently previewing, or
  // null. Owned here so a new card starting pauses the previous one.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // FeedVideo covers both feeds: getvideos items simply carry no
  // `reason`, so the card renders no third line for them.
  const vids = useMemo<FeedVideo[]>(
    () =>
      dedupeVideos<FeedVideo>(
        (data?.pages ?? []) as PagedResult<FeedVideo>[],
      ),
    [data],
  );

  // Distinct tags in first-seen order (deduped case-insensitively,
  // keeping the first-seen casing for the label), "All" first.
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const v of vids ?? []) {
      for (const tag of v.tags ?? []) {
        const trimmed = tag.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (!seen.has(key)) seen.set(key, trimmed);
      }
    }
    return ["All", ...seen.values()];
  }, [vids]);

  // If the selected tag is gone from the loaded videos (e.g. after a
  // refetch), fall back to "All" instead of showing an empty grid.
  const effectiveTopic = categories.includes(topic) ? topic : "All";

  // Signed in, the server already narrowed the feed by ?tag=, so no
  // client-side filtering is applied (re-filtering could drop items
  // the server ranked in). Logged out, the chip filters client-side
  // over the loaded pages, exactly as before.
  const filtered = useMemo(() => {
    if (!vids) return undefined;
    if (signedIn) return vids;
    if (effectiveTopic === "All") return vids;
    const wanted = effectiveTopic.toLowerCase();
    return vids.filter((v) =>
      (v.tags ?? []).some((t) => t.toLowerCase() === wanted),
    );
  }, [vids, effectiveTopic, signedIn]);

  // Tag change resets pagination to page 1. Logged out: the paged
  // reset drops pages past 1 with no new request. Signed in: the tag
  // is part of the feed query key, so selecting a chip fetches that
  // tag's page 1 (?tag=), and the feed reset truncates every
  // previously-visited tag's cache to page 1 so returning to a tag
  // restarts from page 1 instead of resuming at page 2+. Each reset
  // is a no-op for the feed the user is not on.
  const handleTopic = (label: string) => {
    setTopic(label);
    resetPagedVideosToFirstPage(queryClient);
    resetPersonalizedFeedToFirstPage(queryClient);
  };

  // Auto-load the next page when the sentinel scrolls near the
  // viewport (200px early, so the next rows are ready before the
  // user reaches them). The "Load more" button below is the fallback
  // when the observer never fires. Guarded: jsdom / old browsers
  // have no IntersectionObserver, and the sentinel only exists once
  // the grid has rendered.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((entry) => entry.isIntersecting) &&
          !isFetchingNextPage
        ) {
          void fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const isEmpty = !isLoading && !isError && filtered?.length === 0;
  // Signed in, the feed is server-narrowed to the selected chip, so
  // the empty state names that chip even when it returned zero items
  // (and therefore vanished from the chip list). Logged out, the chip
  // may have vanished from the loaded videos and effectiveTopic has
  // already fallen back to "All".
  const emptyTopic = signedIn ? topic : effectiveTopic;

  return (
    <div className="container_Pages_App">
      <div className="container2_Pages_App">
        <div className="navigation_Home" role="group" aria-label="Topics">
          {categories.map((label) => (
            <button
              key={label}
              type="button"
              className={`btn_nav_home${effectiveTopic === label ? " active" : ""}`}
              aria-pressed={effectiveTopic === label}
              onClick={() => handleTopic(label)}
            >
              {label}
            </button>
          ))}
        </div>
        {isLoading ? (
          <LoadingCard />
        ) : isError ? (
          <p style={{ color: "var(--forground_text)", padding: "1rem" }}>
            Could not load videos. Please check your connection and try again.
          </p>
        ) : isEmpty ? (
          <p style={{ color: "var(--forground_text)", padding: "1rem" }}>
            {emptyTopic === "All"
              ? "No videos yet. Be the first to upload one!"
              : `No videos about ${emptyTopic} yet.`}
          </p>
        ) : (
          <>
            <div className="home-video-grid">
              {filtered?.map((vi) => (
                <HomeVideoCard
                  key={vi._id}
                  vid={vi}
                  previewActive={previewId === vi._id}
                  onPreviewRequest={setPreviewId}
                  onPreviewEnd={(id) =>
                    setPreviewId((current) => (current === id ? null : current))
                  }
                />
              ))}
            </div>
            <div
              ref={sentinelRef}
              data-testid="home-load-more-sentinel"
              aria-hidden="true"
              style={{ minHeight: 1 }}
            />
            {isFetchingNextPage ? (
              <p role="status" style={sentinelStatusStyle}>
                Loading more videos…
              </p>
            ) : hasNextPage ? (
              <button
                type="button"
                style={loadMoreStyle}
                onClick={() => void fetchNextPage()}
              >
                Load more
              </button>
            ) : (
              <p style={sentinelStatusStyle}>You&apos;ve reached the end.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Home;
