// Phase 5 match-preview — Studio Analytics (preview image 11):
// chart on top, then exactly 4 cards: Views (28d), Avg views / video,
// Like rate, Top source. When the backend reports no traffic source,
// the Top source card renders the honest "not tracked yet" state in
// the SAME card position/style — never a missing card, never an
// invented source. No invented table: the chart's data table is a
// visually-hidden screen-reader fallback only.
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
  const analytics = useStudioAnalytics(range);
  const overview = useStudioOverview();
  const totalVideos = overview.data?.totals.totalVideos ?? 0;

  return (
    <StudioShell>
      <h1>Analytics</h1>
      <p style={{ color: "var(--text-2)", margin: "0 0 16px" }}>
        Range: Last {range} days · All videos — totals are your real
        aggregates
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
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
          <div className="studio-section">
            <StudioChart
              days={analytics.data.days}
              metric="views"
              label={`Views — last ${range} days`}
            />
          </div>
          <div className="studio-stat-grid">
            <StatCard
              label={`Views (${range}d)`}
              value={analytics.data.totals.views.toLocaleString("en-US")}
              subtext="▲ all-time total today"
              subtextTone="green"
            />
            <StatCard
              label="Avg views / video"
              value={
                totalVideos > 0
                  ? String(
                      Math.round(
                        analytics.data.totals.views / totalVideos,
                      ),
                    )
                  : "—"
              }
              subtext={
                totalVideos > 0
                  ? `${analytics.data.totals.views.toLocaleString("en-US")} ÷ ${totalVideos} videos`
                  : "No videos yet"
              }
              subtextTone="green"
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
              subtext={`${analytics.data.totals.likes.toLocaleString("en-US")} likes ÷ views`}
              subtextTone="green"
            />
            {analytics.data.trafficSources &&
            analytics.data.trafficSources.length > 0 ? (
              <StatCard
                label="Top source"
                value={analytics.data.trafficSources[0].source}
                subtext={`${analytics.data.trafficSources[0].views.toLocaleString("en-US")} views · from view events`}
                subtextTone="amber"
              />
            ) : (
              <StatCard
                label="Top source"
                value="Not tracked yet"
                subtext="Traffic source not tracked yet"
                subtextTone="amber"
              />
            )}
          </div>
          {(!analytics.data.trafficSources ||
            analytics.data.trafficSources.length === 0) && (
            <p className="studio-note" style={{ marginTop: 0 }}>
              View events do not record a referrer yet, so there is no real
              source split to show. This card stays honest rather than
              showing invented numbers.
            </p>
          )}
        </>
      )}
    </StudioShell>
  );
}
