// Phase 5 fix — rebuilt custom video player (replaces the old
// videoPlayer on the Watch page). One seek control only: a draggable
// knob on the seek track (pointer events) with buffered + played bars
// and a hover time preview. Chapters render ONLY from real chapter
// data passed in — there is no chapter data yet, so no ticks render
// (the old hardcoded 25/50/75% ticks were fake and are removed).
// Gestures: left double-tap −10s, centre tap play/pause, centre
// double-tap fullscreen, right double-tap +10s, horizontal swipe
// seeks, vertical swipe volume (right) / brightness (left), long-press
// 2×. Keyboard: Space play/pause, ←/→ ±5s, J/L ±10s, F fullscreen,
// M mute. CC/HD/quality controls are omitted — no captions or
// alternate renditions exist, so rendering them would fake a feature.
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { VideoChapter } from "../../types";

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export default function Player({
  src,
  onEnded,
  initialTime,
  onProgressSec,
  chapters,
  loop,
}: {
  src: string | undefined;
  onEnded?: () => void;
  /** Resume position in seconds (from stored history progress). */
  initialTime?: number;
  /** Called (throttled to ≥5s changes) as playback advances. */
  onProgressSec?: (sec: number) => void;
  /** Real chapters only; absent/empty = no chapter ticks. */
  chapters?: VideoChapter[];
  loop?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const clickTimer = useRef<number | null>(null);
  const touchStart = useRef<{
    x: number;
    y: number;
    volume: number;
    time: number;
    mode: "horizontal" | "vertical" | null;
  } | null>(null);
  const lastTap = useRef<{ time: number; zone: "left" | "centre" | "right" } | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressActive = useRef(false);
  const lastReportedSec = useRef(0);
  const resumedRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [brightness, setBrightness] = useState(1);
  const [indicator, setIndicator] = useState<string | null>(null);
  const [hover, setHover] = useState<{ time: number; pct: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const showIndicator = useCallback((text: string) => {
    setIndicator(text);
    window.setTimeout(() => setIndicator(null), 1200);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    // Drive from React state, not v.paused: jsdom never flips `paused`,
    // and state is the single source of truth for the toggle label.
    if (isPlaying) {
      v.pause();
      setIsPlaying(false);
    } else {
      void v.play()?.catch(() => undefined);
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
    setCurrentTime(v.currentTime);
  }, []);

  const seekTo = useCallback((fraction: number) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const clamped = Math.max(0, Math.min(1, fraction));
    v.currentTime = clamped * v.duration;
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

  const reportProgress = useCallback(
    (sec: number) => {
      if (!onProgressSec) return;
      if (Math.abs(sec - lastReportedSec.current) >= 5) {
        lastReportedSec.current = sec;
        onProgressSec(sec);
      }
    },
    [onProgressSec],
  );

  // Click gestures: single centre tap toggles play (delayed so a double
  // tap can cancel it); double-tap left/right seeks ±10s, centre
  // double-tap toggles fullscreen.
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
          toggleFullscreen();
        }
        return;
      }
      if (e.detail === 1) {
        clickTimer.current = window.setTimeout(() => {
          if (x >= third && x <= 2 * third) togglePlay();
        }, 250);
      }
    },
    [seekBy, showIndicator, togglePlay, toggleFullscreen],
  );

  const fractionFromClientX = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return (clientX - rect.left) / rect.width;
  };

  // Draggable seek knob (pointer events on the track — the ONLY seek
  // control; the duplicated native range slider is removed).
  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // jsdom / older browsers: dragging still works via pointermove.
    }
    setDragging(true);
    seekTo(fractionFromClientX(e.clientX));
  };
  const handleTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) {
      seekTo(fractionFromClientX(e.clientX));
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setHover({ time: (pct / 100) * duration, pct });
  };
  const handleTrackPointerUp = () => setDragging(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchStart.current = { x: t.clientX, y: t.clientY, volume, time: Date.now(), mode: null };
    longPressTimer.current = window.setTimeout(() => {
      longPressActive.current = true;
      const v = videoRef.current;
      if (v) v.playbackRate = 2;
      showIndicator("2× speed");
    }, 500);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const start = touchStart.current;
    const t = e.touches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (!start.mode) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      start.mode = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    }
    if (start.mode === "horizontal") {
      seekTo(fractionFromClientX(t.clientX));
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    const isLeft = rect ? t.clientX - rect.left < rect.width / 2 : true;
    if (isLeft) {
      const next = Math.max(0.3, Math.min(1.5, 1 + dy / 200));
      setBrightness(next);
      showIndicator(`Brightness ${Math.round(next * 100)}%`);
    } else {
      changeVolume(start.volume + dy / 200);
    }
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    if (longPressActive.current) {
      longPressActive.current = false;
      const v = videoRef.current;
      if (v) v.playbackRate = speed;
      touchStart.current = null;
      return;
    }
    const start = touchStart.current;
    const t = e.changedTouches[0];
    touchStart.current = null;
    if (!start || !t) return;
    const moved = Math.hypot(t.clientX - start.x, t.clientY - start.y);
    if (moved > 12 || Date.now() - start.time > 400) return;
    const rect = containerRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 1;
    const x = t.clientX - (rect?.left ?? 0);
    const zone = x < width / 3 ? "left" : x > (2 * width) / 3 ? "right" : "centre";
    const now = Date.now();
    if (lastTap.current && now - lastTap.current.time < 300 && lastTap.current.zone === zone) {
      lastTap.current = null;
      if (zone === "left") {
        seekBy(-10);
        showIndicator("−10s");
      } else if (zone === "right") {
        seekBy(10);
        showIndicator("+10s");
      } else {
        toggleFullscreen();
      }
      return;
    }
    lastTap.current = { time: now, zone };
    window.setTimeout(() => {
      if (lastTap.current?.time === now && zone === "centre") togglePlay();
    }, 300);
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
      case "j":
      case "J":
        seekBy(-10);
        showIndicator("−10s");
        break;
      case "l":
      case "L":
        seekBy(10);
        showIndicator("+10s");
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
      if (v.duration) setDuration(v.duration);
      try {
        if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
      } catch {
        setBuffered(0);
      }
      reportProgress(v.currentTime);
    };
    const onMeta = () => {
      setDuration(v.duration || 0);
      // Resume: seek once to the stored position when metadata loads.
      if (!resumedRef.current && initialTime && initialTime > 0 && v.duration) {
        resumedRef.current = true;
        v.currentTime = Math.min(initialTime, v.duration - 1);
        setCurrentTime(v.currentTime);
      }
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("progress", onTime);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("progress", onTime);
    };
  }, [initialTime, reportProgress]);

  const playedPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const realChapters = (chapters ?? []).filter(
    (c) => Number.isFinite(c.startSec) && duration > 0 && c.startSec >= 0 && c.startSec <= duration,
  );

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
        loop={loop}
        style={{ filter: `brightness(${brightness})` }}
        onClick={handleVideoClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
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
          ref={trackRef}
          className="acube-seek-track"
          role="slider"
          aria-label="Seek slider"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
          tabIndex={0}
          onPointerDown={handleTrackPointerDown}
          onPointerMove={handleTrackPointerMove}
          onPointerUp={handleTrackPointerUp}
          onPointerLeave={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") seekBy(-5);
            if (e.key === "ArrowRight") seekBy(5);
          }}
        >
          <div className="acube-seek-buffered" style={{ width: `${bufferedPct}%` }} />
          <div className="acube-seek-played" style={{ width: `${playedPct}%` }} />
          {realChapters.map((c) => (
            <div
              key={c.startSec}
              className="acube-seek-tick"
              style={{ left: `${(c.startSec / duration) * 100}%` }}
              title={c.title}
            />
          ))}
          <div className="acube-seek-knob" style={{ left: `${playedPct}%` }} />
          {hover && !dragging ? (
            <div
              className="acube-seek-preview"
              style={{ left: `${hover.pct}%` }}
              role="status"
            >
              {formatTime(hover.time)}
            </div>
          ) : null}
        </div>
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
            // Preview palette: the native range thumb/track renders
            // blue by default — pin it to Acube Red.
            style={{ width: 96, accentColor: "#e8482f" }}
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
