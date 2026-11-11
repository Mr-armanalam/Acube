// Phase 5 fix — Playlist page at /playlist/:id: playlist
// title/description, its videos in playlist order with index numbers
// and thumbnails, Play all, and owner-only remove-video actions.
// PUBLIC read: the route has no RequireAuth guard (visibility rules
// are server-side) — a logged-out visitor can open a public/unlisted
// playlist. Only owner mutations are guarded, by checking the session
// against playlist.owner.
import React, { useMemo } from "react";
import { Link, useParams } from "react-router";
import VideoThumb from "../../Component/VideoThumb";
import { useAppSelector } from "../../store";
import {
  useStudioPlaylist,
  useUpdatePlaylist,
  useVideosById,
} from "../../query/hooks";

export default function PlaylistPage() {
  const { id } = useParams();
  const playlistQuery = useStudioPlaylist(id);
  const byId = useVideosById();
  const currentuser = useAppSelector((s) => s.auth.session);
  const updatePlaylist = useUpdatePlaylist();

  const playlist = playlistQuery.data;
  const videos = useMemo(() => {
    if (!playlist) return [];
    if (playlist.videos && playlist.videos.length > 0) return playlist.videos;
    return playlist.videoIds
      .map((vid) => byId[vid])
      .filter((v): v is NonNullable<typeof v> => Boolean(v));
  }, [playlist, byId]);

  const isOwner =
    Boolean(currentuser?.result._id) &&
    currentuser?.result._id === playlist?.owner;

  return (
    <div className="container_Pages_App">
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
            {videos.length > 0 ? (
              <Link
                to={`/watch/${videos[0]._id}`}
                className="acube-btn-secondary"
              >
                Play all
              </Link>
            ) : null}
            {videos.length === 0 ? (
              <div className="acube-empty" role="status">
                <p>This playlist is empty.</p>
              </div>
            ) : (
              videos.map((v, i) => (
                <div key={v._id} className="studio-list-row">
                  <span style={{ color: "var(--text-2)", fontWeight: 700 }}>
                    {i + 1}.
                  </span>
                  {v.thumbnailUrl || v.thumbnail ? (
                    <VideoThumb
                      className="studio-row-thumb"
                      src={v.thumbnailUrl ?? v.thumbnail ?? ""}
                      style={{ width: 120 }}
                    />
                  ) : null}
                  <Link to={`/watch/${v._id}`} style={{ color: "var(--text)", fontWeight: 600, flex: 1 }}>
                    {v.videotitle}
                  </Link>
                  <span style={{ color: "var(--text-2)" }}>
                    {v.uploader} · {v.views ?? 0} views
                  </span>
                  {isOwner ? (
                    <button
                      type="button"
                      className="acube-btn-danger"
                      aria-label={`Remove ${v.videotitle} from playlist`}
                      onClick={() =>
                        updatePlaylist.mutate({
                          id: playlist._id,
                          removeVideoIds: [v._id],
                        })
                      }
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
