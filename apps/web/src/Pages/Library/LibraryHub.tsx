// Phase 5 fix — Library hub at /library (preview screen J): Watch
// Later / Saved shelf, Liked videos, your playlists + SAVED playlists
// (playlists owned by others), with thumbnails, remove buttons, shelf
// counts, Play-all / Sort, and an add-to-playlist entry point (the
// Watch Save menu creates kind:"saved" rows). The old /Library
// duplication is deleted — this hub is the only library page.
// Everything renders from the real endpoints (GET /studio/library,
// GET /video/getallwatchlater, GET /video/getalllikevide,
// GET /studio/playlists, POST /studio/playlists, DELETE
// /studio/playlists/:id) — no faked rows. "Saved" cards have no
// saved-at date in the GET /studio/library contract (it returns plain
// Video objects), so they show uploader · views instead of a saved
// date; Watch Later rows do carry a date and show it. Subscriptions
// (?view=subscriptions) is an honest empty state: Acube has no follow
// system, so there are no subscriptions to list.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { useAppSelector } from "../../store";
import {
  useCreatePlaylist,
  useDeleteLikedVideo,
  useDeletePlaylist,
  useDeleteWatchLater,
  useLibrary,
  useLikedVideos,
  useRemoveLibraryEntry,
  useStudioPlaylists,
  useVideosById,
  useWatchLater,
} from "../../query/hooks";
import type { Playlist, Video, VideoVisibility } from "../../types";
import AccountNavPills from "./AccountNavPills";
import { gradientFor } from "./gradient";
import "./LibraryHub.css";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatSavedAt(iso: string | undefined): string {
  if (!iso) return "Saved";
  const d = new Date(iso);
  const days = Math.round(
    (startOfDay(new Date()).getTime() - startOfDay(d).getTime()) / 86400000,
  );
  if (days <= 0) return "Saved today";
  if (days === 1) return "Saved yesterday";
  if (days < 7) return `Saved ${days}d ago`;
  if (days < 14) return "Saved last week";
  return `Saved ${d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

function viewsLabel(video: Video): string {
  const uploader = video.uploader ?? "Unknown channel";
  return typeof video.views === "number"
    ? `${uploader} · ${video.views.toLocaleString("en-US")} views`
    : uploader;
}

function VideoCard({
  video,
  sub,
  removeLabel,
  onRemove,
}: {
  video: Video;
  sub: string;
  removeLabel?: string;
  onRemove?: () => void;
}) {
  const src = video.thumbnailUrl ?? video.thumbnail ?? undefined;
  const dur = video.durationSec ?? video.duration ?? 0;
  // A thumbnail URL that does not resolve (the seeded demo thumbs are
  // example.com placeholders) falls back to the gradient + initial —
  // the same rule as Studio Content's VideoThumb — instead of the
  // browser's broken-image icon (preview image-29 shows clean
  // gradient thumbs).
  const [thumbBroken, setThumbBroken] = useState(false);
  return (
    <div className="library-card">
      <Link
        to={`/watch/${video._id}`}
        className="library-card-thumb"
        style={
          src && !thumbBroken
            ? undefined
            : { background: gradientFor(video._id) }
        }
        aria-label={`Watch ${video.videotitle}`}
      >
        {src && !thumbBroken ? (
          <img
            src={src}
            alt=""
            className="library-card-thumb-img"
            onError={() => setThumbBroken(true)}
          />
        ) : (
          <span className="library-card-initial" aria-hidden="true">
            {(video.videotitle ?? "?").charAt(0).toUpperCase()}
          </span>
        )}
        {/* The ▶ overlay sits dead-centre, exactly where the fallback
            initial renders — show it only when the photo itself is
            displayed, or the two glyphs collide into one garbled mark. */}
        {src && !thumbBroken ? (
          <span className="library-card-play" aria-hidden="true">
            ▶
          </span>
        ) : null}
        {dur > 0 ? (
          <span className="library-card-duration">{formatTime(dur)}</span>
        ) : null}
      </Link>
      <Link to={`/watch/${video._id}`} className="library-card-title">
        {video.videotitle}
      </Link>
      <div className="library-card-sub">{sub}</div>
      {onRemove ? (
        <button
          type="button"
          className="library-card-remove"
          aria-label={removeLabel ?? `Remove ${video.videotitle}`}
          onClick={onRemove}
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}

export default function LibraryHub() {
  const currentuser = useAppSelector((s) => s.auth.session);
  const userId = currentuser?.result._id;
  const { hash } = useLocation();
  const [searchParams] = useSearchParams();
  const view = searchParams.get("view");
  const liked = useLikedVideos();
  const watchLater = useWatchLater();
  const library = useLibrary();
  const playlists = useStudioPlaylists();
  const createPlaylist = useCreatePlaylist();
  const deletePlaylist = useDeletePlaylist();
  const removeLibrary = useRemoveLibraryEntry();
  const deleteLiked = useDeleteLikedVideo();
  const deleteWatchLater = useDeleteWatchLater();
  const byId = useVideosById();
  const [newTitle, setNewTitle] = useState("");
  const [newVisibility, setNewVisibility] =
    useState<VideoVisibility>("private");
  const [sort, setSort] = useState("recent");
  const createInputRef = useRef<HTMLInputElement>(null);

  // Watch Later / Liked pills are anchors into this hub: scroll the
  // section into view when the hash changes (or on first load).
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView();
    }
  }, [hash]);

  const videoOf = (videoid: string) => byId[videoid];

  const focusCreate = () => {
    createInputRef.current?.focus();
    if (
      createInputRef.current &&
      typeof createInputRef.current.scrollIntoView === "function"
    ) {
      createInputRef.current.scrollIntoView();
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createPlaylist.mutate({
      title: newTitle.trim(),
      visibility: newVisibility,
    });
    setNewTitle("");
  };

  const ownPlaylists = useMemo(
    () => (playlists.data ?? []).filter((p) => p.owner === userId),
    [playlists.data, userId],
  );
  const savedPlaylists = useMemo(() => {
    const fromLibrary = (library.data?.playlists ?? []).filter(
      (p) => p.owner !== userId,
    );
    const fromList = (playlists.data ?? []).filter((p) => p.owner !== userId);
    const seen = new Set<string>();
    return [...fromLibrary, ...fromList].filter((p) => {
      if (seen.has(p._id)) return false;
      seen.add(p._id);
      return true;
    });
  }, [library.data, playlists.data, userId]);

  const savedVideos = library.data?.saved ?? [];
  const watchLaterEntries = useMemo(() => {
    const rows = (watchLater.data ?? [])
      .map((e) => ({
        video: videoOf(e.videoid),
        savedAt: e.likedon ?? e.createdAt,
      }))
      .filter((r): r is { video: Video; savedAt: string | undefined } =>
        Boolean(r.video),
      );
    if (sort === "title") {
      return [...rows].sort((a, b) =>
        (a.video.videotitle ?? "").localeCompare(b.video.videotitle ?? ""),
      );
    }
    return rows;
  }, [watchLater.data, sort, byId]);
  const likedVideos = (liked.data ?? [])
    .map((e) => videoOf(e.videoid))
    .filter((v): v is Video => Boolean(v));

  const firstWatchLater = watchLaterEntries[0]?.video;
  const firstSaved = savedVideos[0];

  const userName = currentuser?.result.name ?? "";
  const initial = (
    currentuser?.result.name ?? currentuser?.result.email ?? "?"
  )
    .charAt(0)
    .toUpperCase();

  if (view === "subscriptions") {
    // Honest empty state: there is no subscribe/follow system, so no
    // subscription rows exist to render — never fake any.
    return (
      <div className="container_Pages_App">
        <div className="container2_Pages_App library-page">
          <AccountNavPills />
          <h1>Subscriptions</h1>
          <div className="acube-empty" role="status">
            <p style={{ fontWeight: 700, color: "var(--text)" }}>
              No subscriptions yet
            </p>
            <p>
              Acube doesn&apos;t have a follow system yet, so there are no
              channels to follow and nothing to show here. Videos you save
              or like still live in your library.
            </p>
          </div>
          <Link to="/library" className="acube-btn-secondary">
            Back to your library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container_Pages_App">
      <div className="container2_Pages_App library-page">
        <AccountNavPills />
        <div className="library-head">
          <span className="library-avatar" aria-hidden="true">
            {initial}
          </span>
          <div>
            <h1>Your library</h1>
            <p className="library-subtitle">
              {userName ? `${userName} · ` : ""}
              Everything you&apos;ve saved, liked and queued — private to you
            </p>
          </div>
        </div>

        <section
          id="watch-later"
          className="library-section"
          aria-labelledby="watch-later-heading"
        >
          <div className="shelf-head">
            <h2 id="watch-later-heading">⏱ Watch Later</h2>
            <div className="shelf-meta">
              <span>
                {watchLaterEntries.length}{" "}
                {watchLaterEntries.length === 1 ? "video" : "videos"} ·{" "}
              </span>
              {firstWatchLater ? (
                <Link to={`/watch/${firstWatchLater._id}`}>Play all ▶</Link>
              ) : null}
              <span> · Sort: </span>
              <select
                className="acube-select"
                aria-label="Sort Watch Later"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="recent">Recently saved</option>
                <option value="title">Title A–Z</option>
              </select>
            </div>
          </div>
          {watchLater.isLoading ? (
            <div className="acube-skeleton" style={{ height: 48 }} role="status" aria-label="Loading watch later" />
          ) : watchLater.isError ? (
            <p role="alert">Could not load Watch Later.</p>
          ) : watchLaterEntries.length === 0 ? (
            <div className="acube-empty" role="status">
              <p>Nothing saved for later yet.</p>
            </div>
          ) : (
            <div className="library-grid">
              {watchLaterEntries.map(({ video, savedAt }) => (
                <VideoCard
                  key={video._id}
                  video={video}
                  sub={`${video.uploader ?? "Unknown channel"} · ${formatSavedAt(savedAt)}`}
                  removeLabel={`Remove ${video.videotitle} from Watch Later`}
                  onRemove={() =>
                    userId &&
                    deleteWatchLater.mutate({ videoid: video._id, viewer: userId })
                  }
                />
              ))}
            </div>
          )}
        </section>

        <section
          id="saved"
          className="library-section"
          aria-labelledby="saved-heading"
        >
          <div className="shelf-head">
            {/* Heading is exactly "Saved": the count lives in the line
                below, so a heading query for "Saved" never collides with
                "Your playlists & Saved playlists" (see e2e test 9). */}
            <h2 id="saved-heading">Saved</h2>
          </div>
          <p className="shelf-count">
            {savedVideos.length}{" "}
            {savedVideos.length === 1 ? "video" : "videos"}
          </p>
          {firstSaved ? (
            <Link
              to={`/watch/${firstSaved._id}`}
              className="acube-btn-secondary library-play-all"
            >
              Play all
            </Link>
          ) : null}
          {library.isLoading ? (
            <div className="acube-skeleton" style={{ height: 48 }} role="status" aria-label="Loading saved videos" />
          ) : library.isError ? (
            <p role="alert">Could not load saved videos.</p>
          ) : savedVideos.length === 0 ? (
            <div className="acube-empty" role="status">
              <p>No saved videos yet. Use Save on any video to add one.</p>
            </div>
          ) : (
            <div className="library-grid">
              {savedVideos.map((v) => (
                <VideoCard
                  key={v._id}
                  video={v}
                  sub={viewsLabel(v)}
                  removeLabel={`Remove ${v.videotitle} from Saved`}
                  onRemove={() =>
                    removeLibrary.mutate({ videoid: v._id, kind: "saved" })
                  }
                />
              ))}
            </div>
          )}
        </section>

        <section
          id="liked"
          className="library-section"
          aria-labelledby="liked-heading"
        >
          <div className="shelf-head">
            <h2 id="liked-heading">👍 Liked videos</h2>
            <div className="shelf-meta">
              <span>
                {likedVideos.length}{" "}
                {likedVideos.length === 1 ? "video" : "videos"} · Most recent
                first
              </span>
            </div>
          </div>
          {liked.isLoading ? (
            <div className="acube-skeleton" style={{ height: 48 }} role="status" aria-label="Loading liked videos" />
          ) : liked.isError ? (
            <p role="alert">Could not load liked videos.</p>
          ) : likedVideos.length === 0 ? (
            <div className="acube-empty" role="status">
              <p>No liked videos yet.</p>
            </div>
          ) : (
            <div className="library-grid">
              {likedVideos.map((v) => (
                <VideoCard
                  key={v._id}
                  video={v}
                  sub={viewsLabel(v)}
                  removeLabel={`Remove ${v.videotitle} from Liked videos`}
                  onRemove={() =>
                    userId &&
                    deleteLiked.mutate({ videoid: v._id, viewer: userId })
                  }
                />
              ))}
              <div className="library-note-card">
                <p>Liked videos are private by default</p>
              </div>
            </div>
          )}
        </section>

        <section
          className="library-section"
          aria-labelledby="playlists-heading"
        >
          <div className="shelf-head">
            <h2 id="playlists-heading">▤ Your playlists &amp; Saved playlists</h2>
            <button
              type="button"
              className="shelf-action"
              onClick={focusCreate}
            >
              + New playlist
            </button>
          </div>
          {playlists.isLoading ? (
            <div className="acube-skeleton" style={{ height: 48 }} role="status" aria-label="Loading playlists" />
          ) : playlists.isError ? (
            <p role="alert">Could not load playlists.</p>
          ) : (
            <>
              {ownPlaylists.length === 0 && savedPlaylists.length === 0 ? (
                <div className="acube-empty" role="status">
                  <p>No playlists yet. Create your first one below.</p>
                </div>
              ) : (
                <div className="playlist-grid">
                  {ownPlaylists.map((p: Playlist) => (
                    <div
                      key={p._id}
                      className="playlist-card"
                      style={{ background: gradientFor(p._id) }}
                    >
                      <Link
                        to={`/playlist/${p._id}`}
                        className="playlist-card-link"
                      >
                        <span className="playlist-card-title">{p.title}</span>
                        <span className="playlist-card-meta">
                          {p.videoIds.length}{" "}
                          {p.videoIds.length === 1 ? "video" : "videos"} ·
                          Yours · {p.visibility}
                        </span>
                      </Link>
                      <button
                        type="button"
                        className="playlist-card-delete"
                        aria-label={`Delete playlist ${p.title}`}
                        onClick={() => deletePlaylist.mutate(p._id)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {savedPlaylists.map((p: Playlist) => (
                    <div
                      key={p._id}
                      className="playlist-card"
                      style={{ background: gradientFor(p._id) }}
                    >
                      <Link
                        to={`/playlist/${p._id}`}
                        className="playlist-card-link"
                      >
                        <span className="playlist-card-title">{p.title}</span>
                        <span className="playlist-card-meta">
                          {p.videoIds.length}{" "}
                          {p.videoIds.length === 1 ? "video" : "videos"} ·
                          Saved playlist
                        </span>
                      </Link>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="playlist-card playlist-card-new"
                    onClick={focusCreate}
                  >
                    <span className="playlist-card-title">
                      + Create playlist
                    </span>
                    <span className="playlist-card-meta">
                      From any video&apos;s Save menu
                    </span>
                  </button>
                </div>
              )}
            </>
          )}
          <form onSubmit={handleCreate} className="playlist-create">
            <input
              ref={createInputRef}
              className="acube-input"
              aria-label="New playlist title"
              placeholder="New playlist title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <select
              className="acube-select"
              aria-label="New playlist visibility"
              value={newVisibility}
              onChange={(e) =>
                setNewVisibility(e.target.value as VideoVisibility)
              }
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
            <button type="submit" className="acube-btn">
              Create playlist
            </button>
          </form>
          <p className="playlist-create-note">
            + Create playlist — also from any video&apos;s Save menu.
          </p>
          {createPlaylist.isError ? (
            <p role="alert" style={{ color: "var(--danger)" }}>
              Could not create the playlist. Please try again.
            </p>
          ) : null}
        </section>

        {userId ? null : (
          <p style={{ color: "var(--text-2)" }}>
            Sign in to see your saved videos and playlists.
          </p>
        )}
      </div>
    </div>
  );
}
