// Theme slice (RTK) — CLIENT state only.
// Replaces the ad-hoc localStorage reads in ThemeProvider/Navbar.
// The reducer is pure; persistence to localStorage happens in the store
// subscriber in store/index.ts. The body-class effect stays in
// ThemeProvider, now driven by this slice's `mode`.
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type ThemeMode = "auto" | "light" | "dark";

export interface ThemeState {
  mode: ThemeMode;
}

function readStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark" || stored === "auto") {
      return stored;
    }
  } catch {
    // Storage unavailable — fall through to auto.
  }
  return "auto";
}

const initialState: ThemeState = { mode: readStoredTheme() };

const themeSlice = createSlice({
  name: "theme",
  initialState,
  reducers: {
    setMode(state, action: PayloadAction<ThemeMode>) {
      state.mode = action.payload;
    },
  },
});

export const { setMode } = themeSlice.actions;
export default themeSlice.reducer;
