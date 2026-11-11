// Video thumbnail with a never-broken fallback: when the image URL does
// not resolve (e.g. the seeded demo thumbnails are example.com
// placeholders), render a neutral 16:9 block with a play glyph instead
// of the browser's broken-image icon. Used by Studio Content, Playlist
// and the UploadWizard preview.
//
// The src is resolved through resolveApiMediaUrl: a locally stored
// "/uploads/…" thumbnail is API-relative, so a bare "/uploads/…" would
// resolve against the WEB origin (:3000/:4173) and 404 — every render
// path (Home, Content, Library, History, Playlist, wizard preview)
// goes through this one component, so the fix lives here, not at six
// call sites. Absolute / blob: / data: URLs pass through untouched.
import React, { useEffect, useState } from "react";
import { resolveApiMediaUrl } from "../Api";

/**
 * Deterministic gradient for a thumbnail placeholder, derived from a
 * seed (video id): the same video always gets the same hue, so the
 * Content table reads like the preview's green/red/blue/orange/purple
 * boxes instead of identical grey blocks.
 */
export function deterministicThumbGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `linear-gradient(135deg, hsl(${hue}, 55%, 40%), hsl(${(hue + 36) % 360}, 60%, 52%))`;
}

export default function VideoThumb({
  src,
  className,
  style,
  fallbackBackground,
}: {
  src: string | undefined;
  className?: string;
  style?: React.CSSProperties;
  /** Gradient (or colour) for the ▶ placeholder when there is no image. */
  fallbackBackground?: string;
}) {
  const [broken, setBroken] = useState(false);
  // A new src gets a fresh chance: without this, a failed URL (e.g.
  // a mistyped thumbnail URL in the wizard) would stick the ▶
  // placeholder even after the user fixed the URL.
  const resolvedSrc = resolveApiMediaUrl(src);
  useEffect(() => {
    setBroken(false);
  }, [resolvedSrc]);
  if (!resolvedSrc || broken) {
    return (
      <span
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: fallbackBackground ?? "var(--surface-2)",
          color: fallbackBackground ? "#fff" : "var(--text-2)",
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
      src={resolvedSrc}
      alt=""
      style={style}
      onError={() => setBroken(true)}
    />
  );
}
