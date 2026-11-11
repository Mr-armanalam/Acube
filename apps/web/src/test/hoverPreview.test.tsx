// Home hover preview (HomeVideoCard): the 900 ms dwell, the
// single-preview rule across the grid, error fallback, reduced-motion
// off, and tab-hidden stop. Fake timers: the grid renders with real
// timers first (MSW + React Query), then the dwell is driven with
// vi.advanceTimersByTime inside act().
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { renderWithProviders } from "./testUtils";
import Home from "../Pages/Home/Home";
import {
  HOVER_PREVIEW_DWELL_MS,
  HOVER_PREVIEW_START_FRACTION,
} from "../Pages/Home/HomeVideoCard";

function cards(): HTMLElement[] {
  return Array.from(document.querySelectorAll(".home-video-card"));
}

function thumbFallback(card: HTMLElement): HTMLElement | null {
  // Fixture videos have no thumbnail URL, so VideoThumb renders its
  // ▶ fallback span (role="img", "Video thumbnail unavailable").
  return card.querySelector('[aria-label="Video thumbnail unavailable"]');
}

function previewVideo(): HTMLVideoElement | null {
  return document.querySelector("video[aria-label^='Preview of']");
}

async function renderHome() {
  renderWithProviders(<Home />);
  await screen.findByText("Python Basics Tutorial");
  await screen.findByText("React Hooks Deep Dive");
  expect(cards()).toHaveLength(3);
}

describe("Home hover preview", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts no preview before the dwell, then plays a muted looping preview from 10%", async () => {
    await renderHome();
    vi.useFakeTimers();
    const card = cards()[0];
    fireEvent.mouseEnter(card);
    // Half the dwell: still the thumbnail, nothing fetched.
    act(() => {
      vi.advanceTimersByTime(HOVER_PREVIEW_DWELL_MS / 2);
    });
    expect(previewVideo()).toBeNull();
    expect(thumbFallback(card)).not.toBeNull();
    // Past the dwell: the preview mounts.
    act(() => {
      vi.advanceTimersByTime(HOVER_PREVIEW_DWELL_MS / 2);
    });
    const video = previewVideo();
    expect(video).not.toBeNull();
    expect(video?.getAttribute("src")).toBe(
      "http://localhost:5000/videos/python.mp4",
    );
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
    expect(video?.playsInline).toBe(true);
    expect(video?.getAttribute("preload")).toBe("none");
    expect(HOVER_PREVIEW_START_FRACTION).toBe(0.1);
  });

  it("leaving before the dwell fires clears the timer — no preview", async () => {
    await renderHome();
    vi.useFakeTimers();
    const card = cards()[0];
    fireEvent.mouseEnter(card);
    act(() => {
      vi.advanceTimersByTime(HOVER_PREVIEW_DWELL_MS / 2);
    });
    fireEvent.mouseLeave(card);
    act(() => {
      vi.advanceTimersByTime(HOVER_PREVIEW_DWELL_MS * 2);
    });
    expect(previewVideo()).toBeNull();
  });

  it("leaving after the preview started stops it and restores the thumbnail", async () => {
    await renderHome();
    vi.useFakeTimers();
    const card = cards()[0];
    fireEvent.mouseEnter(card);
    act(() => {
      vi.advanceTimersByTime(HOVER_PREVIEW_DWELL_MS);
    });
    expect(previewVideo()).not.toBeNull();
    fireEvent.mouseLeave(card);
    expect(previewVideo()).toBeNull();
    expect(thumbFallback(card)).not.toBeNull();
  });

  it("only one preview plays at a time across the grid", async () => {
    await renderHome();
    vi.useFakeTimers();
    fireEvent.mouseEnter(cards()[0]);
    act(() => {
      vi.advanceTimersByTime(HOVER_PREVIEW_DWELL_MS);
    });
    expect(previewVideo()?.getAttribute("aria-label")).toBe(
      "Preview of Python Basics Tutorial",
    );
    fireEvent.mouseEnter(cards()[1]);
    act(() => {
      vi.advanceTimersByTime(HOVER_PREVIEW_DWELL_MS);
    });
    expect(previewVideo()?.getAttribute("aria-label")).toBe(
      "Preview of React Hooks Deep Dive",
    );
    expect(document.querySelectorAll("video[aria-label^='Preview of']")).toHaveLength(1);
  });

  it("a preview error falls back to the thumbnail silently", async () => {
    await renderHome();
    vi.useFakeTimers();
    const card = cards()[0];
    fireEvent.mouseEnter(card);
    act(() => {
      vi.advanceTimersByTime(HOVER_PREVIEW_DWELL_MS);
    });
    const video = previewVideo();
    expect(video).not.toBeNull();
    fireEvent.error(video as Element);
    expect(previewVideo()).toBeNull();
    expect(thumbFallback(card)).not.toBeNull();
    // No retry: hovering again does not start a preview for this card.
    fireEvent.mouseEnter(card);
    act(() => {
      vi.advanceTimersByTime(HOVER_PREVIEW_DWELL_MS * 2);
    });
    expect(previewVideo()).toBeNull();
  });

  it("never starts a preview when prefers-reduced-motion is set", async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    try {
      await renderHome();
      vi.useFakeTimers();
      fireEvent.mouseEnter(cards()[0]);
      act(() => {
        vi.advanceTimersByTime(HOVER_PREVIEW_DWELL_MS * 2);
      });
      expect(previewVideo()).toBeNull();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("stops the preview when the tab is hidden", async () => {
    await renderHome();
    vi.useFakeTimers();
    fireEvent.mouseEnter(cards()[0]);
    act(() => {
      vi.advanceTimersByTime(HOVER_PREVIEW_DWELL_MS);
    });
    expect(previewVideo()).not.toBeNull();
    Object.defineProperty(document, "hidden", {
      value: true,
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(previewVideo()).toBeNull();
    Object.defineProperty(document, "hidden", {
      value: false,
      configurable: true,
    });
  });

  it("cards create no IntersectionObserver of their own", async () => {
    // Regression: an observer per card overwrote the single-callback
    // mock in homePagination.test.tsx and broke page loading. The
    // card observes only while its preview is active. (The 3-video
    // fixture is a single page, so the grid's pagination sentinel
    // creates no observer here either — 0 total.)
    let constructed = 0;
    class CountingObserver implements IntersectionObserver {
      readonly root: Element | Document | null = null;
      readonly rootMargin = "";
      readonly thresholds: readonly number[] = [];
      constructor(_callback: IntersectionObserverCallback) {
        constructed += 1;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }
    const original = globalThis.IntersectionObserver;
    vi.stubGlobal("IntersectionObserver", CountingObserver);
    try {
      await renderHome();
      expect(constructed).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      if (original) globalThis.IntersectionObserver = original;
    }
  });
});
