// Home video card (approved preview, screen A): 16:9 thumbnail with a
// duration badge bottom-right, channel avatar on the LEFT below the
// thumbnail, then the title, then one meta line "Channel name · views"
// with the views pushed to the right side of that line. No upload time
// (the preview shows none).
//
// The thumbnail is the video's real thumbnail when it loads; when the
// video has none (or it fails to load) VideoThumb falls back to a
// deterministic gradient + centred ▶ — the same pattern Studio Content
// uses. Duration comes from the server (durationSec, else the legacy
// `duration` field); a video with no duration shows no badge — never
// an invented one. Views are the server's count, comma-formatted; a
// video with no view count shows the channel name only.
import React from "react";
import { Link } from "react-router";
import VideoThumb, {
  deterministicThumbGradient,
} from "../../Component/VideoThumb";
import type { Video } from "../../types";

function formatDuration(sec: number | null | undefined): string | null {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec <= 0)
    return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const HomeVideoCard = ({ vid }: { vid: Video }) => {
  const duration = formatDuration(vid.durationSec ?? vid.duration);
  const thumbnailSrc = vid.thumbnailUrl ?? vid.thumbnail ?? undefined;
  const viewsText =
    typeof vid.views === "number" && Number.isFinite(vid.views)
      ? `${vid.views.toLocaleString("en-US")} views`
      : null;
  const initial = vid.uploader?.charAt(0).toUpperCase() ?? "";
  const avatarBackground = deterministicThumbGradient(
    vid.uploader ?? vid._id,
  );

  return (
    <div className="home-video-card">
      <Link to={`/watch/${vid._id}`} className="home-video-thumb-link">
        <VideoThumb
          src={thumbnailSrc}
          className="home-video-thumb"
          fallbackBackground={deterministicThumbGradient(vid._id)}
        />
        {duration ? (
          <span className="home-video-duration-badge">{duration}</span>
        ) : null}
      </Link>
      <div className="home-video-description">
        <div
          className="home-channel-avatar"
          style={{ background: avatarBackground }}
          aria-hidden="true"
        >
          {initial}
        </div>
        <div className="home-video-details">
          <p className="home-video-title">{vid.videotitle}</p>
          <p className="home-video-meta">
            <span className="home-video-channel">{vid.uploader}</span>
            {viewsText ? (
              <span className="home-video-views">· {viewsText}</span>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
};

export default HomeVideoCard;
