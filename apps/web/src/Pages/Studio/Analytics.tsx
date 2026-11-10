// Phase 5 — Studio Analytics: range selector (7/28/90), views /
// watch-time / likes chart + totals + best day + per-video bars, with a
// text table fallback. Renders only what the API returns; an empty series
// is an honest empty state, never invented history.
import React, { useState } from "react";
import StudioShell from "./Studio";
import {
  StatCard,
  StudioChart,
  StudioEmptyState,
  StudioErrorState,
  StudioSkeleton,
} from "./components";
import { useStudioAnalytics, useStudioOverview } from "../../query/hooks";

type Range = 7 | 28 | 90;

export default function Analytics() {
  const [range, setRange] = useState<Range>(28);
  const [metric, setMetric] = useState<"views" | "watchMinutes" | "likes">(
    "views",
  );
  const analytics = useStudioAnalytics(range);
  const overview = useStudioOverview();
  const metricLabel =
    metric === "views"
      ? "Views"
      : metric === "watchMinutes"
        ? "Watch minutes"
        : "Likes";

  return (
    <StudioShell>
      <h1>Analytics</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {([7, 28, 90] as Range[]).map((r) => (
          <button
            key={r}
            type="button"
            className={range === r ? "acube-btn" : "acube-btn-secondary"}
            onClick={() => setRange(r)}
          >
            Last {r} days
          </button>
        ))}
        <select
          className="acube-select"
          aria-label="Metric"
          value={metric}
          onChange={(e) =>
            setMetric(e.target.value as "views" | "watchMinutes" | "likes")
          }
        >
          <option value="views">Views</option>
          <option value="watchMinutes">Watch time</option>
          <option value="likes">Likes</option>
        </select>
      </div>
      {analytics.isLoading ? (
        <StudioSkeleton label="Loading analytics" />
      ) : analytics.isError || !analytics.data ? (
        <StudioErrorState
          message="Could not load analytics."
          onRetry={() => void analytics.refetch()}
        />
      ) : analytics.data.days.length === 0 ? (
        <StudioEmptyState
          title="Analytics start from today"
          body="No views, watch time or likes have been recorded in this range yet. The chart fills in as people watch your videos."
        />
      ) : (
        <>
          <div className="studio-stat-grid">
            <StatCard label="Views" value={String(analytics.data.totals.views)} />
            <StatCard
              label="Watch minutes"
              value={String(analytics.data.totals.watchMinutes)}
            />
            <StatCard label="Likes" value={String(analytics.data.totals.likes)} />
            <StatCard
              label="Best day"
              value={
                analytics.data.bestDay
                  ? `${analytics.data.bestDay.date} · ${analytics.data.bestDay.views} views`
                  : "—"
              }
            />
            <StatCard
              label="Avg views / video"
              value={
                overview.data && overview.data.totals.totalVideos > 0
                  ? String(
                      Math.round(
                        analytics.data.totals.views /
                          overview.data.totals.totalVideos,
                      ),
                    )
                  : "—"
              }
            />
            <StatCard
              label="Like rate"
              value={
                analytics.data.totals.views > 0
                  ? `${(
                      (analytics.data.totals.likes /
                        analytics.data.totals.views) *
                      100
                    ).toFixed(1)}%`
                  : "—"
              }
            />
          </div>
          <div className="studio-section" style={{ marginTop: 24 }}>
            <h2>Top source</h2>
            {analytics.data.trafficSources &&
            analytics.data.trafficSources.length > 0 ? (
              <div>
                {analytics.data.trafficSources.map((s) => (
                  <div key={s.source} className="studio-list-row">
                    <span>{s.source}</span>
                    <span style={{ color: "var(--text-2)" }}>
                      {s.views} views
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <StudioEmptyState
                title="Traffic source not tracked yet"
                body="View events do not record a referrer yet, so there is no real source split to show. This section stays empty rather than showing invented numbers."
              />
            )}
          </div>
          <StudioChart
            days={analytics.data.days}
            metric={metric}
            label={`${metricLabel} — last ${range} days`}
          />
        </>
      )}
      <div className="studio-section" style={{ marginTop: 32 }}>
        <h2>Top videos</h2>
        {overview.isLoading ? (
          <StudioSkeleton label="Loading top videos" />
        ) : overview.data && overview.data.topVideos.length > 0 ? (
          <div>
            {overview.data.topVideos.map((v) => {
              const maxViews = Math.max(
                ...overview.data.topVideos.map((x) => x.views ?? 0),
                1,
              );
              const pct = Math.round(((v.views ?? 0) / maxViews) * 100);
              return (
                <div key={v._id} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{v.videotitle}</span>
                    <span style={{ color: "var(--text-2)" }}>
                      {v.views ?? 0} views
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Views for ${v.videotitle}`}
                    style={{
                      height: 8,
                      borderRadius: 4,
                      background: "var(--surface-2)",
                      marginTop: 4,
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        borderRadius: 4,
                        background: "var(--accent)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <StudioEmptyState
            title="No videos yet"
            body="Per-video bars appear once you have videos with views."
          />
        )}
      </div>
    </StudioShell>
  );
}
