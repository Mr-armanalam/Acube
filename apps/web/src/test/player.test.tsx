// Video player (Phase 2c regression): the old handleTimeUpdate started a
// new setInterval on every timeupdate with no clearInterval, and the
// fullscreen / picture-in-picture listeners were removed with fresh
// anonymous functions, so they were never removed.
import { createRef } from "react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders, testSession } from "./testUtils";
import VideoPlayer from "../Component/videoPlayer/videoPlayer";

function renderPlayer() {
  const commentRef = createRef<HTMLInputElement>();
  return {
    commentRef,
    ...renderWithProviders(
      <VideoPlayer
        video="/videos/python.mp4"
        currentuser={null}
        commentRef={commentRef}
      />,
      { session: testSession },
    ),
  };
}

describe("Video player", () => {
  beforeEach(() => {
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(
      () => Promise.resolve(),
    );
    vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(
      () => {},
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("toggles play / pause", async () => {
    const user = userEvent.setup();
    const { container, store } = renderPlayer();
    const playBtn = container.querySelector(".play-pause-btn");
    if (!playBtn) throw new Error("play button not found");

    await user.click(playBtn);
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(store.getState().player.isPlaying).toBe(true);

    await user.click(playBtn);
    expect(window.HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(store.getState().player.isPlaying).toBe(false);
  });

  it("updates the time display from timeupdate without any setInterval", async () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const { container } = renderPlayer();
    const video = container.querySelector("video");
    if (!video) throw new Error("video element not found");
    // jsdom media elements report 0 for currentTime/duration; stub them.
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      get: () => 65,
    });
    Object.defineProperty(video, "duration", {
      configurable: true,
      get: () => 125,
    });

    fireEvent(video, new Event("timeupdate"));
    fireEvent(video, new Event("timeupdate"));
    fireEvent(video, new Event("timeupdate"));

    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(await screen.findByText("0:1:5")).toBeInTheDocument();
    expect(await screen.findByText("0.2.5")).toBeInTheDocument();
    setIntervalSpy.mockRestore();
  });

  it("seeks with the arrow keys", async () => {
    const { container } = renderPlayer();
    const video = container.querySelector("video");
    if (!video) throw new Error("video element not found");
    let currentTime = 10;
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      get: () => currentTime,
      set: (value: number) => {
        currentTime = value;
      },
    });

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(currentTime).toBe(15);
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(currentTime).toBe(10);
  });

  it("removes the fullscreen / picture-in-picture listeners on unmount", () => {
    const added = new Map<string, EventListener>();
    const removed: Array<{ type: string; fn: EventListener }> = [];
    const addSpy = vi
      .spyOn(document, "addEventListener")
      .mockImplementation(((type: string, fn: EventListener) => {
        if (
          type === "fullscreenchange" ||
          type === "enterpictureinpicture" ||
          type === "leavepictureinpicture"
        ) {
          added.set(type, fn);
        }
      }) as typeof document.addEventListener);
    const removeSpy = vi
      .spyOn(document, "removeEventListener")
      .mockImplementation(((type: string, fn: EventListener) => {
        removed.push({ type, fn });
      }) as typeof document.removeEventListener);

    const { unmount } = renderPlayer();
    expect(added.size).toBe(3);
    unmount();

    for (const [type, fn] of added) {
      expect(removed).toContainEqual({ type, fn });
    }
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
