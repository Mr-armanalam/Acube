// Video thumbnail with a never-broken fallback: when the image URL does
// not resolve (e.g. the seeded demo thumbnails are example.com
// placeholders), render a neutral 16:9 block with a play glyph instead
// of the browser's broken-image icon. Used by Studio Content, Playlist
// and the UploadWizard preview.
import React, { useState } from "react";

export default function VideoThumb({
  src,
  className,
  style,
}: {
  src: string | undefined;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <span
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--surface-2)",
          color: "var(--text-2)",
          fontSize: 20,
          ...style,
        }}
        role="img"
        aria-label="Video thumbnail unavailable"
      >
        ▶
      </span>
    );
  }
  return (
    <img
      className={className}
      src={src}
      alt=""
      style={style}
      onError={() => setBroken(true)}
    />
  );
}
