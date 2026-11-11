// Phase 5 match-preview — Studio Dashboard (preview image 9):
// exactly 4 KPI cards (Total views / Likes / Videos / Watch time),
// Top performing videos as red bars, Latest comments with Reply
// buttons. No 28-day data table, no 6-card grid, no chart — the
// preview Dashboard has none of those. All figures come from the
// server; watch time is real hours computed from the server's
// watchMinutes (which aggregates viewevents), never "— hrs" and
// never invented.
import React from "react";
import { Link } from "react-router";
import { formatDistanceToNow } from "date-fns";
import StudioShell from "./Studio";
import {
  StatCard,
  StudioEmptyState,
  StudioErrorState,
  StudioSkeleton,
  TopVideosBars,
} from "./components";
import {
  useStudioOverview,
  useStudioVideos,
} from "../../query/hooks";

function formatWatchHours(watchMinutes: number): string {
  return `${(watchMinutes / 60).toFixed(1)} hrs`;
}

export default function Dashboard() {
  const overview = useStudioOverview();
  // Visibility split for the Videos card subtext ("6 public · 1 private").
  const videos = useStudioVideos(1, { limit: 50 });

  if (overview.isLoading) {
    return (
      <StudioShell>
        <h1>Channel dashboard</h1>
        <StudioSkeleton label="Loading dashboard" />
      </StudioShell>
    );
  }
  if (overview.isError || !overview.data) {
    return (
      <StudioShell>
        <h1>Channel dashboard</h1>
        <StudioErrorState
          message="Could not load your channel overview."
          onRetry={() => void overview.refetch()}
        />
      </StudioShell>
    );
  }
  const t = overview.data.totals;
  const channelName = overview.data.channel?.name;
  const items = videos.data?.items ?? [];
  // The split counts LIVE videos only: a soft-deleted row (e.g. the
  // seeded trailer, visibility public) must not inflate "public" past
  // the Videos card's own live count — it used to read "8 public"
  // against a card that says 7.
  const liveItems = items.filter((v) => v.deletedAt == null);
  // Legacy rows with no visibility field count as public — same rule
  // as the backend live-video count and the VisibilityBadge.
  const publicCount = liveItems.filter(
    (v) => (v.visibility ?? "public") === "public",
  ).length;
  const privateCount = liveItems.filter(
    (v) => v.visibility === "private",
  ).length;
  const videosSubtext =
    liveItems.length > 0
      ? `${publicCount} public · ${privateCount} private`
      : `${t.totalVideos} videos`;
  const watchSubtext =
    t.watchMinutes > 0
      ? `${t.watchMinutes.toLocaleString("en-US")} minutes watched`
      : "No watch time recorded yet";

  return (
    <StudioShell>
      <h1 style={{ marginBottom: 4 }}>Channel dashboard</h1>
      <p style={{ color: "var(--text-2)", margin: "0 0 4px" }}>
        {channelName ? `${channelName} · ` : ""}Last 28 days
      </p>
      <div className="studio-stat-grid">
        <StatCard
          label="Total views"
          value={t.totalViews.toLocaleString("en-US")}
          subtext={`▲ from your ${t.totalVideos} live videos`}
          subtextTone="green"
        />
        <StatCard
          label="Likes"
          value={t.totalLikes.toLocaleString("en-US")}
          subtext="▲ real aggregate"
          subtextTone="green"
        />
        <StatCard
          label="Videos"
          value={String(t.totalVideos)}
          subtext={videosSubtext}
          subtextTone="green"
        />
        <StatCard
          label="Watch time"
          value={formatWatchHours(t.watchMinutes)}
          subtext={watchSubtext}
          subtextTone={t.watchMinutes > 0 ? "green" : "amber"}
        />
      </div>
      <div className="studio-section acube-card" style={{ padding: 16 }}>
        <h2>Top performing videos</h2>
        {overview.data.topVideos.length === 0 ? (
          <StudioEmptyState
            title="No videos yet"
            body="Upload your first video to see it here."
          />
        ) : (
          <TopVideosBars videos={overview.data.topVideos} />
        )}
      </div>
      <div className="studio-section acube-card" style={{ padding: 16 }}>
        <h2>Latest comments</h2>
        {overview.data.latestComments.length === 0 ? (
          <StudioEmptyState
            title="No comments yet"
            body="Comments on your videos will appear here."
          />
        ) : (
          <div>
            {overview.data.latestComments.map((c) => {
              // Preview image 9 shows a relative time ("2h ago"), not
              // the commenter's name.
              const when = c.commentedon ?? c.createdAt;
              return (
                <div key={c._id} className="studio-list-row">
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: "0 0 4px", fontWeight: 600 }}>
                      {c.commentbody}
                    </p>
                    <p style={{ margin: 0, color: "var(--text-2)" }}>
                      on {c.videotitle ?? "your video"}
                      {when
                        ? ` · ${formatDistanceToNow(new Date(when), { addSuffix: true })}`
                        : c.usercommented
                          ? ` · ${c.usercommented}`
                          : ""}
                    </p>
                  </div>
                  <Link
                    to="/studio/comments"
                    className="studio-reply-btn"
                    aria-label={`Reply to comment on ${c.videotitle ?? "your video"}`}
                  >
                    Reply
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </StudioShell>
  );
}
