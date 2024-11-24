
import React, { useEffect, useRef, useState } from "react";
import "./videoPlayer.css";
 import subtitle from "../../assets/subtitles.vtt";

function VideoPlayer({video}) {

  const videoContainer = document.querySelector(".video-container");
  const Video = document.querySelector("video");
  const volumeslider = document.querySelector(".volume-slider");
  const timelineContainer = document.querySelector(".timeline-container");
  const videoRef = useRef(null);
  const vdioCont = useRef(null);
  const timelnCon = useRef(null);
  const volumSlidr = useRef(null);
  const speedBtn = document.querySelector(".speed-btn");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState([0, 0, 0]); // current time of the video in array. The first value represents the minute and the second represents seconds.
  const [duration, setDuration] = useState([0, 0, 0]); // // total duration of the video in the array. The first value represents the minute and the second represents seconds.

  const handlePlay = () => {
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const sec2Min = (sec) => {
    const min = Math.floor(sec / 60);
    const hour = Math.floor(min / 60);
    const secRemain = Math.floor(sec % 60);
    return {
      min: min,
      sec: secRemain,
      hour: hour,
    };
  };

  useEffect(() => {
    timelnCon.current?.addEventListener("mousedown", toggleScrubbing);
    document.addEventListener("mouseup", e => {if (isScrubbing) toggleScrubbing(e)})
    document.addEventListener("mousemove", e => {if (isScrubbing) handleTimelineUpdate(e)})

    videoRef.current?.addEventListener("timeupdate", () => {
      const percent = videoRef.current?.currentTime / videoRef.current?.duration;
      timelnCon.current?.style.setProperty("--progress-position", percent);
    });

    videoRef.current?.addEventListener("volumechange", muteSound);
    const { min, sec, hour } = sec2Min(videoRef.current?.duration);
    setDuration([min, sec, hour]);
    setInterval(() => {
      const { min, sec, hour } = sec2Min(videoRef?.current?.currentTime);
      setCurrentTime([min, sec, hour]);
    }, 1000);
  }, [isPlaying]);

  // document.addEventListener("keydown", (e) => {
  //    const tagName = document.activeElement.tagName.toLowerCase();

  //    if (tagName === "input") return;

  //   switch (e.key.toLowerCase()) {
  //     case " ":
  //     case "k":
  //       handlePlay();
  //       break;
  //     case "f":
  //       toggleFullScreenMode();
  //       break;
  //     case "t":
  //       toggleTheaterMode();
  //       break;
  //     case "i":
  //       toggleMiniPlayerMode();
  //       break;
  //     case "m" :
  //     toggleMute();
  //       break;
  //     case "arrowleft":
  //     case "j":
  //       skip(-0.05);
  //       break;
  //     case "arrowright":
  //     case "l":
  //       skip(0.05);
  //       break;
  //     case "c":
  //       toggleCaptions();
  //       break;
  //   }
  // });

  // Timeline

  let isScrubbing = false;
  let wasPaused;
  const toggleScrubbing = (e) => {
    const rect = timelnCon.current.getBoundingClientRect();
    const percent =  Math.min(Math.max(0, e.clientX - rect.x), rect.width) / rect.width;
    isScrubbing = (e.buttons & 1) === 1;
    vdioCont.current.classList.toggle("scrubbing", isScrubbing);
    if (isScrubbing) {
      wasPaused = videoRef.current.paused;
      videoRef.current.pause();
     // console.log(wasPaused);
    } else {
      videoRef.current.currentTime = percent * videoRef.current.duration;
     // console.log(wasPaused);

      if (!wasPaused) videoRef.current.play();
    }
    handleTimelineUpdate(e);
  };

  const handleTimelineUpdate = (e) => {
    if (isScrubbing) {
      e.preventDefault();
      const percent = videoRef.current.currentTime / videoRef.current.duration;
      timelnCon.current.style.setProperty("--progress-position", percent);
    }
  };

  //duration
  
  function skip(Duration) {
    videoRef.current.currentTime += Duration;
  }

  // playback speed
  const changePlaybackSpeed = () => {
    let newPlaybackRate = Video.playbackRate + 0.25;
    if (newPlaybackRate > 2) newPlaybackRate = 0.25;
    Video.playbackRate = newPlaybackRate;
    speedBtn.textContent = `${newPlaybackRate}x`;
  };

  //caption
  const captions = videoRef.current?.textTracks[0];
  // captions.mode = "hidden";
  const toggleCaptions = () => {
    const isHidden = captions.mode === "hidden";
    captions.mode = isHidden ? "showing" : "hidden";
    videoContainer.classList.toggle("captions", isHidden);
    // console.log("hi");
  };

  //theater mode
  const toggleTheaterMode = () => {
    vdioCont?.current?.classList?.toggle("theater");
  };

  //full screen
  function toggleFullScreenMode() {
    if (document.fullscreenElement == null) {
      vdioCont.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  const toggleMiniPlayerMode = () => {
    if (videoContainer?.classList?.contains("mini-player")) {
      document.exitPictureInPicture();
    } else {
      Video.requestPictureInPicture();
    }
  };

  document.addEventListener("fullscreenchange", () => {
    videoContainer?.classList?.toggle(
      "full-screen",
      document.fullscreenElement
    );
  });

  document.addEventListener("enterpictureinpicture", () => {
    videoContainer?.classList?.add("mini-player");
  });
  document.addEventListener("leavepictureinpicture", () => {
    videoContainer?.classList?.remove("mini-player");
  });

  //mute btn
  const volumeSlider = (e) => {
    videoRef.current.volume = e.target?.value;
    videoRef.current.muted = e.target?.value === 0;
  };

  const toggleMute = () => {
    videoRef.current.muted = !videoRef.current.muted;
  };

  const muteSound = () => {
    volumSlidr.current.value = Video?.volume;
    let volumeLevel;
    if (videoRef.current.muted || videoRef.current.volume === 0) {
      volumSlidr.current.value = 0;
      volumeLevel = "muted";
    } else if (videoRef.current.volume >= 0.5) {
      volumeLevel = "high";
    } else {
      volumeLevel = "low";
    }

    vdioCont.current.dataset.volumeLevel = volumeLevel;
  };

  return (
    <>
      <div ref={vdioCont} className="video-container" data-volume-level="high">
        {/* <img className="thumbnail-img" /> */}
        <div className="video-controls-container">
          <div
            ref={timelnCon}
            onMouseMove={handleTimelineUpdate}
            className="timeline-container"
          >
            <div className="timeline">
              {/* <img className="preview-img" /> */}
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
              <button onClick={toggleMute} className="mute-btn">
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
                onInput={volumeSlider}
                ref={volumSlidr}
                className="volume-slider"
                type="range"
                min={0}
                max={1}
                step={"any"}
              />
            </div>

            <div className="duration-container">
              <div className="current-time">
                {currentTime[2]}.{currentTime[0]}.{currentTime[1]}{" "}
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
              onClick={changePlaybackSpeed}
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
        <video id="video" ref={videoRef} src={video}>
          <track kind="captions" mode="hidden" srcLang="en" src={subtitle} />
        </video>
      </div>
    </>
  );
}

export default VideoPlayer
