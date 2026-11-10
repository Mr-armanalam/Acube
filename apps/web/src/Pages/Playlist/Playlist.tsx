// Phase 5 — Playlist page at /playlist/:id: playlist title/description,
// its videos (in playlist order), empty state when it has none.
// Contract fix: reads the PUBLIC GET /studio/playlists/:id endpoint
// (visibility rules server-side), not the owner-only playlist list —
// another creator's public/unlisted playlist must render here, and a
// logged-out visitor must be able to open it.
import React, { useMemo } from "react";
import { Link, useParams } from "react-router";
import Leftsidebar from "../../Component/Leftsidebar/Leftsidebar";
import { useStudioPlaylist, useVideosById } from "../../query/hooks";

export default function PlaylistPage() {
  const { id } = useParams();
  const playlistQuery = useStudioPlaylist(id);
  const byId = useVideosById();

  const playlist = playlistQuery.data;
  const videos = useMemo(() => {
    if (!playlist) return [];
    // Prefer the ordered `videos` array the endpoint returns; fall back
    // to the feed cache for any id it did not include.
    if (playlist.videos && playlist.videos.length > 0) return playlist.videos;
    return playlist.videoIds
      .map((vid) => byId[vid])
      .filter((v): v is NonNullable<typeof v> => Boolean(v));
  }, [playlist, byId]);

  return (
    <div className="container_Pages_App">
      <div className="at_small_sizel">
        <Leftsidebar />
      </div>
      <div className="container2_Pages_App" style={{ padding: 24 }}>
        {playlistQuery.isLoading ? (
          <div className="acube-skeleton" style={{ height: 96 }} role="status" aria-label="Loading playlist" />
        ) : playlistQuery.isError ? (
          <div className="acube-empty" role="alert">
            <p>Could not load this playlist.</p>
            <button type="button" className="acube-btn" onClick={() => void playlistQuery.refetch()}>
              Retry
            </button>
          </div>
        ) : !playlist ? (
          <div className="acube-empty" role="status">
            <p style={{ fontWeight: 700, color: "var(--text)" }}>Playlist not found</p>
            <p>This playlist may be private or may not exist.</p>
          </div>
        ) : (
          <>
            <h1>{playlist.title}</h1>
            {playlist.description ? (
              <p style={{ color: "var(--text-2)" }}>{playlist.description}</p>
            ) : null}
            <p style={{ color: "var(--text-2)" }}>
              {videos.length} {videos.length === 1 ? "video" : "videos"} ·{" "}
              {playlist.visibility}
            </p>
            {videos.length === 0 ? (
              <div className="acube-empty" role="status">
                <p>This playlist is empty.</p>
              </div>
            ) : (
              videos.map((v) => (
                <div key={v._id} className="studio-list-row">
                  <Link to={`/watch/${v._id}`} style={{ color: "var(--text)", fontWeight: 600 }}>
                    {v.videotitle}
                  </Link>
                  <span style={{ color: "var(--text-2)" }}>
                    {v.uploader} · {v.views ?? 0} views
                  </span>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
