import React from "react";
import "./ProgressRing.css";

// Small SVG circular progress ring. Replaces react-circular-progressbar
// (its peer range stops at React 18) with the same props the app used:
// value 0-100, centre text, trail/path colours, rotation (fraction of a
// full turn, 0 = starts at 12 o'clock) and a dashoffset transition.
// `background` + `backgroundColor` render the disc behind the ring only
// when background is true, matching the old library's behaviour.
const ProgressRing = ({
  value = 0,
  text = "",
  rotation = 0,
  strokeLinecap = "butt",
  textSize = "20px",
  pathTransitionDuration = 0.5,
  pathColor = "#3e98c7",
  textColor = "currentColor",
  trailColor = "#d6d6d6",
  background = false,
  backgroundColor = "#3e98c7",
}) => {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const dashOffset = circumference * (1 - clamped / 100);

  return (
    <svg
      className="progress-ring"
      viewBox="0 0 100 100"
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {background && <circle cx="50" cy="50" r="50" fill={backgroundColor} />}
      <circle
        className="progress-ring__trail"
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke={trailColor}
        strokeWidth="8"
      />
      <circle
        className="progress-ring__path"
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke={pathColor}
        strokeWidth="8"
        strokeLinecap={strokeLinecap}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        style={{
          transform: `rotate(${-90 + rotation * 360}deg)`,
          transformOrigin: "50% 50%",
          transition: `stroke-dashoffset ${pathTransitionDuration}s ease`,
        }}
      />
      <text
        className="progress-ring__text"
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fill={textColor}
        style={{ fontSize: textSize }}
      >
        {text}
      </text>
    </svg>
  );
};

export default ProgressRing;
