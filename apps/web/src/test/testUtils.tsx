// Shared render helper for the web client tests (Phase 2c).
// Every test gets a FRESH Redux store and QueryClient so tests cannot
// leak session / cache state into each other. The helper wraps the UI in
// Redux + TanStack Query + MemoryRouter, matching the real app shell
// minus TopBar / ThemeProvider / Google OAuth (not under test here).
import React, { type ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import authReducer from "../store/slices/authSlice";
import themeReducer from "../store/slices/themeSlice";
import playerReducer from "../store/slices/playerSlice";
import chatUiReducer from "../store/slices/chatUiSlice";
import uploadReducer, {
  type UploadState,
} from "../store/slices/uploadSlice";
import type { SessionProfile } from "../types";

export const testSession: SessionProfile = {
  result: {
    _id: "user1",
    name: "Test User",
    username: "testuser",
    email: "test@example.com",
  },
  token: "test-token",
};

export function createTestStore(options: {
  session?: SessionProfile | null;
  upload?: Partial<UploadState>;
} = {}) {
  // Annotate explicitly: spreading Partial<UploadState> would widen
  // `status` to string and break configureStore's preloaded-state type.
  const uploadPreloaded: UploadState = {
    progress: 0,
    status: "idle",
    error: null,
    ...(options.upload ?? {}),
  };
  return configureStore({
    reducer: {
      auth: authReducer,
      theme: themeReducer,
      player: playerReducer,
      chatUi: chatUiReducer,
      upload: uploadReducer,
    },
    preloadedState: {
      auth: {
        session: options.session ?? null,
        otpSend: { status: null, data: null },
        otpVerify: { status: null, data: null },
        loginError: null,
      },
      upload: uploadPreloaded,
    },
  });
}

export type TestStore = ReturnType<typeof createTestStore>;

interface RenderWithProvidersOptions extends Omit<RenderOptions, "wrapper"> {
  session?: SessionProfile | null;
  upload?: Partial<UploadState>;
  route?: string;
  store?: TestStore;
}

export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
) {
  const store = options.store ?? createTestStore({
    session: options.session,
    upload: options.upload,
  });
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const view = render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[options.route ?? "/"]}>
          {ui}
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
  return { ...view, store, queryClient };
}
