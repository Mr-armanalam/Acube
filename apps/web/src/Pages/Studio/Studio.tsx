// Phase 5 match-preview — Creator Studio shell (preview images 9–15):
// a standalone shell with NO Your-Tube navbar (App.tsx hides it on
// /studio/*). Left nav: channel identity at top (avatar + real channel
// name from the API + "Creator Studio"), then Dashboard / Content /
// Analytics / Comments / Upload / Channel settings with a red active
// pill. The identity text is always the real channel — the preview's
// "Code Streamer" is its example channel, never hardcoded here.
// Channel switcher (preview §4): shows the caller's own channel; when
// only one channel exists it shows that single channel — multiple
// channels are never faked.
import React, { useState } from "react";
import { NavLink, Link } from "react-router";
import { useAppSelector } from "../../store";
import { useStudioOverview } from "../../query/hooks";
import { resolveApiMediaUrl } from "../../Api";
import "./Studio.css";

const NAV = [
  { to: "/studio", label: "Dashboard", icon: "▦", end: true },
  { to: "/studio/content", label: "Content", icon: "▤", end: false },
  { to: "/studio/analytics", label: "Analytics", icon: "↗", end: false },
  { to: "/studio/comments", label: "Comments", icon: "✦", end: false },
  { to: "/studio/upload", label: "Upload", icon: "+", end: false },
  { to: "/studio/settings", label: "Channel settings", icon: "⚙", end: false },
];

export default function StudioShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = useAppSelector((s) => s.auth.session?.result._id);
  const sessionName = useAppSelector((s) => s.auth.session?.result.name);
  const overview = useStudioOverview();
  const channel = overview.data?.channel;
  const channelName = channel?.name ?? sessionName ?? "Your channel";
  // Word initials ("Code Streamer" → "CS"), like the preview's avatar
  // and the Settings page — the first two characters ("CO") are wrong.
  const channelInitials =
    channelName
      .split(/\s+/)
      .map((w) => w.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";
  // The uploaded avatar wins over the Google login photo: the
  // overview carries avatarUrl (falling back to picture server-side),
  // and the identity header prefers it. A failed avatar falls back
  // to the initials circle — the seeded banner/avatar URLs are
  // example.com placeholders that do not resolve to real images, so
  // a broken <img> icon must never show.
  const avatarUrl = resolveApiMediaUrl(
    channel?.avatarUrl ?? channel?.picture ?? undefined,
  );
  const [avatarBroken, setAvatarBroken] = useState(false);

  return (
    <div className="studio-shell">
      <nav className="studio-nav" aria-label="Creator Studio">
        <div className="studio-identity">
          {avatarUrl && !avatarBroken ? (
            <img
              className="studio-identity-avatar-img"
              src={avatarUrl}
              alt=""
              onError={() => setAvatarBroken(true)}
            />
          ) : (
            <span className="studio-identity-avatar" aria-hidden="true">
              {channelInitials}
            </span>
          )}
          <span className="studio-identity-text">
            <strong>{channelName}</strong>
            <span>Creator Studio</span>
          </span>
        </div>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `studio-nav-link${isActive ? " active" : ""}`
            }
          >
            <span className="studio-nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
        <div className="studio-nav-footer">
          <Link to="/">↩ Back to Acube</Link>
          {userId ? <Link to={`/channel/${userId}`}>Your channel ↗</Link> : null}
        </div>
      </nav>
      <div className="studio-mobile-tabs" aria-label="Creator Studio">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            {item.label}
          </NavLink>
        ))}
      </div>
      <main className="studio-main">{children}</main>
    </div>
  );
}
