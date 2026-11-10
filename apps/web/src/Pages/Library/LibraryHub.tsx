// Phase 5 — Library hub at /library: Watch Later / Saved shelf, Liked
// videos, your playlists + saved playlists, with create-playlist.
// NOTE: the existing /Library route (capital L) still renders the old
// Library page untouched; /library renders this new hub. The sidebar now
// links to /library.
import React, { useState } from "react";
import { Link } from "react-router";
import Leftsidebar from "../../Component/Leftsidebar/Leftsidebar";
import { useAppSelector } from "../../store";
import {
  useCreatePlaylist,
  useLibrary,
  useLikedVideos,
  useStudioPlaylists,
  useVideosById,
  useWatchLater,
} from "../../query/hooks";

export default function LibraryHub() {
  const currentuser = useAppSelector((s) => s.auth.session);
  const userId = currentuser?.result._id;
  const liked = useLikedVideos();
  const watchLater = useWatchLater();
  // Contract fix: the Saved shelf reads GET /studio/library (LibraryEntry
  // rows), which the old Watch Later / Liked lists do not cover.
  const library = useLibrary();
  const playlists = useStudioPlaylists();
  const createPlaylist = useCreatePlaylist();
  const byId = useVideosById();
  const [newTitle, setNewTitle] = useState("");

  const videoTitle = (videoid: string) =>
    byId[videoid]?.videotitle ?? "Video";

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createPlaylist.mutate({ title: newTitle.trim(), visibility: "private" });
    setNewTitle("");
  };

  return (
    <div className="container_Pages_App">
      <div className="at_small_sizel">
        <Leftsidebar />
      </div>
      <div className="container2_Pages_App" style={{ padding: 24 }}>
        <h1>Library</h1>
        <section style={{ marginBottom: 32 }}>
          <h2>Watch Later</h2>
          {watchLater.isLoading ? (
            <div className="acube-skeleton" style={{ height: 48 }} role="status" aria-label="Loading watch later" />
          ) : watchLater.isError ? (
            <p role="alert">Could not load Watch Later.</p>
          ) : (watchLater.data?.length ?? 0) === 0 ? (
            <div className="acube-empty" role="status">
              <p>Nothing saved for later yet.</p>
            </div>
          ) : (
            watchLater.data?.map((e) => (
              <div key={e._id} className="studio-list-row">
                <Link to={`/watch/${e.videoid}`}>{videoTitle(e.videoid)}</Link>
              </div>
            ))
          )}
        </section>
        <section style={{ marginBottom: 32 }}>
          <h2>Liked videos</h2>
          {liked.isLoading ? (
            <div className="acube-skeleton" style={{ height: 48 }} role="status" aria-label="Loading liked videos" />
          ) : liked.isError ? (
            <p role="alert">Could not load liked videos.</p>
          ) : (liked.data?.length ?? 0) === 0 ? (
            <div className="acube-empty" role="status">
              <p>No liked videos yet.</p>
            </div>
          ) : (
            liked.data?.map((e) => (
              <div key={e._id} className="studio-list-row">
                <Link to={`/watch/${e.videoid}`}>{videoTitle(e.videoid)}</Link>
              </div>
            ))
          )}
        </section>
        <section style={{ marginBottom: 32 }}>
          <h2>Saved</h2>
          {library.isLoading ? (
            <div className="acube-skeleton" style={{ height: 48 }} role="status" aria-label="Loading saved videos" />
          ) : library.isError ? (
            <p role="alert">Could not load saved videos.</p>
          ) : (library.data?.saved.length ?? 0) === 0 ? (
            <div className="acube-empty" role="status">
              <p>No saved videos yet.</p>
            </div>
          ) : (
            library.data?.saved.map((v) => (
              <div key={v._id} className="studio-list-row">
                <Link to={`/watch/${v._id}`}>{v.videotitle}</Link>
              </div>
            ))
          )}
        </section>
        <section style={{ marginBottom: 32 }}>
          <h2>Your playlists</h2>
          {playlists.isLoading ? (
            <div className="acube-skeleton" style={{ height: 48 }} role="status" aria-label="Loading playlists" />
          ) : playlists.isError ? (
            <p role="alert">Could not load playlists.</p>
          ) : (playlists.data?.length ?? 0) === 0 ? (
            <div className="acube-empty" role="status">
              <p>No playlists yet. Create your first one below.</p>
            </div>
          ) : (
            playlists.data?.map((p) => (
              <div key={p._id} className="studio-list-row">
                <Link to={`/playlist/${p._id}`}>{p.title}</Link>
                <span style={{ color: "var(--text-2)" }}>
                  {p.videoIds.length}{" "}
                  {p.videoIds.length === 1 ? "video" : "videos"} · {p.visibility}
                </span>
              </div>
            ))
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
