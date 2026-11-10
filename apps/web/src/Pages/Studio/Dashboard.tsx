// Phase 5 fix — Studio Dashboard (preview screen B): totals, 28-day
// views chart, top videos, latest comments, upload shortcut. Compact
// layout: stats, then Top videos + Latest comments side by side so
// both are visible without scrolling past the fold, then the chart.
// All figures come from the server; allTime / completions / statsSince
// render wherever the preview shows them. Nothing is invented.
import React from "react";
import { Link } from "react-router";
import StudioShell from "./Studio";
import {
  StatCard,
  StudioChart,
  StudioEmptyState,
  StudioErrorState,
  StudioSkeleton,
} from "./components";
import { useStudioAnalytics, useStudioOverview } from "../../query/hooks";

export default function Dashboard({
  onUpload,
}: {
  onUpload?: () => void;
}) {
  const overview = useStudioOverview();
  const analytics = useStudioAnalytics(28);

  if (overview.isLoading) {
    return (
      <StudioShell>
        <h1>Dashboard</h1>
        <StudioSkeleton label="Loading dashboard" />
      </StudioShell>
    );
  }
  if (overview.isError || !overview.data) {
    return (
      <StudioShell>
        <h1>Dashboard</h1>
        <StudioErrorState
          message="Could not load your channel overview."
          onRetry={() => void overview.refetch()}
        />
      </StudioShell>
    );
  }
  const t = overview.data.totals;
  const channelName = overview.data.channel?.name;
  return (
    <StudioShell>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ marginBottom: 4 }}>Channel dashboard</h1>
          <p style={{ color: "var(--text-2)", margin: "0 0 4px" }}>
            {channelName ? `${channelName} · ` : ""}Last 28 days
            {overview.data.statsSince
              ? ` · Stats since ${overview.data.statsSince}`
              : ""}
          </p>
        </div>
        {onUpload ? (
          <button type="button" className="acube-btn" onClick={onUpload}>
            Upload a video
          </button>
        ) : (
          <Link to="/studio/upload" className="acube-btn">
            Upload a video
          </Link>
        )}
      </div>
      <p style={{ color: "var(--text-2)" }}>
        Your channel at a glance. Analytics start from today — days before
        Phase 5 have no recorded events, so they show as empty, not as zero
        history.
        {overview.data.allTime
          ? ` All-time totals (including traffic before analytics started): ${overview.data.allTime.views} views · ${overview.data.allTime.likes} likes.`
          : ""}
      </p>
      <div className="studio-stat-grid">
        <StatCard label="Total views" value={String(t.totalViews)} />
        <StatCard label="Total likes" value={String(t.totalLikes)} />
        <StatCard label="Total videos" value={String(t.totalVideos)} />
        <StatCard label="Total comments" value={String(t.totalComments)} />
        <StatCard label="Watch minutes" value={String(t.watchMinutes)} />
        <StatCard
          label="Completions"
          value={String(t.completions ?? 0)}
        />
      </div>
      <div className="studio-two-col">
        <div className="studio-section">
          <h2>Top videos</h2>
          {overview.data.topVideos.length === 0 ? (
            <StudioEmptyState
              title="No videos yet"
              body="Upload your first video to see it here."
            />
          ) : (
            <div>
              {overview.data.topVideos.map((v) => (
                <div key={v._id} className="studio-list-row">
                  <Link to={`/watch/${v._id}`}>{v.videotitle}</Link>
                  <span style={{ color: "var(--text-2)" }}>
                    {v.views ?? 0} views · {v.Like ?? 0} likes
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="studio-section">
          <h2>Latest comments</h2>
          {overview.data.latestComments.length === 0 ? (
            <StudioEmptyState
              title="No comments yet"
              body="Comments on your videos will appear here."
            />
          ) : (
            <div>
              {overview.data.latestComments.map((c) => (
                <div key={c._id} className="studio-list-row">
                  <div className="studio-avatar">
                    {(c.usercommented ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <strong>{c.usercommented}</strong>
                    {c.videotitle ? (
                      <span style={{ color: "var(--text-2)" }}>
                        {" "}
                        on {c.videotitle}
                      </span>
                    ) : null}
                    <p style={{ margin: "4px 0 0" }}>{c.commentbody}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="studio-section">
        {analytics.isLoading ? (
          <StudioSkeleton label="Loading analytics chart" />
        ) : analytics.isError ? (
          <StudioErrorState
            message="Could not load the views chart."
            onRetry={() => void analytics.refetch()}
          />
        ) : analytics.data && analytics.data.days.length > 0 ? (
          <StudioChart
            days={analytics.data.days}
            metric="views"
            label="Views — last 28 days"
          />
        ) : (
          <StudioEmptyState
            title="Analytics start from today"
            body="No views have been recorded yet. Once people watch your videos, the chart fills in here."
          />
        )}
      </div>
    </StudioShell>
  );
}
