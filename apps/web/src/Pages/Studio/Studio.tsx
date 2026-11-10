// Phase 5 — Creator Studio shell: 240px left nav on desktop, top tab bar
// on mobile. Each tab page renders inside this shell.
import React from "react";
import { NavLink, Link } from "react-router";
import { useAppSelector } from "../../store";
import "./Studio.css";

const NAV = [
  { to: "/studio", label: "Dashboard", end: true },
  { to: "/studio/content", label: "Content", end: false },
  { to: "/studio/analytics", label: "Analytics", end: false },
  { to: "/studio/comments", label: "Comments", end: false },
  { to: "/studio/settings", label: "Settings", end: false },
];

export default function StudioShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = useAppSelector((s) => s.auth.session?.result._id);
  return (
    <div className="studio-shell">
      <nav className="studio-nav" aria-label="Creator Studio">
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
