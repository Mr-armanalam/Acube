// Phase 5 — rebuilt video watch page at /watch/:id. Uses the new custom
// Player, nested comments, ranked "Up next" (same channel first, then
// same uploader/topic) and a playlist showcase panel when the video
// belongs to one of the creator's playlists.
import React, { useEffect, useMemo } from "react";
import "./Watch.css";
import { formatDistanceToNow } from "date-fns";
import { Link, useParams } from "react-router";
import { useAppSelector } from "../../store";
import {
  useAddToHistory,
  useStudioPlaylists,
  useVideo,
  useVideos,
  useViewVideo,
  useWatchComplete,
} from "../../query/hooks";
import Likewatchlatersavebtns from "../Videopage/Likewatchlatersavebtns";
import LoadingCard from "../../Component/LoadingCard";
import Player from "./Player";
import NestedComments from "./NestedComments";

const Watch = () => {
  const { id } = useParams();
  // Contract fix: the video itself comes from GET /video/:id (visibility
  // rules server-side) — NOT from filtering the page-1 feed, which omits
  // unlisted videos and anything past page 1. The feed list is only
  // used for the "Up next" ranking below.
  const videoQuery = useVideo(id);
  const { data } = useVideos();
  const currentuser = useAppSelector((s) => s.auth.session);
  const viewMutation = useViewVideo();
  const historyMutation = useAddToHistory();
  const watchCompleteMutation = useWatchComplete();
  const playlistsQuery = useStudioPlaylists();
  const vv = videoQuery.data;

  const viewerId = currentuser?.result?._id;
  useEffect(() => {
    if (id) viewMutation.mutate(id);
    // Count one view per page mount, as before.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (viewerId && id) {
      historyMutation.mutate({ videoid: id, viewer: viewerId });
    }
    // Record history once per page mount for the signed-in viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, viewerId]);

  // Ranked "Up next": same channel first, then the rest (newest first).
  const upNext = useMemo(() => {
    if (!data || !vv) return [];
    const others = data.filter((v) => v._id !== vv._id);
    const sameChannel = others.filter((v) => v.videochanel === vv.videochanel);
    const rest = others.filter((v) => v.videochanel !== vv.videochanel);
    return [...sameChannel, ...rest];
  }, [data, vv]);

  const playlist = useMemo(() => {
    if (!id || !playlistsQuery.data) return undefined;
    return playlistsQuery.data.find((p) => p.videoIds.includes(id));
  }, [id, playlistsQuery.data]);

  const playlistVideos = useMemo(() => {
    if (!playlist || !data) return [];
    return playlist.videoIds
      .map((vid) => data.find((v) => v._id === vid))
      .filter((v): v is NonNullable<typeof v> => Boolean(v));
  }, [playlist, data]);

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

  return (
    <div className="watch-page">
      <div className="watch-main">
        <Player
          src={vv.filepath}
          onEnded={() => {
            if (currentuser && id) {
              void watchCompleteMutation.mutateAsync(id);
            }
          }}
        />
        <h1 style={{ fontSize: 20, margin: "16px 0 8px" }}>{vv.videotitle}</h1>
        <div style={{ color: "var(--text-2)", marginBottom: 12 }}>
          {vv.views ?? 0} views ·{" "}
          {formatDistanceToNow(new Date(vv.createdat ?? Date.now()), {
            addSuffix: true,
          })}
        </div>
        <Likewatchlatersavebtns vv={vv} vid={id} />
        <Link
          to={`/channel/${vv.videochanel}`}
          style={{ display: "flex", gap: 12, alignItems: "center", margin: "16px 0", color: "var(--text)", textDecoration: "none" }}
        >
          <span className="studio-avatar">
            {(vv.uploader ?? "?").charAt(0).toUpperCase()}
          </span>
          <strong>{vv.uploader}</strong>
        </Link>
        <NestedComments videoid={vv._id} />
      </div>
      <aside className="watch-side">
        {playlist ? (
          <div className="acube-card" style={{ padding: 16, marginBottom: 24 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>
              Playlist: {playlist.title}
            </h2>
            <p style={{ color: "var(--text-2)", margin: "0 0 12px" }}>
              {playlistVideos.length}{" "}
              {playlistVideos.length === 1 ? "video" : "videos"}
            </p>
            <div className="watch-up-next">
              {playlistVideos.map((v) => (
                <Link key={v._id} to={`/watch/${v._id}`}>
                  {v.videotitle}
                </Link>
              ))}
            </div>
            <Link to={`/playlist/${playlist._id}`} style={{ display: "inline-block", marginTop: 12 }}>
              View full playlist
            </Link>
          </div>
        ) : null}
        <h2 style={{ fontSize: 16 }}>Up next</h2>
        <div className="watch-up-next">
          {upNext.map((v) => (
            <Link key={v._id} to={`/watch/${v._id}`}>
              {v.videotitle}
              <span style={{ display: "block", color: "var(--text-2)", fontWeight: 400, fontSize: 13 }}>
                {v.uploader} · {v.views ?? 0} views
              </span>
            </Link>
          ))}
        </div>
      </aside>
    </div>
  );
};

export default Watch;
