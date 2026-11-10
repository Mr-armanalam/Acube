// Phase 5 — rebuilt custom video player (replaces the old videoPlayer on
// the Watch page). Seek track/slider with buffered + played bars, chapter
// ticks, draggable knob, volume slider, speed / PiP / fullscreen, keyboard
// map (Space play/pause, ←/→ ±5s, ↑/↓ volume, F fullscreen, M mute) and
// gestures (left double-tap −10s, centre tap play/pause, right double-tap
// +10s, vertical swipe volume/brightness with an on-screen indicator).
import React, { useCallback, useEffect, useRef, useState } from "react";

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const CHAPTER_FRACTIONS = [0.25, 0.5, 0.75];

export default function Player({
  src,
  onEnded,
}: {
  src: string | undefined;
  onEnded?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const clickTimer = useRef<number | null>(null);
  const touchStart = useRef<{ x: number; y: number; volume: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [brightness, setBrightness] = useState(1);
  const [indicator, setIndicator] = useState<string | null>(null);

  const showIndicator = useCallback((text: string) => {
    setIndicator(text);
    window.setTimeout(() => setIndicator(null), 1200);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play()?.catch(() => undefined);
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }, []);

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
    setCurrentTime(v.currentTime);
  }, []);

  const seekTo = useCallback((fraction: number) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    v.currentTime = fraction * v.duration;
    setCurrentTime(v.currentTime);
  }, []);

  const changeVolume = useCallback(
    (next: number) => {
      const v = videoRef.current;
      const clamped = Math.max(0, Math.min(1, next));
      setVolume(clamped);
      setMuted(clamped === 0);
      if (v) {
        v.volume = clamped;
        v.muted = clamped === 0;
      }
      showIndicator(`Volume ${Math.round(clamped * 100)}%`);
    },
    [showIndicator],
  );

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    const next = !muted;
    setMuted(next);
    if (v) v.muted = next;
  }, [muted]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void containerRef.current?.requestFullscreen?.();
    }
  }, []);

  const togglePiP = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture();
    } else {
      void v.requestPictureInPicture?.()?.catch(() => undefined);
    }
  }, []);

  const cycleSpeed = useCallback(() => {
    const idx = SPEEDS.indexOf(speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length] ?? 1;
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  }, [speed]);

  // Click gestures: single centre tap toggles play (delayed so a double
  // tap can cancel it); double-tap left/right seeks ±10s.
  const handleVideoClick = useCallback(
    (e: React.MouseEvent<HTMLVideoElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const third = rect.width / 3;
      if (e.detail === 2) {
        if (clickTimer.current) window.clearTimeout(clickTimer.current);
        if (x < third) {
          seekBy(-10);
          showIndicator("−10s");
        } else if (x > 2 * third) {
          seekBy(10);
          showIndicator("+10s");
        } else {
          togglePlay();
        }
        return;
      }
      if (e.detail === 1) {
        clickTimer.current = window.setTimeout(() => {
          if (x >= third && x <= 2 * third) togglePlay();
        }, 250);
      }
    },
    [seekBy, showIndicator, togglePlay],
  );

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchStart.current = { x: t.clientX, y: t.clientY, volume };
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const start = touchStart.current;
    const t = e.touches[0];
    if (!start || !t) return;
    const dy = start.y - t.clientY;
    if (Math.abs(dy) < 10) return;
    const rect = containerRef.current?.getBoundingClientRect();
    const isLeft = rect ? t.clientX - rect.left < rect.width / 2 : true;
    if (isLeft) {
      changeVolume(start.volume + dy / 200);
    } else {
      const next = Math.max(0.3, Math.min(1.5, 1 + dy / 200));
      setBrightness(next);
      showIndicator(`Brightness ${Math.round(next * 100)}%`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const tag = (document.activeElement?.tagName ?? "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    switch (e.key) {
      case " ":
        e.preventDefault();
        togglePlay();
        break;
      case "ArrowLeft":
        e.preventDefault();
        seekBy(-5);
        break;
      case "ArrowRight":
        e.preventDefault();
        seekBy(5);
        break;
      case "ArrowUp":
        e.preventDefault();
        changeVolume(volume + 0.1);
        break;
      case "ArrowDown":
        e.preventDefault();
        changeVolume(volume - 0.1);
        break;
      case "f":
      case "F":
        toggleFullscreen();
        break;
      case "m":
      case "M":
        toggleMute();
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      setCurrentTime(v.currentTime);
      try {
        if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
      } catch {
        setBuffered(0);
      }
    };
    const onMeta = () => setDuration(v.duration || 0);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("progress", onTime);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("progress", onTime);
    };
  }, []);

  const playedPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="acube-player"
      tabIndex={0}
      role="region"
      aria-label="Video player"
      onKeyDown={handleKeyDown}
    >
      <video
        ref={videoRef}
        src={src}
        style={{ filter: `brightness(${brightness})` }}
        onClick={handleVideoClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onEnded={onEnded}
        aria-label="Video"
      />
      {indicator ? (
        <div className="acube-gesture-indicator" role="status">
          {indicator}
        </div>
      ) : null}
      <div className="acube-player-controls">
        <div
          className="acube-seek-track"
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
          tabIndex={0}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seekTo((e.clientX - rect.left) / rect.width);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") seekBy(-5);
            if (e.key === "ArrowRight") seekBy(5);
          }}
        >
          <div className="acube-seek-buffered" style={{ width: `${bufferedPct}%` }} />
          <div className="acube-seek-played" style={{ width: `${playedPct}%` }} />
          {CHAPTER_FRACTIONS.map((f) => (
            <div key={f} className="acube-seek-tick" style={{ left: `${f * 100}%` }} />
          ))}
          <div className="acube-seek-knob" style={{ left: `${playedPct}%` }} />
        </div>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          aria-label="Seek slider"
          onChange={(e) => seekTo(Number(e.target.value) / (duration || 1))}
          style={{ width: "100%" }}
        />
        <div className="acube-player-row">
          <button type="button" aria-label={isPlaying ? "Pause" : "Play"} onClick={togglePlay}>
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button type="button" aria-label="Mute" onClick={toggleMute}>
            {muted || volume === 0 ? "Unmute" : "Mute"}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            aria-label="Volume"
            onChange={(e) => changeVolume(Number(e.target.value))}
            style={{ width: 96 }}
          />
          <span>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <button type="button" aria-label="Playback speed" onClick={cycleSpeed}>
            {speed}x
          </button>
          <button type="button" aria-label="Picture in picture" onClick={togglePiP}>
            PiP
          </button>
          <button type="button" aria-label="Fullscreen" onClick={toggleFullscreen}>
            Fullscreen
          </button>
        </div>
      </div>
    </div>
  );
}
