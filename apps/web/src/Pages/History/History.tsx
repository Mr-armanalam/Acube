// Phase 5 fix — History page at /history (preview screen I): day
// groups, progress bars from stored progressSec, Resume resumes from
// the stored position (?t= on the Watch link), Pause wired to the
// real backend flag (GET/PATCH /user/history-paused — persisted and
// enforced server-side; the toggle is NOT local-only), per-item remove.
// Rows whose video is not in the page-1 feed load via GET /video/:id
// (HistoryVideoRow) instead of being silently dropped.
import React, { useMemo } from "react";
import { Link } from "react-router";
import Leftsidebar from "../../Component/Leftsidebar/Leftsidebar";
import { useAppSelector } from "../../store";
import {
  useClearHistory,
  useDeleteHistoryItem,
  useHistory,
  useHistoryPaused,
  useSetHistoryPaused,
  useVideo,
  useVideosById,
} from "../../query/hooks";
import type { Video, VideoListEntry } from "../../types";

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

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function progressSecOf(entry: VideoListEntry, video?: Video): number {
  if (typeof entry.progressSec === "number") return entry.progressSec;
  const dur = entry.durationSec ?? video?.durationSec ?? video?.duration ?? 0;
  if (typeof entry.progress === "number" && dur) {
    return Math.round(entry.progress * dur);
  }
  return 0;
}

function HistoryRow({
  entry,
  video,
  userId,
  onRemove,
}: {
  entry: VideoListEntry;
  video: Video | undefined;
  userId: string | undefined;
  onRemove: (videoid: string) => void;
}) {
  if (!video) return null;
  const dur = entry.durationSec ?? video.durationSec ?? video.duration ?? 0;
  const pos = progressSecOf(entry, video);
  const finished = dur > 0 && pos >= dur - 2;
  // Phase 5 fix: a finished watch restarts from the beginning — the
  // title/Resume links carry no ?t= and the button says "Watch again",
  // not "Resume from 7:00" on a 7:00 video.
  const startAt = finished ? 0 : pos;
  return (
    <div className="studio-list-row">
      <div style={{ flex: 1 }}>
        <Link to={`/watch/${video._id}${startAt > 0 ? `?t=${startAt}` : ""}`} style={{ color: "var(--text)", fontWeight: 600 }}>
          {video.videotitle}
        </Link>
        <div style={{ color: "var(--text-2)", fontSize: 13 }}>
          {video.uploader} · {video.views ?? 0} views
          {dur > 0
            ? finished
              ? " · Finished"
              : pos > 0
                ? ` · Watched ${formatTime(pos)} of ${formatTime(dur)}`
                : " · Stopped early"
            : ""}
        </div>
        {dur > 0 ? (
          <div
            role="progressbar"
            aria-valuenow={Math.round((pos / dur) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Watch progress for ${video.videotitle}`}
            style={{ height: 6, borderRadius: 3, background: "var(--surface-2)", marginTop: 6, maxWidth: 320 }}
          >
            <div style={{ width: `${Math.min(100, (pos / dur) * 100)}%`, height: "100%", borderRadius: 3, background: "var(--accent)" }} />
          </div>
        ) : null}
      </div>
      <Link
        to={`/watch/${video._id}${startAt > 0 ? `?t=${startAt}` : ""}`}
        className="acube-btn-secondary"
      >
        {finished
          ? "Watch again"
          : startAt > 0
            ? `Resume from ${formatTime(startAt)}`
            : "Resume"}
      </Link>
      <button
        type="button"
        className="acube-btn-danger"
        aria-label={`Remove ${video.videotitle} from history`}
        onClick={() => userId && onRemove(video._id)}
      >
        Remove
      </button>
    </div>
  );
}

/** A history row whose video is missing from the feed cache: load it
 * by id instead of dropping the row. */
function HistoryVideoRow({
  entry,
  userId,
  onRemove,
}: {
  entry: VideoListEntry;
  userId: string | undefined;
  onRemove: (videoid: string) => void;
}) {
  const { data } = useVideo(entry.videoid);
  if (!data) return null;
  return <HistoryRow entry={entry} video={data} userId={userId} onRemove={onRemove} />;
}

export default function History() {
  const currentuser = useAppSelector((s) => s.auth.session);
  const { data, isLoading, isError, refetch } = useHistory();
  const byId = useVideosById();
  const clearMutation = useClearHistory();
  const removeMutation = useDeleteHistoryItem();
  const pausedQuery = useHistoryPaused();
  const setPaused = useSetHistoryPaused();
  const userId = currentuser?.result._id;
  const paused = pausedQuery.data ?? false;

  const groups = useMemo(() => {
    const map = new Map<string, VideoListEntry[]>();
    for (const entry of data ?? []) {
      const key = dayKey(entry.likedon ?? entry.createdAt);
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [data]);

  const onRemove = (videoid: string) => {
    if (userId) removeMutation.mutate({ videoid, viewer: userId });
  };

  return (
    <div className="container_Pages_App">
      <div className="at_small_sizel">
        <Leftsidebar />
      </div>
      <div className="container2_Pages_App" style={{ padding: 24 }}>
        <h1>Watch history</h1>
        <p style={{ color: "var(--text-2)" }}>
          Only you can see this · Pausing stops new entries, doesn&apos;t
          delete old ones
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            className="acube-btn-secondary"
            aria-pressed={paused}
            onClick={() => setPaused.mutate(!paused)}
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
              {entries.map((entry) => {
                const video = byId[entry.videoid];
                if (video) {
                  return (
                    <HistoryRow
                      key={entry._id}
                      entry={entry}
                      video={video}
                      userId={userId}
                      onRemove={onRemove}
                    />
                  );
                }
                return (
                  <HistoryVideoRow
                    key={entry._id}
                    entry={entry}
                    userId={userId}
                    onRemove={onRemove}
                  />
                );
              })}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
