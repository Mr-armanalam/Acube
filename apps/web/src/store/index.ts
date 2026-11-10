// RTK store (Phase 2b). Client state ONLY — auth session, theme, player UI,
// chat UI, upload progress. All server state lives in TanStack Query
// (see ../query). No redux-thunk, no hand-rolled reducers.
import { configureStore } from "@reduxjs/toolkit";
import type { TypedUseSelectorHook } from "react-redux";
import { useDispatch, useSelector } from "react-redux";
import authReducer, { loadInitialSession } from "./slices/authSlice";
import themeReducer from "./slices/themeSlice";
import playerReducer from "./slices/playerSlice";
import chatUiReducer from "./slices/chatUiSlice";
import uploadReducer from "./slices/uploadSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    theme: themeReducer,
    player: playerReducer,
    chatUi: chatUiReducer,
    upload: uploadReducer,
  },
  // Single session bootstrap: hydrate the stored profile once, here —
  // not in a reducer and not in a Navbar useEffect loop.
  preloadedState: {
    auth: {
      session: loadInitialSession(),
      otpSend: { status: null, data: null },
      otpVerify: { status: null, data: null },
      loginError: null,
    },
  },
});

// Persist theme choice outside the reducer (reducers stay pure).
let lastTheme = store.getState().theme.mode;
store.subscribe(() => {
  const mode = store.getState().theme.mode;
  if (mode !== lastTheme) {
    lastTheme = mode;
    try {
      localStorage.setItem("theme", mode);
    } catch {
      // Storage unavailable — theme still applies for this session.
    }
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
