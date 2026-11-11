// Phase 5 fix — History page at /history (preview screen I): day
// groups, progress bars from stored progressSec, Resume resumes from
// the stored position (?t= on the Watch link), Pause wired to the
// real backend flag (GET/PATCH /user/history-paused — persisted and
// enforced server-side; the toggle is NOT local-only), per-item remove
// (DELETE /video/deletehistory/:videoid/:viewer) and Clear all
// (DELETE /video/deletehistory/:userid). Rows whose video is not in
// the page-1 feed load via GET /video/:id (HistoryVideoRow) instead of
// being silently dropped. Pause stops new entries; it does not delete
// old ones. Liked / Watch-Later annotations come from the real liked
// and watch-later lists — never invented.
import React, { useMemo, useState } from "react";
import { Link } from "react-router";
import { useAppSelector } from "../../store";
import {
  useClearHistory,
  useDeleteHistoryItem,
  useHistory,
  useHistoryPaused,
  useLikedVideos,
  useSetHistoryPaused,
  useVideo,
  useVideosById,
  useWatchLater,
} from "../../query/hooks";
import type { Video, VideoListEntry } from "../../types";
import AccountNavPills from "../Library/AccountNavPills";
import { gradientFor } from "../Library/gradient";
import "./History.css";

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

function formatClock(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay(d, today)) return `Watched today, ${time}`;
  if (sameDay(d, yesterday)) return `Watched yesterday, ${time}`;
  return `Watched ${d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}, ${time}`;
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
  liked,
  savedForLater,
  onRemove,
}: {
  entry: VideoListEntry;
  video: Video | undefined;
  userId: string | undefined;
  liked: boolean;
  savedForLater: boolean;
  onRemove: (videoid: string) => void;
}) {
  // Hooks first: the early return below must not precede any hook.
  // A thumbnail URL that does not resolve (the seeded demo thumbs are
  // example.com placeholders) falls back to the gradient + initial —
  // the same rule as Studio Content's VideoThumb — instead of the
  // browser's broken-image icon (preview image-28 shows clean
  // gradient thumbs).
  const [thumbBroken, setThumbBroken] = useState(false);
  if (!video) return null;
  const dur = entry.durationSec ?? video.durationSec ?? video.duration ?? 0;
  const pos = progressSecOf(entry, video);
  const finished = dur > 0 && pos >= dur - 2;
  // Phase 5 fix: a finished watch restarts from the beginning — the
  // title/Resume links carry no ?t= and the button says "Watch again",
  // not "Resume from 7:00" on a 7:00 video.
  const startAt = finished ? 0 : pos;
  const watchUrl = `/watch/${video._id}${startAt > 0 ? `?t=${startAt}` : ""}`;
  const thumbSrc = video.thumbnailUrl ?? video.thumbnail ?? undefined;
  const watchedAt = formatClock(entry.likedon ?? entry.createdAt);
  const status = finished
    ? "Finished"
    : pos > 0
      ? `Watched ${formatTime(pos)} of ${formatTime(dur)}`
      : "Stopped early";
  return (
    <div className="history-row">
      <Link
        to={watchUrl}
        className="history-thumb"
        style={
          thumbSrc && !thumbBroken
            ? undefined
            : { background: gradientFor(video._id) }
        }
        aria-label={`Watch ${video.videotitle}`}
      >
        {thumbSrc && !thumbBroken ? (
          <img
            src={thumbSrc}
            alt=""
            className="history-thumb-img"
            onError={() => setThumbBroken(true)}
          />
        ) : (
          <span className="history-thumb-initial" aria-hidden="true">
            {(video.videotitle ?? "?").charAt(0).toUpperCase()}
          </span>
        )}
        {dur > 0 ? (
          <span className="history-duration">{formatTime(dur)}</span>
        ) : null}
        {dur > 0 ? (
          <span
            className="history-progress"
            role="progressbar"
            aria-valuenow={Math.round((pos / dur) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Watch progress for ${video.videotitle}`}
          >
            <span
              style={{ width: `${Math.min(100, (pos / dur) * 100)}%` }}
            />
          </span>
        ) : null}
      </Link>
      <div className="history-row-main">
        <Link to={watchUrl} className="history-title">
          {video.videotitle}
        </Link>
        <div className="history-sub">
          {video.uploader ?? "Unknown channel"} · {status}
          {watchedAt ? ` · ${watchedAt}` : ""}
          {liked ? " · You liked this 👍" : ""}
          {savedForLater ? " · Saved to Watch Later" : ""}
          {" · "}
          <Link to={watchUrl} className="history-resume">
            {finished
              ? "Watch again"
              : startAt > 0
                ? `Resume from ${formatTime(startAt)} ▶`
                : "Resume"}
          </Link>
        </div>
      </div>
      <button
        type="button"
        className="history-remove"
        aria-label={`Remove ${video.videotitle} from history`}
        onClick={() => userId && onRemove(video._id)}
      >
        ✕ Remove
      </button>
    </div>
  );
}

/** A history row whose video is missing from the feed cache: load it
 * by id instead of dropping the row. */
function HistoryVideoRow({
  entry,
  userId,
  liked,
  savedForLater,
  onRemove,
}: {
  entry: VideoListEntry;
  userId: string | undefined;
  liked: boolean;
  savedForLater: boolean;
  onRemove: (videoid: string) => void;
}) {
  const { data } = useVideo(entry.videoid);
  if (!data) return null;
  return (
    <HistoryRow
      entry={entry}
      video={data}
      userId={userId}
      liked={liked}
      savedForLater={savedForLater}
      onRemove={onRemove}
    />
  );
}

export default function History() {
  const currentuser = useAppSelector((s) => s.auth.session);
  const { data, isLoading, isError, refetch } = useHistory();
  const likedList = useLikedVideos();
  const watchLaterList = useWatchLater();
  const byId = useVideosById();
  const clearMutation = useClearHistory();
  const removeMutation = useDeleteHistoryItem();
  const pausedQuery = useHistoryPaused();
  const setPaused = useSetHistoryPaused();
  const userId = currentuser?.result._id;
  const paused = pausedQuery.data ?? false;

  const likedIds = useMemo(
    () => new Set((likedList.data ?? []).map((e) => e.videoid)),
    [likedList.data],
  );
  const watchLaterIds = useMemo(
    () => new Set((watchLaterList.data ?? []).map((e) => e.videoid)),
    [watchLaterList.data],
  );

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
      <div className="container2_Pages_App history-page">
        <AccountNavPills />
        <div className="history-head">
          <div>
            <h1>Watch history</h1>
            <p className="history-subtitle">
              Only you can see this · Pausing stops new entries, doesn&apos;t
              delete old ones
            </p>
          </div>
          <div className="history-actions">
            <button
              type="button"
              className="acube-btn-secondary"
              aria-pressed={paused}
              onClick={() => setPaused.mutate(!paused)}
            >
              {paused ? "▶ Resume history" : "⏸ Pause history"}
            </button>
            <button
              type="button"
              className="acube-btn-danger"
              onClick={() => userId && clearMutation.mutate(userId)}
            >
              Clear all watch history
            </button>
          </div>
        </div>
        {paused ? (
          <p className="history-paused-note">
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
            <section key={day} className="history-group">
              <h2 className="history-day">{day}</h2>
              {entries.map((entry) => {
                const video = byId[entry.videoid];
                const liked = likedIds.has(entry.videoid);
                const savedForLater = watchLaterIds.has(entry.videoid);
                if (video) {
                  return (
                    <HistoryRow
                      key={entry._id}
                      entry={entry}
                      video={video}
                      userId={userId}
                      liked={liked}
                      savedForLater={savedForLater}
                      onRemove={onRemove}
                    />
                  );
                }
                return (
                  <HistoryVideoRow
                    key={entry._id}
                    entry={entry}
                    userId={userId}
                    liked={liked}
                    savedForLater={savedForLater}
                    onRemove={onRemove}
                  />
                );
              })}
            </section>
          ))
        )}
        <p className="history-footnote">
          History is per-account, newest first, grouped by day. Progress bars
          come from the same view events as Studio analytics — resume picks
          up where you left off on any device.
        </p>
      </div>
    </div>
  );
}
