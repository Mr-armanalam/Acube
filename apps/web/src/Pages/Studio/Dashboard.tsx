// Phase 5 — Studio Dashboard: totals, 28-day views chart, top videos,
// latest comments, upload shortcut. All figures come from the server;
// nothing is invented client-side.
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
  return (
    <StudioShell>
      <h1>Dashboard</h1>
      <p style={{ color: "var(--text-2)" }}>
        Your channel at a glance. Analytics start from today — days before
        Phase 5 have no recorded events, so they show as empty, not as zero
        history.
      </p>
      <div className="studio-stat-grid">
        <StatCard label="Total views" value={String(t.totalViews)} />
        <StatCard label="Total likes" value={String(t.totalLikes)} />
        <StatCard label="Total videos" value={String(t.totalVideos)} />
        <StatCard label="Total comments" value={String(t.totalComments)} />
        <StatCard label="Watch minutes" value={String(t.watchMinutes)} />
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
      <button type="button" className="acube-btn" onClick={onUpload}>
        Upload a video
      </button>
    </StudioShell>
  );
}
