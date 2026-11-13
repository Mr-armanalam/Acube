// Theme provider (RTK slice drives it; persistence via the store
// subscriber in store/index.ts). The body-class effect lives here.
//
// BEHAVIOUR CHANGE (13 Nov 2026, §8.9.23 — Porcelain light theme):
// "auto" (System) used to follow a legacy region/time rule — light in
// South India 10:00–12:00 via an ipapi.co lookup
// (utils/getUserLocation_time.js). It now means the OS preference:
// prefers-color-scheme: light, live-tracked while the mode is auto.
// Dark stays the default: a fresh install (no stored "theme") is auto,
// and auto is dark unless the OS says light. Explicit light/dark win
// over the OS. The pre-paint init in index.html mirrors this logic so
// there is no flash of the wrong theme; utils/getUserLocation_time.js
// is now unused (left in place, not deleted).
import React, { createContext, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../store";
import { setMode, type ThemeMode } from "../store/slices/themeSlice";

// Phase 2b: theme mode now lives in the theme RTK slice (persisted by the
// store subscriber). This context keeps its old {mode, setMode} shape, but
// the body-class effect is driven by the slice.
export const ThemeContext = createContext<{
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}>({
  mode: "auto",
  setMode: () => {},
});

function systemPrefersLight(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  );
}

const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const mode = useAppSelector((s) => s.theme.mode);
  const dispatch = useAppDispatch();

  useEffect(() => {
    const apply = () => {
      const light = mode === "light" || (mode === "auto" && systemPrefersLight());
      document.body.classList.toggle("white-theme", light);
      // Keep the browser-chrome tint in step with the theme.
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", light ? "#F5F5F2" : "#0c0b0a");
    };
    apply();
    // Live-track the OS preference only while the mode is System.
    if (mode !== "auto") return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [mode]);

  return (
    <ThemeContext.Provider
      value={{ mode, setMode: (m: ThemeMode) => dispatch(setMode(m)) }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;
