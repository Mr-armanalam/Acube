// Video player (Phase 5 fix): the old Component/videoPlayer was
// deleted with Videopage — these tests cover the rebuilt Watch Player
// (apps/web/src/Pages/Watch/Player.tsx): play/pause, time display
// from timeupdate with no setInterval, arrow keys ±5s, J/L ±10s, the
// draggable seek knob (pointer events), hover time preview, and NO
// fake chapter ticks when no chapter data exists.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders, testSession } from "./testUtils";
import Player from "../Pages/Watch/Player";

function renderPlayer(props: { chapters?: Array<{ title: string; startSec: number }> } = {}) {
  return renderWithProviders(
    <Player src="/videos/python.mp4" {...props} />,
    { session: testSession },
  );
}

function stubMedia(video: HTMLVideoElement, currentTime: number, duration: number) {
  let ct = currentTime;
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    get: () => ct,
    set: (value: number) => {
      ct = value;
    },
  });
  Object.defineProperty(video, "duration", {
    configurable: true,
    get: () => duration,
  });
  return {
    get currentTime() {
      return ct;
    },
  };
}

describe("Watch Player", () => {
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
    renderPlayer();
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(window.HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it("updates the time display from timeupdate without any setInterval", async () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const { container } = renderPlayer();
    const video = container.querySelector("video");
    if (!video) throw new Error("video element not found");
    stubMedia(video, 65, 125);
    fireEvent(video, new Event("timeupdate"));
    fireEvent(video, new Event("timeupdate"));
    fireEvent(video, new Event("timeupdate"));
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(await screen.findByText("1:05 / 2:05")).toBeInTheDocument();
    setIntervalSpy.mockRestore();
  });

  it("seeks with the arrow keys (±5s) and J/L (±10s)", async () => {
    const { container } = renderPlayer();
    const video = container.querySelector("video");
    if (!video) throw new Error("video element not found");
    const media = stubMedia(video, 10, 125);
    const region = screen.getByRole("region", { name: "Video player" });
    fireEvent.keyDown(region, { key: "ArrowRight" });
    expect(media.currentTime).toBe(15);
    fireEvent.keyDown(region, { key: "ArrowLeft" });
    expect(media.currentTime).toBe(10);
    fireEvent.keyDown(region, { key: "l" });
    expect(media.currentTime).toBe(20);
    fireEvent.keyDown(region, { key: "j" });
    expect(media.currentTime).toBe(10);
  });

  it("has exactly one seek control and no fake chapter ticks", () => {
    const { container } = renderPlayer();
    expect(screen.getByRole("slider", { name: "Seek slider" })).toBeInTheDocument();
    // The duplicated native range slider is gone; only Volume remains.
    expect(screen.getByLabelText("Volume")).toBeInTheDocument();
    expect(container.querySelectorAll(".acube-seek-tick")).toHaveLength(0);
  });

  it("renders real chapter ticks when chapter data is passed", () => {
    const { container } = renderPlayer({
      chapters: [
        { title: "Intro", startSec: 0 },
        { title: "The trap", startSec: 32 },
      ],
    });
    const video = container.querySelector("video");
    if (!video) throw new Error("video element not found");
    stubMedia(video, 0, 120);
    fireEvent(video, new Event("loadedmetadata"));
    expect(container.querySelectorAll(".acube-seek-tick")).toHaveLength(2);
  });

  it("seeks by dragging the knob (pointer events on the track)", () => {
    const { container } = renderPlayer();
    const video = container.querySelector("video");
    if (!video) throw new Error("video element not found");
    const media = stubMedia(video, 0, 100);
    const track = screen.getByRole("slider", { name: "Seek slider" });
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 200,
      top: 0,
      height: 6,
      right: 200,
      bottom: 6,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    fireEvent.pointerDown(track, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(track, { clientX: 150, pointerId: 1 });
    fireEvent.pointerUp(track, { pointerId: 1 });
    expect(media.currentTime).toBeCloseTo(75, 0);
    void container;
  });

  it("shows a hover time preview on the seek track", async () => {
    const { container } = renderPlayer();
    const video = container.querySelector("video");
    if (!video) throw new Error("video element not found");
    stubMedia(video, 0, 120);
    fireEvent(video, new Event("loadedmetadata"));
    const track = screen.getByRole("slider", { name: "Seek slider" });
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 200,
      top: 0,
      height: 6,
      right: 200,
      bottom: 6,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    fireEvent.pointerMove(track, { clientX: 100 });
    expect(await screen.findByText("1:00")).toBeInTheDocument();
    void container;
  });
});
