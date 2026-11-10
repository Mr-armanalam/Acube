// Phase 5 — History page at /history: day groups, progress bars (only
// when the server reports progress), Resume, Pause/Clear, per-item remove
// (DELETE /video/deletehistory/:videoid/:viewer, owner = viewer only).
import React, { useMemo, useState } from "react";
import { Link } from "react-router";
import Leftsidebar from "../../Component/Leftsidebar/Leftsidebar";
import { useAppSelector } from "../../store";
import {
  useClearHistory,
  useDeleteHistoryItem,
  useHistory,
  useVideosById,
} from "../../query/hooks";

function dayKey(iso: string | undefined): string {
  if (!iso) return "Unknown date";
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function History() {
  const currentuser = useAppSelector((s) => s.auth.session);
  const { data, isLoading, isError, refetch } = useHistory();
  const byId = useVideosById();
  const clearMutation = useClearHistory();
  const removeMutation = useDeleteHistoryItem();
  const [paused, setPaused] = useState(false);
  const userId = currentuser?.result._id;

  const groups = useMemo(() => {
    const map = new Map<string, typeof data>();
    for (const entry of data ?? []) {
      // Contract fix: history rows carry `likedon` (the model has no
      // createdAt) — grouping by createdAt put every real row under
      // "Unknown date".
      const key = dayKey(entry.likedon ?? entry.createdAt);
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [data]);

  return (
    <div className="container_Pages_App">
      <div className="at_small_sizel">
        <Leftsidebar />
      </div>
      <div className="container2_Pages_App" style={{ padding: 24 }}>
        <h1>Watch history</h1>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            className="acube-btn-secondary"
            onClick={() => setPaused((v) => !v)}
          >
            {paused ? "Resume history" : "Pause history"}
          </button>
          <button
            type="button"
            className="acube-btn-danger"
            onClick={() => userId && clearMutation.mutate(userId)}
          >
            Clear all watch history
          </button>
        </div>
        {paused ? (
          <p style={{ color: "var(--text-2)" }}>
            History is paused. New watches will not be recorded until you
            resume it.
          </p>
        ) : null}
        {isLoading ? (
          <div className="acube-skeleton" style={{ height: 96 }} role="status" aria-label="Loading history" />
        ) : isError ? (
          <div className="acube-empty" role="alert">
            <p>Could not load your history.</p>
            <button type="button" className="acube-btn" onClick={() => void refetch()}>
              Retry
            </button>
          </div>
        ) : groups.length === 0 ? (
          <div className="acube-empty" role="status">
            <p style={{ fontWeight: 700, color: "var(--text)" }}>No watch history yet</p>
            <p>Videos you watch will appear here, grouped by day.</p>
          </div>
        ) : (
          groups.map(([day, entries]) => (
            <section key={day} style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 16 }}>{day}</h2>
              {entries?.map((entry) => {
                const video = byId[entry.videoid];
                if (!video) return null;
                return (
                  <div key={entry._id} className="studio-list-row">
                    <div style={{ flex: 1 }}>
                      <Link to={`/watch/${video._id}`} style={{ color: "var(--text)", fontWeight: 600 }}>
                        {video.videotitle}
                      </Link>
                      <div style={{ color: "var(--text-2)", fontSize: 13 }}>
                        {video.uploader} · {video.views ?? 0} views
                      </div>
                      {typeof entry.progress === "number" ? (
                        <div
                          role="progressbar"
                          aria-valuenow={Math.round(entry.progress * 100)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Watch progress for ${video.videotitle}`}
                          style={{ height: 6, borderRadius: 3, background: "var(--surface-2)", marginTop: 6, maxWidth: 320 }}
                        >
                          <div style={{ width: `${entry.progress * 100}%`, height: "100%", borderRadius: 3, background: "var(--accent)" }} />
                        </div>
                      ) : null}
                    </div>
                    <Link to={`/watch/${video._id}`} className="acube-btn-secondary">
                      Resume
                    </Link>
                    <button
                      type="button"
                      className="acube-btn-danger"
                      aria-label={`Remove ${video.videotitle} from history`}
                      onClick={() =>
                        userId &&
                        removeMutation.mutate({
                          videoid: video._id,
                          viewer: userId,
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
