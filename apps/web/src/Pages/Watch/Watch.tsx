// Phase 5 fix — rebuilt video watch page at /watch/:id (preview
// screen H). Custom Player (draggable knob, real chapters only),
// description box with tags, Share (copies the real link), Save menu
// (library + playlists), Download-Premium via the existing Download
// component, pinned creator comment first, nested replies to any
// depth, Up Next from GET /watch/:id/suggestions with "Because:
// <reason>" labels, and a playlist showcase with thumbnails, index
// numbers, current-video highlight, progress, Play-all / Shuffle /
// Loop / Save-a-copy. Subscribe is real now: the Watch channel row
// carries the Subscribe toggle (POST /subscriptions/:channelId/toggle)
// with the real subscriber count; the owner sees no button and a
// logged-out viewer sees it disabled. Resume: ?t=<seconds> or the
// stored history progress seeks the player; playback position is
// persisted via the progress endpoint.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./Watch.css";
import { formatDistanceToNow } from "date-fns/formatDistanceToNow";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useAppSelector } from "../../store";
import { resolveApiMediaUrl } from "../../Api";
import SubscribeButton from "../../Component/SubscribeButton";
import VideoThumb from "../../Component/VideoThumb";
import {
  useAddToHistory,
  useCreatePlaylist,
  useHistory,
  useUpdateVideoProgress,
  useVideo,
  useVideos,
  useViewVideo,
  useWatchComplete,
  useWatchPlaylists,
  useWatchSuggestions,
} from "../../query/hooks";
import Likewatchlatersavebtns from "../Videopage/Likewatchlatersavebtns";
import LoadingCard from "../../Component/LoadingCard";
import Player from "./Player";
import NestedComments from "./NestedComments";
import SaveMenu from "./SaveMenu";

function formatDuration(sec: number | undefined): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Watch Autoplay — per-user preference, persisted in localStorage
 * under "acube:watch:autoplay" ("true" / "false"). There is NO
 * server field for it: the preview shows "Autoplay ON" and the
 * default is ON unless the user already saved a preference. */
const AUTOPLAY_STORAGE_KEY = "acube:watch:autoplay";

function readAutoplayPreference(): boolean {
  try {
    const raw = window.localStorage.getItem(AUTOPLAY_STORAGE_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

const Watch = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const videoQuery = useVideo(id);
  const suggestionsQuery = useWatchSuggestions(id);
  const { data: feedVideos } = useVideos();
  const currentuser = useAppSelector((s) => s.auth.session);
  const viewMutation = useViewVideo();
  const historyMutation = useAddToHistory();
  const watchCompleteMutation = useWatchComplete();
  const playlistsQuery = useWatchPlaylists(id);
  const historyQuery = useHistory();
  const progressMutation = useUpdateVideoProgress();
  const createPlaylist = useCreatePlaylist();
  const vv = videoQuery.data;
  const [loop, setLoop] = useState(false);
  const [shuffled, setShuffled] = useState(false);
  const [autoplay, setAutoplay] = useState(readAutoplayPreference);
  const [shareCopied, setShareCopied] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const lastProgressSent = useRef(0);

  const viewerId = currentuser?.result?._id;
  // Persist the Autoplay preference whenever it changes.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        AUTOPLAY_STORAGE_KEY,
        autoplay ? "true" : "false",
      );
    } catch {
      // Private mode / blocked storage: the toggle still works for
      // this session, it just does not persist.
    }
  }, [autoplay]);
  useEffect(() => {
    if (id) viewMutation.mutate(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (viewerId && id) {
      historyMutation.mutate({ videoid: id, viewer: viewerId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, viewerId]);

  // Resume position: ?t= param wins, else the stored history row.
  const storedProgressSec = useMemo(() => {
    const entry = historyQuery.data?.find((e) => e.videoid === id);
    if (!entry) return 0;
    if (typeof entry.progressSec === "number") return entry.progressSec;
    if (typeof entry.progress === "number" && entry.durationSec) {
      return Math.round(entry.progress * entry.durationSec);
    }
    return 0;
  }, [historyQuery.data, id]);
  const initialTime = (() => {
    const raw = Number(searchParams.get("t") ?? 0) || storedProgressSec;
    // A finished watch (progress at/past the duration) starts over —
    // "Resumed from 7:00" on a 7:00 video is the end, not a resume
    // point. Unknown duration (0) keeps the stored position.
    const durationSec = vv?.durationSec ?? vv?.duration ?? 0;
    return durationSec > 0 && raw >= durationSec ? 0 : raw;
  })();

  const handleProgress = useCallback(
    (sec: number) => {
      if (!id || !viewerId) return;
      if (Math.abs(sec - lastProgressSent.current) < 5) return;
      lastProgressSent.current = sec;
      progressMutation.mutate({ videoid: id, progressSec: Math.floor(sec) });
    },
    [id, viewerId, progressMutation],
  );

  // Memoised (not `?? []` inline): a fresh [] every render would
  // change the nextAutoplayId useMemo's dependencies every render.
  const suggestions = useMemo(
    () => suggestionsQuery.data ?? [],
    [suggestionsQuery.data],
  );
  // Phase 5 fix: GET /watch/:id/playlists already returns only the
  // public playlists containing THIS video (with their videos), for
  // any viewer — the first one is the showcase. The old lookup ran
  // the owner-only /studio/playlists list and searched it for the
  // video, so the showcase only ever rendered for the channel owner.
  const playlist = playlistsQuery.data?.[0];

  const playlistVideos = useMemo(() => {
    if (!playlist) return [];
    if (playlist.videos?.length) return playlist.videos;
    // Fallback: resolve ids from the feed cache.
    return playlist.videoIds
      .map((vid) => (feedVideos ?? []).find((v) => v._id === vid))
      .filter((v): v is NonNullable<typeof v> => Boolean(v));
  }, [playlist, feedVideos]);

  // Playlist progress: how many of its videos have a history row.
  const playlistWatched = useMemo(() => {
    if (!playlist) return 0;
    const seen = new Set((historyQuery.data ?? []).map((e) => e.videoid));
    return playlist.videoIds.filter((vid) => seen.has(vid)).length;
  }, [playlist, historyQuery.data]);

  const orderedPlaylistVideos = useMemo(() => {
    if (!shuffled) return playlistVideos;
    return [...playlistVideos].sort(() => Math.random() - 0.5);
  }, [playlistVideos, shuffled]);

  // Autoplay target at video end: the next playlist video (in
  // playlist order — never past the last one), or, when no playlist
  // is active, the first Up Next suggestion. Null = stop at the end
  // (Up Next stays visible, nothing auto-plays).
  const nextAutoplayId = useMemo(() => {
    if (!vv) return null;
    if (playlist) {
      const idx = playlist.videoIds.indexOf(vv._id);
      if (idx >= 0 && idx + 1 < playlist.videoIds.length) {
        return playlist.videoIds[idx + 1];
      }
      return null;
    }
    return suggestions[0]?.video._id ?? null;
  }, [playlist, vv, suggestions]);

  const handleEnded = useCallback(() => {
    if (currentuser && id) {
      void watchCompleteMutation.mutateAsync(id);
    }
    // Loop replays the same video natively (the player never fires
    // onEnded while loop is on), and Autoplay OFF means stop: Up Next
    // stays on screen and nothing auto-plays.
    if (!autoplay) return;
    if (nextAutoplayId) navigate(`/watch/${nextAutoplayId}`);
  }, [currentuser, id, watchCompleteMutation, autoplay, nextAutoplayId, navigate]);

  // A chapter click seeks (the Player does that) and puts the second
  // in the URL — ?t= seek-on-load already works, so a shared chapter
  // link resumes at the chapter. ?t= still wins over stored progress.
  const handleChapterSeek = useCallback(
    (sec: number) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("t", String(sec));
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const share = useCallback(() => {
    const url = window.location.href;
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(url).then(() => setShareCopied(true));
    } else {
      setShareCopied(false);
    }
  }, []);

  if (videoQuery.isLoading) {
    return (
      <div className="watch-page">
        <LoadingCard />
      </div>
    );
  }
  if (videoQuery.isError) {
    return (
      <div className="watch-page">
        <p style={{ padding: "1rem" }}>
          Could not load this video. Please check your connection and try
          again.
        </p>
      </div>
    );
  }
  if (!vv) {
    return (
      <div className="watch-page">
        <p style={{ padding: "1rem" }}>Video not found.</p>
      </div>
    );
  }

  const currentIndex = playlist
    ? playlist.videoIds.indexOf(vv._id)
    : -1;

  return (
    <div className="watch-page">
      <div className="watch-main">
        <Player
          src={resolveApiMediaUrl(vv.filepath)}
          poster={resolveApiMediaUrl(vv.thumbnailUrl ?? vv.thumbnail ?? undefined)}
          initialTime={initialTime || undefined}
          onProgressSec={handleProgress}
          chapters={vv.chapters}
          loop={loop}
          onEnded={handleEnded}
          onChapterSeek={handleChapterSeek}
        />
        <h1 style={{ fontSize: 20, margin: "16px 0 8px" }}>{vv.videotitle}</h1>
        <div style={{ color: "var(--text-2)", marginBottom: 12 }}>
          {vv.views ?? 0} views ·{" "}
          {formatDistanceToNow(new Date(vv.createdat ?? Date.now()), {
            addSuffix: true,
          })}
          {initialTime > 0 ? ` · Resumed from ${formatDuration(initialTime)}` : ""}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <Likewatchlatersavebtns vv={vv} vid={id} />
          <SaveMenu videoid={vv._id} />
          <button type="button" className="acube-btn-secondary" onClick={share}>
            {shareCopied ? "Link copied" : "Share"}
          </button>
        </div>
        <div className="watch-channel-row">
          <Link
            to={`/channel/${vv.videochanel}`}
            className="watch-channel-link"
          >
            <span className="studio-avatar">
              {(vv.uploader ?? "?").charAt(0).toUpperCase()}
            </span>
            <strong>{vv.uploader}</strong>
          </Link>
          <SubscribeButton
            channelId={vv.videochanel}
            channelName={vv.uploader}
            isOwner={viewerId === vv.videochanel}
            loggedIn={Boolean(currentuser)}
            initial={
              typeof vv.subscriberCount === "number"
                ? {
                    subscribed: vv.subscribed ?? false,
                    subscriberCount: vv.subscriberCount,
                  }
                : undefined
            }
            className="watch-subscribe"
            subscribedClassName="watch-subscribe watch-subscribe--subscribed"
          />
        </div>
        <div className="acube-card" style={{ padding: 16, marginBottom: 24 }}>
          <p style={{ margin: 0 }}>
            {vv.views ?? 0} views ·{" "}
            {(vv.createdat ?? "").slice(0, 10)} —{" "}
            {descOpen
              ? (vv.description ?? "No description yet.")
              : (vv.description ?? "No description yet.").slice(0, 140)}
          </p>
          {(vv.tags ?? []).length > 0 ? (
            <p style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
              {(vv.tags ?? []).map((t) => `#${t}`).join(" ")}
            </p>
          ) : null}
          <button
            type="button"
            className="acube-btn-secondary"
            style={{ marginTop: 8 }}
            onClick={() => setDescOpen((v) => !v)}
          >
            {descOpen ? "Show less" : "Show more"}
          </button>
        </div>
        <NestedComments videoid={vv._id} videoOwnerId={vv.videochanel} />
      </div>
      <aside className="watch-side">
        {playlist ? (
          <div className="acube-card" style={{ padding: 16, marginBottom: 24 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>
              Playlist · {playlist.title}
            </h2>
            <p style={{ color: "var(--text-2)", margin: "0 0 12px" }}>
              {playlistWatched} / {playlist.videoIds.length} watched ·{" "}
              {currentIndex >= 0
                ? `Playing ${currentIndex + 1} of ${playlist.videoIds.length}`
                : ""}
            </p>
            <div className="watch-up-next">
              {orderedPlaylistVideos.map((v) => {
                const idx = playlist.videoIds.indexOf(v._id);
                const isCurrent = v._id === vv._id;
                const playlistDuration = formatDuration(
                  v.durationSec ?? v.duration ?? undefined,
                );
                return (
                  <Link
                    key={v._id}
                    to={`/watch/${v._id}`}
                    className="watch-up-next-item"
                    style={
                      isCurrent
                        ? { outline: "2px solid var(--accent)", borderRadius: 8, padding: 4 }
                        : undefined
                    }
                  >
                    <span className="watch-thumb-wrap">
                      <VideoThumb
                        src={v.thumbnailUrl ?? v.thumbnail ?? undefined}
                        className="watch-thumb"
                      />
                      {playlistDuration ? (
                        <span className="watch-duration-badge">{playlistDuration}</span>
                      ) : null}
                    </span>
                    <span className="watch-up-next-text">
                      <span style={{ color: "var(--text-2)" }}>
                        {idx + 1}.{" "}
                      </span>
                      <span>{v.videotitle}</span>
                      {isCurrent ? " · Playing now" : ""}
                      <span style={{ display: "block", color: "var(--text-2)", fontWeight: 400, fontSize: 13 }}>
                        {playlistDuration}{" "}
                        {v.uploader} · {v.views ?? 0} views
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <Link
                to={`/watch/${playlist.videoIds[0] ?? ""}`}
                className="acube-btn-secondary"
              >
                Play all
              </Link>
              <button
                type="button"
                className="acube-btn-secondary"
                aria-pressed={shuffled}
                onClick={() => setShuffled((v) => !v)}
              >
                Shuffle {shuffled ? "on" : "off"}
              </button>
              <button
                type="button"
                className="acube-btn-secondary"
                aria-pressed={loop}
                onClick={() => setLoop((v) => !v)}
              >
                Loop {loop ? "on" : "off"}
              </button>
              <button
                type="button"
                className="acube-btn-secondary"
                aria-pressed={autoplay}
                onClick={() => setAutoplay((v) => !v)}
              >
                Autoplay {autoplay ? "ON" : "OFF"}
              </button>
              <button
                type="button"
                className="acube-btn-secondary"
                onClick={() => {
                  createPlaylist.mutate({
                    title: `${playlist.title} (copy)`,
                    description: playlist.description,
                    visibility: "private",
                    videoIds: playlist.videoIds,
                  });
                }}
              >
                Save a copy
              </button>
            </div>
            <Link to={`/playlist/${playlist._id}`} style={{ display: "inline-block", marginTop: 12 }}>
              View full playlist
            </Link>
          </div>
        ) : null}
        <h2 style={{ fontSize: 16 }}>Up next</h2>
        {suggestionsQuery.isLoading ? (
          <p style={{ color: "var(--text-2)" }}>Loading suggestions…</p>
        ) : suggestions.length === 0 ? (
          <p style={{ color: "var(--text-2)" }}>
            No suggestions yet for this video.
          </p>
        ) : (
          <div className="watch-up-next">
            {suggestions.map(({ video, reason }) => {
              // Duration comes from the suggestion DTO only — absent
              // means no badge, never an invented one.
              const suggestionDuration = formatDuration(
                video.durationSec ?? video.duration ?? undefined,
              );
              return (
                <Link
                  key={video._id}
                  to={`/watch/${video._id}`}
                  className="watch-up-next-item"
                >
                  <span className="watch-thumb-wrap">
                    <VideoThumb
                      src={video.thumbnailUrl ?? video.thumbnail ?? undefined}
                      className="watch-thumb"
                    />
                    {suggestionDuration ? (
                      <span className="watch-duration-badge">
                        {suggestionDuration}
                      </span>
                    ) : null}
                  </span>
                  <span className="watch-up-next-text">
                    <span>{video.videotitle}</span>
                    <span style={{ display: "block", color: "var(--text-2)", fontWeight: 400, fontSize: 13 }}>
                      {video.uploader} · {video.views ?? 0} views
                    </span>
                    <span style={{ display: "block", color: "var(--text-2)", fontWeight: 400, fontSize: 13 }}>
                      Because: {reason}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
};

export default Watch;
