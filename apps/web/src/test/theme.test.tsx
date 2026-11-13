// Porcelain light theme (13 Nov 2026, §8.9.23) — theme slice + provider.
//
// - The slice keeps its "auto" | "light" | "dark" modes; setMode cycles
//   are exercised through the store (the TopBar cycle itself is covered
//   by the Playwright spec, which also proves persistence + reload).
// - "auto" (System) now means prefers-color-scheme — NOT the legacy
//   region/time rule (South India 10:00–12:00 via ipapi.co). The
//   provider applies the white-theme body class from the mode + the
//   mocked media query, and live-tracks OS changes while auto.
import React from "react";
import { act } from "react";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import ThemeProvider from "../context/ThemeProvider";
import { setMode } from "../store/slices/themeSlice";
import { createTestStore, type TestStore } from "./testUtils";

type MediaQueryListener = (e: { matches: boolean }) => void;

function mockMatchMedia(prefersLight: boolean) {
  const listeners = new Set<MediaQueryListener>();
  const original = window.matchMedia;
  const mq = {
    matches: prefersLight,
    media: "(prefers-color-scheme: light)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_type: string, fn: MediaQueryListener) => {
      listeners.add(fn);
    }),
    removeEventListener: vi.fn((_type: string, fn: MediaQueryListener) => {
      listeners.delete(fn);
    }),
    dispatchEvent: vi.fn(),
  };
  window.matchMedia = vi.fn().mockImplementation(() => mq);
  return {
    mq,
    emit(next: boolean) {
      mq.matches = next;
      for (const fn of [...listeners]) fn({ matches: next });
    },
    restore() {
      window.matchMedia = original;
    },
  };
}

function renderProvider(store: TestStore) {
  return render(
    <Provider store={store}>
      <ThemeProvider>
        <div>child</div>
      </ThemeProvider>
    </Provider>,
  );
}

describe("theme slice (§8.9.23)", () => {
  beforeEach(() => {
    document.body.classList.remove("white-theme");
    localStorage.clear();
  });
  afterEach(() => {
    document.body.classList.remove("white-theme");
    localStorage.clear();
  });

  it("defaults to auto and setMode moves through all three modes", () => {
    const store = createTestStore();
    expect(store.getState().theme.mode).toBe("auto");
    store.dispatch(setMode("light"));
    expect(store.getState().theme.mode).toBe("light");
    store.dispatch(setMode("dark"));
    expect(store.getState().theme.mode).toBe("dark");
    store.dispatch(setMode("auto"));
    expect(store.getState().theme.mode).toBe("auto");
  });
});

describe("ThemeProvider body class (§8.9.23)", () => {
  beforeEach(() => {
    document.body.classList.remove("white-theme");
    localStorage.clear();
  });
  afterEach(() => {
    document.body.classList.remove("white-theme");
    localStorage.clear();
  });

  it("explicit light adds white-theme, explicit dark removes it", () => {
    const media = mockMatchMedia(false);
    try {
      const store = createTestStore();
      const { unmount } = renderProvider(store);
      expect(document.body.classList.contains("white-theme")).toBe(false);
      act(() => {
        store.dispatch(setMode("light"));
      });
      expect(document.body.classList.contains("white-theme")).toBe(true);
      act(() => {
        store.dispatch(setMode("dark"));
      });
      expect(document.body.classList.contains("white-theme")).toBe(false);
      unmount();
    } finally {
      media.restore();
    }
  });

  it("auto follows prefers-color-scheme and live-tracks OS changes", () => {
    const media = mockMatchMedia(true);
    try {
      const store = createTestStore();
      const { unmount } = renderProvider(store);
      // auto + light OS = light.
      expect(document.body.classList.contains("white-theme")).toBe(true);
      // OS flips to dark while auto: the class follows, no dispatch.
      act(() => {
        media.emit(false);
      });
      expect(document.body.classList.contains("white-theme")).toBe(false);
      act(() => {
        media.emit(true);
      });
      expect(document.body.classList.contains("white-theme")).toBe(true);
      // Explicit light pins light even when the OS goes dark.
      act(() => {
        store.dispatch(setMode("light"));
        media.emit(false);
      });
      expect(document.body.classList.contains("white-theme")).toBe(true);
      unmount();
    } finally {
      media.restore();
    }
  });

  it("auto with a dark OS stays dark (dark is the default)", () => {
    const media = mockMatchMedia(false);
    try {
      const store = createTestStore();
      const { unmount } = renderProvider(store);
      expect(store.getState().theme.mode).toBe("auto");
      expect(document.body.classList.contains("white-theme")).toBe(false);
      unmount();
    } finally {
      media.restore();
    }
  });
});
