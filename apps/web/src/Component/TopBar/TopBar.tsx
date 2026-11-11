// Phase 5 match-preview (follow-up) — the watch-side shell, rebuilt in
// the same premium design language as the Studio preview (Obsidian +
// Acube Red, Plus Jakarta Sans + Manrope). This REPLACES the legacy
// Your-Tube Navbar + drawer, which are deleted: no burger menu, no
// "Your-Tube" wordmark, no notifications bell. Acube wordmark, search,
// Studio + Upload, theme toggle, and the signed-in avatar menu
// (Your channel / Create channel / Sign out). Google sign-in is the
// same verified-ID-token flow the old Navbar used (loginThunk with the
// credential); the session-expiry check on mount is preserved too.
import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { GoogleLogin, googleLogout, type CredentialResponse } from "@react-oauth/google";
import { jwtDecode } from "jwt-decode";
import { useAppDispatch, useAppSelector } from "../../store";
import { loginThunk, logoutThunk } from "../../store/slices/authSlice";
import { setMode } from "../../store/slices/themeSlice";
import "./TopBar.css";

export default function TopBar({
  seteditcreatechanelbtn,
}: {
  seteditcreatechanelbtn: (v: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const currentuser = useAppSelector((s) => s.auth.session);
  const themeMode = useAppSelector((s) => s.theme.mode);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSuccess = useCallback(
    (credentialResponse: CredentialResponse) => {
      const idToken = credentialResponse.credential;
      if (!idToken) {
        console.error("Google sign-in returned no ID token");
        return;
      }
      setIsLoading(true);
      void dispatch(loginThunk({ idToken }))
        .unwrap()
        .then(() => setIsLoading(false))
        .catch(() => setIsLoading(false));
    },
    [dispatch],
  );

  const handleGoogleError = useCallback(() => {
    console.log("Login Failed");
  }, []);

  const logout = useCallback(() => {
    void dispatch(logoutThunk());
    googleLogout();
    localStorage.clear();
    setMenuOpen(false);
  }, [dispatch]);

  // Preserved from the old Navbar: check token expiry once on mount.
  // A token that is not a decodable JWT (e.g. a test fixture token)
  // simply skips the check instead of crashing the shell.
  useEffect(() => {
    const token = currentuser?.token;
    if (token) {
      try {
        const decodetoken = jwtDecode(token) as { exp?: number };
        if (
          decodetoken.exp !== undefined &&
          decodetoken.exp * 1000 < new Date().getTime()
        ) {
          logout();
        }
      } catch {
        // Not a decodable JWT — nothing to check.
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) navigate(`/search/${encodeURIComponent(q)}`);
  };

  const initial = (
    currentuser?.result.name ?? currentuser?.result.email ?? "?"
  )
    .charAt(0)
    .toUpperCase();

  return (
    <header className="topbar">
      <Link to="/" className="topbar-logo" aria-label="Acube home">
        <span className="topbar-logo-mark" aria-hidden="true">
          A
        </span>
        <span className="topbar-logo-word">Acube</span>
      </Link>
      <form className="topbar-search" role="search" onSubmit={submitSearch}>
        <input
          type="search"
          aria-label="Search videos"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="acube-btn-secondary">
          Search
        </button>
      </form>
      <nav className="topbar-nav" aria-label="Primary">
        <Link to="/studio">Studio</Link>
        <Link to="/studio/upload" className="acube-btn topbar-upload">
          + Upload
        </Link>
        <button
          type="button"
          className="topbar-icon-btn"
          aria-label={
            themeMode === "light" ? "Switch to dark theme" : "Switch to light theme"
          }
          onClick={() =>
            dispatch(setMode(themeMode === "light" ? "dark" : "light"))
          }
        >
          {themeMode === "light" ? "☾" : "☀"}
        </button>
        {currentuser ? (
          <div className="topbar-user">
            <button
              type="button"
              className="topbar-avatar"
              aria-label="Account menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {initial}
            </button>
            {menuOpen ? (
              <div className="topbar-menu" role="menu">
                <Link
                  to={`/channel/${currentuser.result._id}`}
                  onClick={() => setMenuOpen(false)}
                >
                  Your channel
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    seteditcreatechanelbtn(true);
                  }}
                >
                  Create channel
                </button>
                <button type="button" onClick={logout}>
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <span className="topbar-signin">
            {isLoading ? (
              <span>Loading...</span>
            ) : (
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
              />
            )}
          </span>
        )}
      </nav>
    </header>
  );
}
