// Phase 5 fix — Library hub at /library (preview screen J): Watch
// Later / Saved shelf, Liked videos, your playlists + SAVED playlists
// (playlists owned by others), with thumbnails, remove buttons, shelf
// counts, Play-all / Sort, and an add-to-playlist entry point (the
// Watch Save menu creates kind:"saved" rows). The old /Library
// duplication is deleted — this hub is the only library page.
import React, { useMemo, useState } from "react";
import { Link } from "react-router";
import Leftsidebar from "../../Component/Leftsidebar/Leftsidebar";
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
import type { Playlist, Video } from "../../types";

function Thumb({ video }: { video: Video }) {
  const src = video.thumbnailUrl ?? video.thumbnail ?? undefined;
  if (src) {
    return (
      <img
        className="studio-row-thumb"
        src={src}
        alt=""
        style={{ width: 120 }}
      />
    );
  }
  return (
    <span
      className="studio-row-thumb"
      style={{
        width: 120,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-2)",
        fontWeight: 700,
      }}
      aria-hidden="true"
    >
      {(video.videotitle ?? "?").charAt(0).toUpperCase()}
    </span>
  );
}

function sortVideos(videos: Video[], sort: string): Video[] {
  if (sort === "title") {
    return [...videos].sort((a, b) =>
      (a.videotitle ?? "").localeCompare(b.videotitle ?? ""),
    );
  }
  return videos;
}

export default function LibraryHub() {
  const currentuser = useAppSelector((s) => s.auth.session);
  const userId = currentuser?.result._id;
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
  const [sort, setSort] = useState("recent");

  const videoOf = (videoid: string) => byId[videoid];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createPlaylist.mutate({ title: newTitle.trim(), visibility: "private" });
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

  const savedVideos = sortVideos(library.data?.saved ?? [], sort);
  const watchLaterVideos = (watchLater.data ?? [])
    .map((e) => videoOf(e.videoid))
    .filter((v): v is Video => Boolean(v));
  const likedVideos = (liked.data ?? [])
    .map((e) => videoOf(e.videoid))
    .filter((v): v is Video => Boolean(v));

  const firstWatchLater = watchLaterVideos[0];
  const firstSaved = savedVideos[0];

  return (
    <div className="container_Pages_App">
      <div className="at_small_sizel">
        <Leftsidebar />
      </div>
      <div className="container2_Pages_App" style={{ padding: 24 }}>
        <h1>Your library</h1>
        <p style={{ color: "var(--text-2)" }}>
          Everything you&apos;ve saved, liked and queued — private to you
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            Sort:
            <select
              className="acube-select"
              aria-label="Sort library"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="recent">Recently saved</option>
              <option value="title">Title A–Z</option>
            </select>
          </label>
        </div>

        <section style={{ marginBottom: 32 }}>
          <h2>
            Watch Later · {watchLaterVideos.length}{" "}
            {watchLaterVideos.length === 1 ? "video" : "videos"}
          </h2>
          {firstWatchLater ? (
            <Link to={`/watch/${firstWatchLater._id}`} className="acube-btn-secondary">
              Play all
            </Link>
          ) : null}
          {watchLater.isLoading ? (
            <div className="acube-skeleton" style={{ height: 48 }} role="status" aria-label="Loading watch later" />
          ) : watchLater.isError ? (
            <p role="alert">Could not load Watch Later.</p>
          ) : watchLaterVideos.length === 0 ? (
            <div className="acube-empty" role="status">
              <p>Nothing saved for later yet.</p>
            </div>
          ) : (
            watchLaterVideos.map((v) => (
              <div key={v._id} className="studio-list-row">
                <Thumb video={v} />
                <Link to={`/watch/${v._id}`} style={{ flex: 1 }}>{v.videotitle}</Link>
                <button
                  type="button"
                  className="acube-btn-danger"
                  aria-label={`Remove ${v.videotitle} from Watch Later`}
                  onClick={() =>
                    userId &&
                    deleteWatchLater.mutate({ videoid: v._id, viewer: userId })
                  }
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>
            Saved · {savedVideos.length}{" "}
            {savedVideos.length === 1 ? "video" : "videos"}
          </h2>
          {firstSaved ? (
            <Link to={`/watch/${firstSaved._id}`} className="acube-btn-secondary">
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
            savedVideos.map((v) => (
              <div key={v._id} className="studio-list-row">
                <Thumb video={v} />
                <Link to={`/watch/${v._id}`} style={{ flex: 1 }}>{v.videotitle}</Link>
                <button
                  type="button"
                  className="acube-btn-danger"
                  aria-label={`Remove ${v.videotitle} from Saved`}
                  onClick={() =>
                    removeLibrary.mutate({ videoid: v._id, kind: "saved" })
                  }
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>
            Liked videos · {likedVideos.length}{" "}
            {likedVideos.length === 1 ? "video" : "videos"}
          </h2>
          <p style={{ color: "var(--text-2)" }}>Liked videos are private by default</p>
          {liked.isLoading ? (
            <div className="acube-skeleton" style={{ height: 48 }} role="status" aria-label="Loading liked videos" />
          ) : liked.isError ? (
            <p role="alert">Could not load liked videos.</p>
          ) : likedVideos.length === 0 ? (
            <div className="acube-empty" role="status">
              <p>No liked videos yet.</p>
            </div>
          ) : (
            likedVideos.map((v) => (
              <div key={v._id} className="studio-list-row">
                <Thumb video={v} />
                <Link to={`/watch/${v._id}`} style={{ flex: 1 }}>{v.videotitle}</Link>
                <button
                  type="button"
                  className="acube-btn-danger"
                  aria-label={`Remove ${v.videotitle} from Liked videos`}
                  onClick={() =>
                    userId &&
                    deleteLiked.mutate({ videoid: v._id, viewer: userId })
                  }
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>Your playlists &amp; Saved playlists</h2>
          {playlists.isLoading ? (
            <div className="acube-skeleton" style={{ height: 48 }} role="status" aria-label="Loading playlists" />
          ) : playlists.isError ? (
            <p role="alert">Could not load playlists.</p>
          ) : (
            <>
              {ownPlaylists.map((p: Playlist) => (
                <div key={p._id} className="studio-list-row">
                  <Link to={`/playlist/${p._id}`} style={{ flex: 1 }}>{p.title}</Link>
                  <span style={{ color: "var(--text-2)" }}>
                    {p.videoIds.length}{" "}
                    {p.videoIds.length === 1 ? "video" : "videos"} · Yours · {p.visibility}
                  </span>
                  <button
                    type="button"
                    className="acube-btn-danger"
                    aria-label={`Delete playlist ${p.title}`}
                    onClick={() => deletePlaylist.mutate(p._id)}
                  >
                    Delete
                  </button>
                </div>
              ))}
              {savedPlaylists.map((p: Playlist) => (
                <div key={p._id} className="studio-list-row">
                  <Link to={`/playlist/${p._id}`} style={{ flex: 1 }}>{p.title}</Link>
                  <span style={{ color: "var(--text-2)" }}>
                    {p.videoIds.length}{" "}
                    {p.videoIds.length === 1 ? "video" : "videos"} · Saved playlist
                  </span>
                </div>
              ))}
              {ownPlaylists.length === 0 && savedPlaylists.length === 0 ? (
                <div className="acube-empty" role="status">
                  <p>No playlists yet. Create your first one below.</p>
                </div>
              ) : null}
            </>
          )}
          <form onSubmit={handleCreate} style={{ marginTop: 12 }}>
            <input
              className="acube-input"
              aria-label="New playlist title"
              placeholder="New playlist title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />{" "}
            <button type="submit" className="acube-btn">
              Create playlist
            </button>
          </form>
          <p style={{ color: "var(--text-2)" }}>
            + Create playlist — also from any video&apos;s Save menu.
          </p>
          {createPlaylist.isError ? (
            <p role="alert" style={{ color: "var(--danger)" }}>
              Could not create the playlist. Please try again.
            </p>
          ) : null}
        </section>

        <section>
          <h2>More</h2>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link to="/history" className="acube-btn-secondary">
              Watch history
            </Link>
            <Link to="/Yourvideo" className="acube-btn-secondary">
              Your videos
            </Link>
            <Link to="/studio" className="acube-btn-secondary">
              Creator Studio
            </Link>
          </div>
          {userId ? null : (
            <p style={{ color: "var(--text-2)" }}>
              Sign in to see your saved videos and playlists.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
