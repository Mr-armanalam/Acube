// Phase 5 fix — Creator Studio shell: 240px left nav on desktop, top
// tab bar on mobile. Channel switcher (preview §4): shows the caller's
// own channel; when only one channel exists it shows that single
// channel — multiple channels are never faked. Upload is a nav item
// routing to the /studio/upload wizard.
import React from "react";
import { NavLink, Link } from "react-router";
import { useAppSelector } from "../../store";
import { useStudioOverview } from "../../query/hooks";
import "./Studio.css";

const NAV = [
  { to: "/studio", label: "Dashboard", end: true },
  { to: "/studio/content", label: "Content", end: false },
  { to: "/studio/analytics", label: "Analytics", end: false },
  { to: "/studio/comments", label: "Comments", end: false },
  { to: "/studio/upload", label: "Upload", end: false },
  { to: "/studio/settings", label: "Settings", end: false },
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
  const channelInitial = channelName.charAt(0).toUpperCase();

  return (
    <div className="studio-shell">
      <nav className="studio-nav" aria-label="Creator Studio">
        <div className="studio-channel-switcher" aria-label="Channel">
          <span className="studio-avatar" aria-hidden="true">
            {channelInitial}
          </span>
          <span className="studio-channel-switcher-text">
            <strong>{channelName}</strong>
            <span>1 channel</span>
          </span>
        </div>
        <div className="studio-nav-title">Creator Studio</div>
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
        {userId ? (
          <Link to={`/channel/${userId}`} style={{ marginTop: 16 }}>
            View channel
          </Link>
        ) : null}
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
