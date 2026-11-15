// Phase 5 match-preview (follow-up) — the watch-side shell, rebuilt in
// the same premium design language as the Studio preview (Obsidian +
// Acube Red, Plus Jakarta Sans + Manrope). This REPLACES the legacy
// Your-Tube Navbar + drawer, which are deleted: no burger menu, no
// "Your-Tube" wordmark, no notifications bell. Acube wordmark, search,
// Studio + Upload (signed in only), and the signed-in avatar menu
// (Your account / Your channel / Create channel / Sign out, plus the
// theme choice). Google sign-in is the same verified-ID-token flow
// the old Navbar used (loginThunk with the credential); the
// session-expiry check on mount is preserved too. "Your account"
// lands on the Library hub (the account overview); "Create channel"
// opens the legacy Create/Edit-channel modal (seteditcreatechanelbtn)
// — channel creation lives there (it PATCHes the user record, which
// IS the channel; Studio Settings is edit-only), so the menu must not
// route it to /studio/settings.
//
// One theme control at a time: the TopBar icon is the LOGGED-OUT
// control (logged-out users have no account menu), and it hides once
// signed in, when the account menu's System/Light/Dark control
// exists — two places to manage theme would be redundant. Studio +
// Upload are the mirror image: hidden logged out, shown signed in.
import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { GoogleLogin, googleLogout, type CredentialResponse } from "@react-oauth/google";
import { jwtDecode } from "jwt-decode";
import { useAppDispatch, useAppSelector } from "../../store";
import { loginThunk, logoutThunk } from "../../store/slices/authSlice";
import { setMode, type ThemeMode } from "../../store/slices/themeSlice";
import "./TopBar.css";

// Theme cycle (Porcelain light theme, §8.9.23): System -> Light ->
// Dark -> System. "System" means the OS preference
// (prefers-color-scheme), live-tracked by ThemeProvider.
const THEME_CYCLE: Record<ThemeMode, ThemeMode> = {
  auto: "light",
  light: "dark",
  dark: "auto",
};
const THEME_LABEL: Record<ThemeMode, string> = {
  auto: "System",
  light: "Light",
  dark: "Dark",
};
const THEME_ICON: Record<ThemeMode, string> = {
  auto: "◐",
  light: "☀",
  dark: "☾",
};

export default function TopBar({
  seteditcreatechanelbtn,
}: {
  seteditcreatechanelbtn: (v: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
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

  // Keep the box in sync with the route: on /search/<q> it shows
  // <q>, anywhere else it is empty. Depends on the pathname only, so
  // typing never gets clobbered mid-keystroke.
  useEffect(() => {
    const match = location.pathname.match(/^\/search\/(.+)$/);
    if (!match) {
      setQuery("");
      return;
    }
    try {
      setQuery(decodeURIComponent(match[1]));
    } catch {
      setQuery(match[1]);
    }
  }, [location.pathname]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    // An empty submit used to be a silent no-op that left the stale
    // /search/<old query> in the URL; it now returns to the feed.
    if (q) navigate(`/search/${encodeURIComponent(q)}`);
    else navigate("/");
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
        {/* Studio + Upload are signed-in only: logged out they led to
            RequireAuth, which silently redirected to "/" — a dead end
            with no explanation. */}
        {currentuser ? (
          <>
            <Link to="/studio">Studio</Link>
            <Link to="/studio/upload" className="acube-btn topbar-upload">
              + Upload
            </Link>
          </>
        ) : null}
        {/* One theme control at a time: the icon is the logged-out
            control (no account menu exists logged out); once signed
            in the account menu holds the theme choice instead. */}
        {!currentuser ? (
          <button
            type="button"
            className="topbar-icon-btn"
            data-testid="theme-toggle"
            aria-label={`Theme: ${THEME_LABEL[themeMode]} — switch to ${THEME_LABEL[THEME_CYCLE[themeMode]]}`}
            title={`Theme: ${THEME_LABEL[themeMode]}`}
            onClick={() => dispatch(setMode(THEME_CYCLE[themeMode]))}
          >
            {THEME_ICON[themeMode]}
          </button>
        ) : null}
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
                  to="/library"
                  onClick={() => setMenuOpen(false)}
                >
                  Your account
                </Link>
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
                {/* Theme row (Porcelain light theme, §8.9.23): the same
                    System / Light / Dark choice as Studio Settings
                    Appearance. This is the signed-in theme control —
                    the TopBar icon hides once signed in. */}
                <div className="topbar-menu-theme">
                  <span className="topbar-menu-theme-label" aria-hidden="true">
                    Theme
                  </span>
                  <div
                    className="acube-segmented"
                    role="group"
                    aria-label="Theme"
                  >
                    {(["auto", "light", "dark"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        data-testid={`theme-menu-${m}`}
                        aria-pressed={themeMode === m}
                        onClick={() => {
                          dispatch(setMode(m));
                          setMenuOpen(false);
                        }}
                      >
                        {THEME_LABEL[m]}
                      </button>
                    ))}
                  </div>
                </div>
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
