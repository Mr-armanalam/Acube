// Shared account pill nav (preview screens I + J): Home, Subscriptions,
// History, Library, Watch Later, Liked. The active pill is bone-white
// (#F2EEE6 via var(--text) on the dark theme). Used by the History and
// Library pages; Watch Later / Liked are anchors into the Library hub
// (there are no separate /watch-later or /liked routes), and
// Subscriptions links to the Library hub's honest empty state
// (/library?view=subscriptions) — Acube has no follow system, so no
// subscription rows are ever rendered.
import React from "react";
import { Link, useLocation } from "react-router";
import "./AccountNavPills.css";

type PillKey =
  | "home"
  | "subscriptions"
  | "history"
  | "library"
  | "watch-later"
  | "liked";

const PILLS: Array<{ key: PillKey; label: string; to: string; icon: string }> = [
  { key: "home", label: "Home", to: "/", icon: "⌂" },
  { key: "subscriptions", label: "Subscriptions", to: "/library?view=subscriptions", icon: "" },
  { key: "history", label: "History", to: "/history", icon: "◷" },
  { key: "library", label: "Library", to: "/library", icon: "▤" },
  { key: "watch-later", label: "Watch Later", to: "/library#watch-later", icon: "◷" },
  { key: "liked", label: "Liked", to: "/library#liked", icon: "👍" },
];

export default function AccountNavPills() {
  const { pathname, search, hash } = useLocation();
  const view = new URLSearchParams(search).get("view");

  const isActive = (key: PillKey): boolean => {
    switch (key) {
      case "home":
        return pathname === "/";
      case "subscriptions":
        return pathname === "/library" && view === "subscriptions";
      case "history":
        return pathname === "/history";
      case "library":
        return pathname === "/library" && view !== "subscriptions" && hash === "";
      case "watch-later":
        return pathname === "/library" && hash === "#watch-later";
      case "liked":
        return pathname === "/library" && hash === "#liked";
    }
  };

  return (
    <nav className="account-pills" aria-label="Account sections">
      {PILLS.map((pill) => (
        <Link
          key={pill.key}
          to={pill.to}
          className={`account-pill${isActive(pill.key) ? " account-pill-active" : ""}`}
          aria-current={isActive(pill.key) ? "page" : undefined}
        >
          {pill.icon ? (
            <span className="account-pill-icon" aria-hidden="true">
              {pill.icon}
            </span>
          ) : null}
          {pill.label}
        </Link>
      ))}
    </nav>
  );
}
