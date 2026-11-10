import React, { useCallback, useEffect, useRef, useState } from "react";
import "./videoPlayer.css";
import subtitle from "../../assets/subtitles.vtt";
import { useAppDispatch, useAppSelector } from "../../store";
import {
  setMuted,
  setPlaybackRate,
  setVolume,
  togglePlaying,
  toggleTheater,
} from "../../store/slices/playerSlice";
import { useWatchComplete } from "../../query/hooks";
import { useVideos } from "../../query/hooks";
import type { SessionProfile } from "../../types";

// Phase 2b: video list + points now come from TanStack Query; play /
// theater / mute / volume / rate flags live in the player RTK slice.
// High-frequency state (currentTime/duration) stays local.
function VideoPlayer({
  video,
  videoid,
  currentuser,
  commentRef,
}: {
  video: string | undefined;
  // Optional: only needed for the watch-complete points award. The
  // player renders fine without it (no points are awarded then).
  videoid?: string | undefined;
  currentuser: SessionProfile | null;
  commentRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { data: vids } = useVideos();
  const dispatch = useAppDispatch();
  const isPlaying = useAppSelector((s) => s.player.isPlaying);
  const watchCompleteMutation = useWatchComplete();

  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const volumeSliderRef = useRef<HTMLInputElement>(null);
  const speedBtnRef = useRef<HTMLButtonElement>(null);
  const isScrubbingRef = useRef(false);

  // Phase 2c: named, stable handler references so removeEventListener in
  // the effect cleanup actually removes the listeners that were added.
  // (The old cleanup passed NEW anonymous functions, which never matched.)
  const handleFullscreenChange = useCallback(() => {
    videoContainerRef.current?.classList.toggle(
      "full-screen",
      document.fullscreenElement != null,
    );
  }, [videoContainerRef]);

  const handleEnterPiP = useCallback(() => {
    videoContainerRef.current?.classList.add("mini-player");
  }, [videoContainerRef]);

  const handleLeavePiP = useCallback(() => {
    videoContainerRef.current?.classList.remove("mini-player");
  }, [videoContainerRef]);

  const [videosrc, setVideosrc] = useState("");
  const [currentTime, setCurrentTime] = useState<[number, number, number]>([
    0, 0, 0,
  ]);
  const [duration, setDuration] = useState<[number, number, number]>([0, 0, 0]);

  const sec2Min = (sec: number) => {
    const min = Math.floor(sec / 60);
    const hour = Math.floor(min / 60);
    const secRemain = Math.floor(sec % 60);
    return {
      min: min,
      sec: secRemain,
      hour: hour,
    };
  };

  const handlePlay = useCallback(() => {
    if (isPlaying) {
      videoRef.current?.pause();
    } else {
      // Phase 3c: play() rejects (NotSupportedError) when the source
      // is missing or unplayable. That must not surface as an unhandled
      // promise rejection — the toggle below still reflects the tap,
      // and the player shows its error state through the video element.
      videoRef.current?.play()?.catch(() => undefined);
    }
    dispatch(togglePlaying());
  }, [isPlaying, videoRef, dispatch]);

  const updateVolumeUI = useCallback(() => {
    if (videoRef.current?.muted || videoRef.current?.volume === 0) {
      if (volumeSliderRef.current) volumeSliderRef.current.value = "0";
      if (videoContainerRef.current)
        videoContainerRef.current.dataset.volumeLevel = "muted";
    } else if (
      videoRef.current?.volume !== undefined &&
      videoRef.current.volume >= 0.5
    ) {
      if (videoContainerRef.current)
        videoContainerRef.current.dataset.volumeLevel = "high";
    } else {
      if (videoContainerRef.current)
        videoContainerRef.current.dataset.volumeLevel = "low";
      if (volumeSliderRef.current && videoRef.current)
        volumeSliderRef.current.value = String(videoRef.current.volume);
    }
  }, [videoRef, volumeSliderRef, videoContainerRef]);

  const handleVolumeChange = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      const volume = parseFloat(e.currentTarget.value);
      if (!isNaN(volume)) {
        if (videoRef.current) {
          videoRef.current.volume = volume;
          videoRef.current.muted = volume === 0;
        }
        dispatch(setVolume(volume));
        updateVolumeUI();
      }
    },
    [videoRef, updateVolumeUI, dispatch],
  );

  const handleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current?.muted;
      dispatch(setMuted(videoRef.current.muted));
    }
    updateVolumeUI();
  }, [videoRef, updateVolumeUI, dispatch]);

  const handleScrubbing = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || !videoRef.current) return;
    const percent =
      Math.min(Math.max(0, e.clientX - rect.x), rect.width) / rect.width;
    isScrubbingRef.current = e.buttons === 1;
    if (isScrubbingRef.current) {
      videoRef.current.currentTime = percent * videoRef.current?.duration;
    }
    updateTimeline(percent);
  };

  const updateTimeline = (percent: number) => {
    timelineRef.current?.style.setProperty("--progress-position", String(percent));
  };

  const handleTimeUpdate = useCallback(() => {
    const { min, sec, hour } = sec2Min(videoRef.current?.duration ?? 0);
    setDuration([min, sec, hour]);

    // Phase 2c: the current time is driven by the timeupdate event itself.
    // (The old code started a NEW setInterval on every timeupdate — with
    // no clearInterval — so intervals piled up without bound.)
    const { min: cMin, sec: cSec, hour: cHour } = sec2Min(
      videoRef.current?.currentTime ?? 0,
    );
    setCurrentTime([cMin, cSec, cHour]);

    const percent =
      (videoRef.current?.currentTime ?? 0) /
      (videoRef.current?.duration ?? 1);
    updateTimeline(percent);
  }, [videoRef]);

  const handleSpeedChange = () => {
    let newPlaybackRate = (videoRef.current?.playbackRate ?? 1) + 0.25;
    if (newPlaybackRate > 2) newPlaybackRate = 0.25;
    if (videoRef.current) videoRef.current.playbackRate = newPlaybackRate;
    dispatch(setPlaybackRate(newPlaybackRate));
    if (speedBtnRef.current)
      speedBtnRef.current.textContent = `${newPlaybackRate}x`;
  };

  const toggleFullScreenMode = () => {
    if (document.fullscreenElement == null) {
      videoContainerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const toggleTheaterMode = () => {
    videoContainerRef.current?.classList.toggle("theater");
    dispatch(toggleTheater());
  };

  const toggleMiniPlayerMode = () => {
    if (videoContainerRef.current?.classList.contains("mini-player")) {
      document.exitPictureInPicture();
    } else {
      videoRef.current?.requestPictureInPicture();
    }
  };

  const toggleCaptions = () => {
    const captions = videoRef.current?.textTracks[0];
    if (!captions) return;
    const isHidden = captions.mode === "hidden";
    captions.mode = isHidden ? "showing" : "hidden";
    videoContainerRef.current?.classList.toggle("captions", isHidden);
  };

  const skip = useCallback(
    (dur: number) => {
      if (videoRef.current) videoRef.current.currentTime += dur;
    },
    [videoRef],
  );

  const handleGesture = useCallback(
    (e: MouseEvent) => {
      const width = videoContainerRef.current?.clientWidth ?? 0;
      const third = width / 3;
      const x = e.clientX;

      if (e.detail === 2) {
        // Double tap
        if (x > 2 * third) {
          skip(10); // Forward
        } else if (x < third) {
          skip(-10); // Backward
        } else {
          handlePlay(); // Single tap in the middle
        }
      }

      if (e.detail === 3) {
        ////////////// Triple tap  ///////////////////
        if (x > 2 * third) {
          window.close(); //////////////////// Close the website /////////////////////
        } else if (x < third) {
          if (commentRef.current) {
            commentRef.current.focus();
          }
          commentRef?.current?.focus(); //
          console.log("Show comments section");
        } else {
          const nextVideoIndx = vids?.findIndex((v) => v.filepath === video);
          const nextVideo =
            nextVideoIndx !== undefined
              ? vids?.at(nextVideoIndx + 1)
              : undefined;
          setVideosrc(nextVideo?.filepath ?? "");
          console.log("Move to next video");
        }
      }
    },
    [commentRef, videoContainerRef, skip, setVideosrc, handlePlay, video, vids],
  );

  // Phase 3b: points are awarded server-side on a validated
  // watch-complete (5 per watch, max 10 per video per day). The client
  // sends only the video id — the old code computed
  // (videosWatched + 1) * 5 client-side and the server trusted it.
  const handleVideoEnd = async () => {
    if (currentuser === null) {
      alert("Please login to get Points");
      return;
    }
    if (!videoid) return;
    try {
      await watchCompleteMutation.mutateAsync(videoid);
      console.log("Points updated successfully");
    } catch (error) {
      console.error("Error updating points", error);
    }
  };

  useEffect(() => {
    videoContainerRef.current?.addEventListener("click", handleGesture);
    return () => {
      videoContainerRef.current?.removeEventListener("click", handleGesture);
    };
  }, [handleGesture]);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const tagName = document.activeElement?.tagName.toLowerCase();
      if (tagName === "input") return;
      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          handlePlay();
          break;
        case "f":
          toggleFullScreenMode();
          break;
        case "t":
          toggleTheaterMode();
          break;
        case "i":
          toggleMiniPlayerMode();
          break;
        case "m":
          handleMute();
          break;
        case "arrowleft":
        case "j":
          skip(-5);
          break;
        case "arrowright":
        case "l":
          skip(5);
          break;
        case "c":
          toggleCaptions();
          break;
        default:
          break;
      }
    };
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [handleMute, handlePlay, skip]);

  useEffect(() => {
    // Capture the element: videoRef.current is null by cleanup time.
    const videoEl = videoRef.current;
    videoEl?.addEventListener("timeupdate", handleTimeUpdate);
    videoEl?.addEventListener("volumechange", updateVolumeUI);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("enterpictureinpicture", handleEnterPiP);
    document.addEventListener("leavepictureinpicture", handleLeavePiP);
    return () => {
      videoEl?.removeEventListener("timeupdate", handleTimeUpdate);
      videoEl?.removeEventListener("volumechange", updateVolumeUI);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("enterpictureinpicture", handleEnterPiP);
      document.removeEventListener("leavepictureinpicture", handleLeavePiP);
    };
  }, [
    isPlaying,
    handleTimeUpdate,
    updateVolumeUI,
    handleFullscreenChange,
    handleEnterPiP,
    handleLeavePiP,
  ]);

  return (
    <>
      <div
        ref={videoContainerRef}
        className="video-container"
        data-volume-level="high"
      >
        <div className="video-controls-container">
          <div
            ref={timelineRef}
            onMouseMove={handleScrubbing}
            className="timeline-container"
          >
            <div className="timeline">
              <div className="thumb-indicator"></div>
            </div>
          </div>
          <div className="controls">
            <button onClick={handlePlay} className="play-pause-btn">
              {isPlaying ? (
                <svg className="pause-icon volicon" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M14,19H18V5H14M6,19H10V5H6V19Z"
                  />
                </svg>
              ) : (
                <svg className="play-icon volicon" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M8,5.14V19.14L19,12.14L8,5.14Z"
                  />
                </svg>
              )}
            </button>

            <div className="volume-container">
              <button onClick={handleMute} className="mute-btn">
                <svg className="volume-high-icon volicon" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z"
                  />
                </svg>
                <svg className="volume-low-icon volicon" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M5,9V15H9L14,20V4L9,9M18.5,12C18.5,10.23 17.5,8.71 16,7.97V16C17.5,15.29 18.5,13.76 18.5,12Z"
                  />
                </svg>
                <svg className="volume-muted-icon volicon" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M12,4L9.91,6.09L12,8.18M4.27,3L3,4.27L7.73,9H3V15H7L12,20V13.27L16.25,17.53C15.58,18.04 14.83,18.46 14,18.7V20.77C15.38,20.45 16.63,19.82 17.68,18.96L19.73,21L21,19.73L12,10.73M19,12C19,12.94 18.8,13.82 18.46,14.64L19.97,16.15C20.62,14.91 21,13.5 21,12C21,7.72 18,4.14 14,3.23V5.29C16.89,6.15 19,8.83 19,12M16.5,12C16.5,10.23 15.5,8.71 14,7.97V10.18L16.45,12.63C16.5,12.43 16.5,12.21 16.5,12Z"
                  />
                </svg>
              </button>

              <input
                onInput={handleVolumeChange}
                ref={volumeSliderRef}
                className="volume-slider"
                type="range"
                min={0}
                max={1}
                step="any"
              />
            </div>

            <div className="duration-container">
              <div className="current-time">
                {currentTime[2]}:{currentTime[0]}:{currentTime[1]}{" "}
              </div>
              /
              <div className="total-time">
                {duration[2]}.{duration[0]}.{duration[1]}
              </div>
            </div>

            <button onClick={toggleCaptions} className="closed-caption-btn">
              <svg viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M18,11H16.5V10.5H14.5V13.5H16.5V13H18V14A1,1 0 0,1 17,15H14A1,1 0 0,1 13,14V10A1,1 0 0,1 14,9H17A1,1 0 0,1 18,10M11,11H9.5V10.5H7.5V13.5H9.5V13H11V14A1,1 0 0,1 10,15H7A1,1 0 0,1 6,14V10A1,1 0 0,1 7,9H10A1,1 0 0,1 11,10M19,4H5C3.89,4 3,4.89 3,6V18A2,2 0 0,0 5,20H19A2,2 0 0,0 21,18V6C21,4.89 20.1,4 19,4Z"
                />
              </svg>
            </button>

            <button
              onClick={handleSpeedChange}
              ref={speedBtnRef}
              className="speed-btn wide-btn"
            >
              1x
            </button>

            <button onClick={toggleMiniPlayerMode} className="mini-player-btn">
              <svg viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zm-10-7h9v6h-9z"
                />
              </svg>
            </button>

            <button onClick={toggleTheaterMode} className="theater-btn">
              <svg className="tall" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M19 6H5c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H5V8h14v8z"
                />
              </svg>
              <svg className="wide" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M19 7H5c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm0 8H5V9h14v6z"
                />
              </svg>
            </button>

            <button onClick={toggleFullScreenMode} className="full-screen-btn">
              <svg className="open" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
                />
              </svg>
              <svg className="close" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"
                />
              </svg>
            </button>
          </div>
        </div>
        <video
          id="video"
          ref={videoRef}
          src={videosrc === "" ? video : videosrc}
          onEnded={handleVideoEnd}
        >
          <track kind="captions" srcLang="en" src={subtitle} />
        </video>
      </div>
    </>
  );
}

export default VideoPlayer;
