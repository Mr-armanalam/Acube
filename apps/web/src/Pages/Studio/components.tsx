// Phase 5 match-preview — shared Studio building blocks: stat cards
// (with preview subtext), custom SVG chart, designed empty / loading /
// error states, red top-video bars. No chart dependency; charts are
// hand-built SVG with a visually-hidden text-table fallback for
// screen readers (the preview shows no visible table under a chart).
import React from "react";
import type { StudioAnalyticsDay } from "../../types";
import type { Video } from "../../types";

export function StatCard({
  label,
  value,
  subtext,
  subtextTone = "muted",
}: {
  label: string;
  value: string;
  subtext?: string;
  subtextTone?: "green" | "amber" | "muted";
}) {
  return (
    <div className="acube-card studio-stat-card">
      <h3>{label}</h3>
      <p>{value}</p>
      {subtext ? (
        <p className={`studio-stat-sub studio-stat-sub-${subtextTone}`}>
          {subtext}
        </p>
      ) : null}
    </div>
  );
}

export function StudioEmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="acube-empty" role="status">
      <p style={{ fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>
        {title}
      </p>
      <p style={{ margin: 0 }}>{body}</p>
    </div>
  );
}

export function StudioSkeleton({ label }: { label: string }) {
  return (
    <div aria-label={label} role="status">
      <div className="acube-skeleton" style={{ height: 96, marginBottom: 12 }} />
      <div className="acube-skeleton" style={{ height: 24, width: "60%" }} />
    </div>
  );
}

export function StudioErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="acube-empty" role="alert">
      <p style={{ fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>
        Something went wrong
      </p>
      <p style={{ margin: "0 0 12px" }}>{message}</p>
      <button type="button" className="acube-btn" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

/** Preview pills: Public green, Private amber, Draft grey, Unlisted grey. */
export function VisibilityBadge({
  visibility,
}: {
  visibility: string | undefined;
}) {
  const v = (visibility ?? "public").toLowerCase();
  const label = v.charAt(0).toUpperCase() + v.slice(1);
  return <span className={`acube-badge acube-badge-${v}`}>{label}</span>;
}

/** Top performing videos as red bars (preview Dashboard/Analytics). */
export function TopVideosBars({ videos }: { videos: Video[] }) {
  const maxViews = Math.max(...videos.map((v) => v.views ?? 0), 1);
  return (
    <div>
      {videos.map((v) => {
        const pct = Math.round(((v.views ?? 0) / maxViews) * 100);
        return (
          <div key={v._id} className="studio-topbar-row">
            <span className="studio-topbar-title">{v.videotitle}</span>
            <div
              className="studio-topbar-track"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Views for ${v.videotitle}`}
            >
              <div
                className="studio-topbar-fill"
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
            <span className="studio-topbar-value">
              {(v.views ?? 0).toLocaleString("en-US")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Custom SVG line/area chart (no new dependency). `metric` picks the series. */
export function StudioChart({
  days,
  metric,
  label,
}: {
  days: StudioAnalyticsDay[];
  metric: "views" | "watchMinutes" | "likes";
  label: string;
}) {
  const values = days.map((d) => d[metric]);
  const max = Math.max(...values, 1);
  const w = 640;
  const h = 220;
  const pad = 28;
  const points = values.map((v, i) => {
    const x =
      values.length === 1
        ? w / 2
        : pad + (i * (w - pad * 2)) / (values.length - 1);
    const y = h - pad - (v / max) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const area = `${line} L${points[points.length - 1]?.[0] ?? pad},${h - pad} L${points[0]?.[0] ?? pad},${h - pad} Z`;
  // Preview palette only: every series renders in Acube Red.
  const color = "var(--accent)";
  const peak = Math.max(...values, 0);
  return (
    <div className="acube-card studio-chart-wrap">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <p style={{ fontWeight: 700, margin: "0 0 8px" }}>{label}</p>
        {metric === "views" ? (
          <p style={{ margin: "0 0 8px", color: "var(--text-2)" }}>
            Peak · {peak.toLocaleString("en-US")} views
          </p>
        ) : null}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label} chart`}>
        <path d={area} fill={color} opacity={0.15} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} />
        {points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={3} fill={color} />
        ))}
      </svg>
      {/* Text fallback for screen readers: same numbers, visually hidden
        (the preview shows no table under the chart). */}
      <div className="sr-only">
        <table className="studio-table" aria-label={`${label} data table`}>
          <thead>
            <tr>
              <th>Date</th>
              <th>{label}</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d, i) => (
              <tr key={d.date}>
                <td>{d.date}</td>
                <td>{values[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
