// Phase 5 — shared Studio building blocks: stat cards, custom SVG chart,
// designed empty / loading / error states. No chart dependency; charts are
// hand-built SVG with a text-table fallback for screen readers.
import React from "react";
import type { StudioAnalyticsDay } from "../../types";

export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="acube-card studio-stat-card">
      <h3>{label}</h3>
      <p>{value}</p>
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

export function VisibilityBadge({
  visibility,
}: {
  visibility: string | undefined;
}) {
  const v = visibility ?? "public";
  return <span className={`acube-badge acube-badge-${v}`}>{v}</span>;
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
  const color = metric === "likes" ? "var(--accent-2)" : "var(--accent)";
  return (
    <div className="acube-card studio-chart-wrap">
      <p style={{ fontWeight: 700, margin: "0 0 8px" }}>{label}</p>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label} chart`}>
        <path d={area} fill={color} opacity={0.15} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} />
        {points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={3} fill={color} />
        ))}
      </svg>
      {/* Text fallback: the same numbers as a table. */}
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
  );
}
