// Phase 5 match-preview — Studio Analytics (preview image 11):
// chart on top, then exactly 4 cards: Views (28d), Avg views / video,
// Like rate, Top source. When the backend reports no traffic source,
// the Top source card renders the honest "not tracked yet" state in
// the SAME card position/style — never a missing card, never an
// invented source. No invented table: the chart's data table is a
// visually-hidden screen-reader fallback only.
// Per-video view (?video=<id>): the same page, scoped to one video
// via GET /studio/videos/:id/analytics (owner only) — video title +
// visibility, the endpoint's own totals (views, completions,
// watchMinutes, bestDay) and the daily chart from `days`. No
// channel-level numbers leak into the video view, and a 403/404 for a
// video the user doesn't own shows the normal error state. Without
// ?video= the page is exactly the channel view it always was.
import React, { useState } from "react";
import { Link, useSearchParams } from "react-router";
import StudioShell from "./Studio";
import {
  StatCard,
  StudioChart,
  StudioEmptyState,
  StudioErrorState,
  StudioSkeleton,
  VisibilityBadge,
} from "./components";
import {
  useStudioAnalytics,
  useStudioOverview,
  useStudioVideoAnalytics,
} from "../../query/hooks";

type Range = 7 | 28 | 90;

function RangeButtons({
  range,
  onChange,
}: {
  range: Range;
  onChange: (r: Range) => void;
}) {
  return (
    <div
      className="studio-range-switch"
      style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}
    >
      {([7, 28, 90] as Range[]).map((r) => (
        <button
          key={r}
          type="button"
          className={range === r ? "acube-btn" : "acube-btn-secondary"}
          onClick={() => onChange(r)}
        >
          Last {r} days
        </button>
      ))}
    </div>
  );
}

function ChannelAnalytics({
  range,
  onRangeChange,
}: {
  range: Range;
  onRangeChange: (r: Range) => void;
}) {
  const analytics = useStudioAnalytics(range);
  const overview = useStudioOverview();
  const totalVideos = overview.data?.totals.totalVideos ?? 0;

  return (
    <>
      <p style={{ color: "var(--text-2)", margin: "0 0 16px" }}>
        Range: Last {range} days · All videos — totals are your real
        aggregates
      </p>
      <RangeButtons range={range} onChange={onRangeChange} />
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
    </>
  );
}

function VideoAnalytics({
  videoId,
  range,
  onRangeChange,
}: {
  videoId: string;
  range: Range;
  onRangeChange: (r: Range) => void;
}) {
  const videoAnalytics = useStudioVideoAnalytics(videoId, range);
  const data = videoAnalytics.data;
  // The endpoint always returns `range` day rows (zero-filled), so an
  // unwatched video is a zero-totals view, not an empty series.
  const hasTraffic =
    data != null &&
    (data.totals.views > 0 || data.totals.completions > 0);
  const watchMinutes = data?.totals.watchMinutes ?? 0;

  return (
    <>
      <p style={{ color: "var(--text-2)", margin: "0 0 16px" }}>
        <Link to="/studio/analytics">← Channel analytics</Link>
        {" · "}Range: Last {range} days · one video
      </p>
      <RangeButtons range={range} onChange={onRangeChange} />
      {videoAnalytics.isLoading ? (
        <StudioSkeleton label="Loading video analytics" />
      ) : videoAnalytics.isError || !data ? (
        <StudioErrorState
          message="Could not load analytics for this video."
          onRetry={() => void videoAnalytics.refetch()}
        />
      ) : !hasTraffic ? (
        <StudioEmptyState
          title="No views yet for this video"
          body={`Nobody has watched ${data.video.videotitle} in the last ${range} days. Views, completions and watch time will appear here once people watch it.`}
        />
      ) : (
        <>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 16,
            }}
          >
            <h2 style={{ margin: 0 }}>{data.video.videotitle}</h2>
            <VisibilityBadge visibility={data.video.visibility} />
          </div>
          <div className="studio-section">
            <StudioChart
              days={data.days}
              metric="views"
              label={`Views — ${data.video.videotitle} · last ${range} days`}
            />
          </div>
          <div className="studio-stat-grid">
            <StatCard
              label={`Views (${range}d)`}
              value={data.totals.views.toLocaleString("en-US")}
              subtext={`in the last ${range} days`}
              subtextTone="green"
            />
            <StatCard
              label="Completions"
              value={data.totals.completions.toLocaleString("en-US")}
              subtext="finished plays"
              subtextTone="green"
            />
            <StatCard
              label="Watch time"
              value={
                watchMinutes >= 60
                  ? `${(watchMinutes / 60).toFixed(1)} hrs`
                  : `${watchMinutes.toLocaleString("en-US")} min`
              }
              subtext="estimated from completions"
              subtextTone="green"
            />
            <StatCard
              label="Best day"
              value={data.bestDay ? data.bestDay.date : "—"}
              subtext={
                data.bestDay
                  ? `${data.bestDay.views.toLocaleString("en-US")} views`
                  : "No views yet"
              }
              subtextTone="amber"
            />
          </div>
          <p className="studio-note" style={{ marginTop: 0 }}>
            All-time: {data.video.views.toLocaleString("en-US")} views ·{" "}
            {data.video.likes.toLocaleString("en-US")} likes. Daily likes
            have no per-video split, so this page shows views, completions
            and watch time only.
          </p>
        </>
      )}
    </>
  );
}

export default function Analytics() {
  const [searchParams] = useSearchParams();
  const videoId = searchParams.get("video");
  const [range, setRange] = useState<Range>(28);

  return (
    <StudioShell>
      <h1>Analytics</h1>
      {videoId ? (
        <VideoAnalytics
          videoId={videoId}
          range={range}
          onRangeChange={setRange}
        />
      ) : (
        <ChannelAnalytics range={range} onRangeChange={setRange} />
      )}
    </StudioShell>
  );
}
