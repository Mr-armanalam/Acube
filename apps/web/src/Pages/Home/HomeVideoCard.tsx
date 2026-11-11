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
//
// Hover preview (YouTube-style): hovering a card and staying starts a
// muted, looping preview of the video itself after a dwell; leaving
// the card stops it and restores the thumbnail. Only one preview plays
// at a time — the grid (Home.tsx) owns the active id and passes it
// down. Nothing is fetched until the dwell fires (the <video> mounts
// only then, preload="none"); a failed preview falls back to the
// thumbnail silently; previews never start under
// prefers-reduced-motion, while the tab is hidden, or while the card
// is scrolled out of view. Touch is unchanged — a tap navigates.
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import VideoThumb, {
  deterministicThumbGradient,
} from "../../Component/VideoThumb";
import { resolveApiMediaUrl } from "../../Api";
import type { Video } from "../../types";

/** Hover dwell before a preview starts (ms). */
export const HOVER_PREVIEW_DWELL_MS = 900;
/** Preview start position as a fraction of duration — 10% in, to skip
 * black intro frames. */
export const HOVER_PREVIEW_START_FRACTION = 0.1;

function formatDuration(sec: number | null | undefined): string | null {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec <= 0)
    return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const HomeVideoCard = ({
  vid,
  previewActive,
  onPreviewRequest,
  onPreviewEnd,
}: {
  vid: Video;
  /** True when this card is the grid's one active preview. */
  previewActive: boolean;
  /** Card asks the grid to make it the active preview (after dwell). */
  onPreviewRequest: (id: string) => void;
  /** Card reports its preview ended (leave / hidden tab / scrolled out / error). */
  onPreviewEnd: (id: string) => void;
}) => {
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

  const rootRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A preview that errored never retries for this video.
  const [previewFailed, setPreviewFailed] = useState(false);
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  // A new video gets a fresh preview chance.
  useEffect(() => {
    setPreviewFailed(false);
  }, [vid._id]);

  const clearDwellTimer = () => {
    if (dwellTimerRef.current !== null) {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
  };
  const endPreview = () => {
    clearDwellTimer();
    if (previewActive) onPreviewEnd(vid._id);
  };
  // The timer is the only thing a card owns; the grid owns the active
  // id, so unmounting clears the timer but leaves the grid's state
  // alone (a filtered-out card simply renders nothing).
  useEffect(() => clearDwellTimer, []);

  const onMouseEnter = () => {
    if (reducedMotion || previewFailed || previewActive) return;
    clearDwellTimer();
    dwellTimerRef.current = setTimeout(() => {
      onPreviewRequest(vid._id);
    }, HOVER_PREVIEW_DWELL_MS);
  };
  const onMouseLeave = () => {
    endPreview();
  };

  // Stop the preview when the tab is hidden.
  useEffect(() => {
    if (!previewActive) return;
    const onVisibilityChange = () => {
      if (document.hidden) onPreviewEnd(vid._id);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [previewActive, vid._id, onPreviewEnd]);

  // Stop the preview when the card scrolls out of view. The observer
  // exists only while a preview is active — one per grid, not one per
  // card — so the grid's pagination sentinel observer is untouched
  // (and no observer is created for cards that never preview).
  useEffect(() => {
    if (!previewActive) return;
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => !entry.isIntersecting)) {
        onPreviewEnd(vid._id);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [previewActive, vid._id, onPreviewEnd]);

  // Play once the preview mounts. Muted playback should be allowed;
  // if the browser still blocks it, keep the paused first frame
  // rather than failing the preview.
  useEffect(() => {
    if (!previewActive || previewFailed) return;
    const video = videoRef.current;
    if (!video) return;
    const attempt = video.play() as unknown as Promise<void> | undefined;
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => {
        /* Autoplay blocked: the paused first frame is still a preview. */
      });
    }
  }, [previewActive, previewFailed]);

  const previewing = previewActive && !previewFailed;

  return (
    <div
      className="home-video-card"
      ref={rootRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Link to={`/watch/${vid._id}`} className="home-video-thumb-link">
        {previewing ? (
          <video
            ref={videoRef}
            className="home-video-thumb"
            src={resolveApiMediaUrl(vid.filepath)}
            muted
            loop
            playsInline
            preload="none"
            aria-label={`Preview of ${vid.videotitle}`}
            onLoadedMetadata={(e) => {
              const video = e.currentTarget;
              if (
                Number.isFinite(video.duration) &&
                video.duration > 0
              ) {
                video.currentTime =
                  video.duration * HOVER_PREVIEW_START_FRACTION;
              }
            }}
            onError={() => {
              setPreviewFailed(true);
              onPreviewEnd(vid._id);
            }}
          />
        ) : (
          <VideoThumb
            src={thumbnailSrc}
            className="home-video-thumb"
            fallbackBackground={deterministicThumbGradient(vid._id)}
          />
        )}
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
