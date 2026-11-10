import React, { createContext, useEffect } from "react";
import { CheckRegion, getCurrentTime } from "../utils/getUserLocation_time";
import { useAppDispatch, useAppSelector } from "../store";
import { setMode, type ThemeMode } from "../store/slices/themeSlice";

// Phase 2b: theme mode now lives in the theme RTK slice (persisted by the
// store subscriber). This context keeps its old {mode, setMode} shape so
// ThemeBox is unchanged, but the body-class effect is driven by the slice.
export const ThemeContext = createContext<{
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}>({
  mode: "auto",
  setMode: () => {},
});

const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const mode = useAppSelector((s) => s.theme.mode);
  const dispatch = useAppDispatch();

  async function handleThemeChange() {
    const isSouthIndia = await CheckRegion();
    const hours = getCurrentTime();

    // Effective old behaviour: unset/auto follows the region/time rule
    // (light in South India 10:00–12:00, dark otherwise); light/dark are
    // explicit. (The old `theme === "auto"` branch was unreachable — the
    // first branch already caught it.)
    if (mode === "light") {
      document.body.classList.add("white-theme");
    } else if (mode === "dark") {
      document.body.classList.remove("white-theme");
    } else if (isSouthIndia && hours >= 10 && hours <= 12) {
      document.body.classList.add("white-theme");
    } else {
      document.body.classList.remove("white-theme");
    }
  }

  useEffect(() => {
    handleThemeChange();
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
