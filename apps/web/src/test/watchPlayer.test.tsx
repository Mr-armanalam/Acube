// Watch-page rebuild tests (MSW + Player unit tests): poster +
// error state with Retry, auto-hide controls, icon buttons, chapter
// bar (real data only) with chapter click updating ?t= + seeking,
// real Subscribe toggle (count, owner-hidden, logged-out disabled),
// Up Next thumbnails + duration badges, and the resolved video src.
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  vi,
} from "vitest";
import userEvent from "@testing-library/user-event";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import {
  captured,
  fixtureNestedComments,
  fixtureVideos,
} from "../mocks/handlers";
import { renderWithProviders, testSession } from "./testUtils";
import { InternetStatusProvider } from "../utils/internetStatusContext";
import Allroutes from "../Allroutes";
import Player, { CONTROLS_HIDE_DELAY_MS } from "../Pages/Watch/Player";
import type { SessionProfile } from "../types";

function renderRoutes(route: string, session: typeof testSession | null) {
  return renderWithProviders(
    <InternetStatusProvider>
      <Allroutes seteditcreatechanelbtn={() => {}} />
    </InternetStatusProvider>,
    { route, session },
  );
}

const pageOf = <T,>(items: T[]) => ({
  items,
  page: 1,
  limit: 50,
  total: items.length,
  totalPages: 1,
});

const ownerSession: SessionProfile = {
  result: {
    _id: "ch1",
    name: "Alice",
    username: "alice",
    email: "alice@example.com",
  },
  token: "test-token",
};

function renderPlayer(props: {
  chapters?: Array<{ title: string; startSec: number }>;
  poster?: string;
  onChapterSeek?: (sec: number) => void;
} = {}) {
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

describe("Watch Player — poster + error state", () => {
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

  it("uses the video thumbnail as the poster and shows poster + Retry on load failure", async () => {
    const { container } = renderPlayer({
      poster: "https://cdn.example/poster.jpg",
    });
    const video = container.querySelector("video");
    if (!video) throw new Error("video element not found");
    expect(video.getAttribute("poster")).toBe("https://cdn.example/poster.jpg");
    expect(
      screen.queryByText("This video couldn't be played"),
    ).not.toBeInTheDocument();
    fireEvent.error(video);
    expect(
      await screen.findByText("This video couldn't be played"),
    ).toBeInTheDocument();
    // The error state shows the REAL poster large — never a gradient
    // box pretending to be the video.
    const errorPoster = container.querySelector(".acube-player-error-poster");
    expect(errorPoster?.getAttribute("src")).toBe(
      "https://cdn.example/poster.jpg",
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      screen.queryByText("This video couldn't be played"),
    ).not.toBeInTheDocument();
  });
});

describe("Watch Player — auto-hide controls", () => {
  beforeEach(() => {
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(
      () => Promise.resolve(),
    );
    vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(
      () => {},
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("hides ~3s after the last interaction while playing, returns on mouse move, stays visible while paused", async () => {
    const { container } = renderPlayer();
    vi.useFakeTimers();
    const region = screen.getByRole("region", { name: "Video player" });
    const controls = container.querySelector(".acube-player-controls");
    if (!controls) throw new Error("controls not found");
    expect(controls.classList.contains("acube-player-controls--hidden")).toBe(
      false,
    );
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    act(() => {
      vi.advanceTimersByTime(CONTROLS_HIDE_DELAY_MS - 1);
    });
    expect(controls.classList.contains("acube-player-controls--hidden")).toBe(
      false,
    );
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(controls.classList.contains("acube-player-controls--hidden")).toBe(
      true,
    );
    // Mouse move wakes the controls again.
    fireEvent.mouseMove(region);
    expect(controls.classList.contains("acube-player-controls--hidden")).toBe(
      false,
    );
    // Paused: no hiding, however long nothing happens.
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    act(() => {
      vi.advanceTimersByTime(CONTROLS_HIDE_DELAY_MS * 2);
    });
    expect(controls.classList.contains("acube-player-controls--hidden")).toBe(
      false,
    );
  });
});

describe("Watch Player — icon buttons + chapter bar", () => {
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

  it("renders icon buttons with aria-labels, not text buttons", () => {
    renderPlayer();
    for (const name of ["Play", "Mute", "Picture in picture", "Fullscreen"]) {
      const button = screen.getByRole("button", { name });
      expect(button.querySelector("svg")).not.toBeNull();
    }
    expect(screen.queryByText("Fullscreen")).toBeNull();
    expect(screen.queryByText("PiP")).toBeNull();
    expect(screen.queryByText("Mute")).toBeNull();
    // The speed button keeps its value as text ("1x").
    expect(
      screen.getByRole("button", { name: "Playback speed" }),
    ).toHaveTextContent("1x");
  });

  it("shows no chapter bar when the backend returns chapters: [] (empty array, not absent)", () => {
    const { container } = renderPlayer({ chapters: [] });
    expect(container.querySelector(".acube-chapter-bar")).toBeNull();
    expect(screen.queryByText(/Chapter:/)).toBeNull();
  });

  it("renders the chapter bar from real data; a chapter click seeks and reports the second", async () => {
    const onChapterSeek = vi.fn();
    const { container } = renderPlayer({
      chapters: [
        { title: "Intro", startSec: 0 },
        { title: "The trap", startSec: 32 },
        { title: "Outro", startSec: 90 },
      ],
      onChapterSeek,
    });
    const video = container.querySelector("video");
    if (!video) throw new Error("video element not found");
    const media = stubMedia(video, 0, 120);
    fireEvent(video, new Event("loadedmetadata"));
    expect(await screen.findByText("Chapter: Intro")).toBeInTheDocument();
    const segments = screen.getAllByRole("button", { name: /Chapter:/ });
    expect(segments).toHaveLength(3);
    fireEvent.click(
      screen.getByRole("button", { name: "Chapter: The trap" }),
    );
    expect(media.currentTime).toBe(32);
    expect(onChapterSeek).toHaveBeenCalledWith(32);
    // The label follows the playhead into the next chapter.
    video.currentTime = 95;
    fireEvent(video, new Event("timeupdate"));
    expect(await screen.findByText("Chapter: Outro")).toBeInTheDocument();
  });
});

describe("Watch page — resolved src/poster, subscribe, Up Next, chapters", () => {
  beforeAll(async () => {
    // Watch is React.lazy in Allroutes: warm the chunk once so the
    // first test's findBy* does not race the cold transform.
    await import("../Pages/Watch/Watch");
  });

  beforeEach(() => {
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(
      () => Promise.resolve(),
    );
    vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(
      () => {},
    );
    server.use(
      http.get("*/comment/get", () =>
        HttpResponse.json(pageOf(fixtureNestedComments)),
      ),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves the filepath and thumbnail through the API base (no /uploads 404 against the web origin)", async () => {
    server.use(
      http.get("*/video/:id", () =>
        HttpResponse.json({
          ...fixtureVideos[0],
          filepath: "/uploads/demo.mp4",
          thumbnailUrl: "/uploads/thumb.jpg",
        }),
      ),
    );
    const { container } = renderRoutes("/watch/vid1", testSession);
    const video = (await screen.findByLabelText("Video")) as HTMLVideoElement;
    expect(video.getAttribute("src")).toBe(
      "http://localhost:5000/uploads/demo.mp4",
    );
    expect(video.getAttribute("poster")).toBe(
      "http://localhost:5000/uploads/thumb.jpg",
    );
    void container;
  });

  it("Subscribe toggles on the Watch channel row and updates the real count", async () => {
    const user = userEvent.setup();
    renderRoutes("/watch/vid1", testSession);
    expect(await screen.findByText("Up next")).toBeInTheDocument();
    const subscribe = screen.getByRole("button", {
      name: "Subscribe to alice",
    });
    expect(await screen.findByText("42 subscribers")).toBeInTheDocument();
    await user.click(subscribe);
    expect(
      await screen.findByRole("button", { name: "Subscribed to alice" }),
    ).toBeInTheDocument();
    expect(screen.getByText("43 subscribers")).toBeInTheDocument();
    await waitFor(() => {
      expect(captured.subscribeToggles).toContain("ch1");
    });
  });

  it("a failed toggle rolls the button and count back (500)", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/subscriptions/:channelId/toggle", ({ params }) => {
        captured.subscribeToggles.push(String(params.channelId));
        return HttpResponse.json(
          { error: { code: "SERVER_ERROR", message: "boom" } },
          { status: 500 },
        );
      }),
    );
    renderRoutes("/watch/vid1", testSession);
    expect(await screen.findByText("Up next")).toBeInTheDocument();
    expect(await screen.findByText("42 subscribers")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Subscribe to alice" }),
    );
    // Optimistic flip happens, then the 500 rolls it back to the
    // last server-confirmed state — never a faked subscription.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Subscribe to alice" }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("42 subscribers")).toBeInTheDocument();
    expect(captured.subscribeToggles).toContain("ch1");
  });

  it("an unknown channel 404s: no invented count, toggle fails cleanly with no crash", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/video/:id", () =>
        HttpResponse.json({
          ...fixtureVideos[0],
          videochanel: "chX",
          uploader: "ghost",
        }),
      ),
    );
    renderRoutes("/watch/vid1", testSession);
    expect(await screen.findByText("Up next")).toBeInTheDocument();
    // GET /subscriptions/chX 404s (NOT_FOUND): the button still
    // renders, but no count is ever invented for it.
    const subscribe = screen.getByRole("button", {
      name: "Subscribe to ghost",
    });
    expect(subscribe).toBeEnabled();
    expect(screen.queryByText(/subscribers/)).not.toBeInTheDocument();
    await user.click(subscribe);
    // POST /subscriptions/chX/toggle 404s too: the optimistic flip
    // (none — no previous state) rolls back and the button stays
    // "Subscribe", with no crash and no invented count.
    await waitFor(() => {
      expect(captured.subscribeToggles).toContain("chX");
    });
    expect(
      screen.getByRole("button", { name: "Subscribe to ghost" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/subscribers/)).not.toBeInTheDocument();
  });

  it("hides Subscribe for the channel owner", async () => {
    renderRoutes("/watch/vid1", ownerSession);
    expect(await screen.findByText("Up next")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Subscribe/ }),
    ).not.toBeInTheDocument();
  });

  it("disables Subscribe when logged out, with a clear sign-in title", async () => {
    renderRoutes("/watch/vid1", null);
    expect(await screen.findByText("Up next")).toBeInTheDocument();
    const subscribe = screen.getByRole("button", {
      name: "Subscribe to alice",
    });
    expect(subscribe).toBeDisabled();
    expect(subscribe).toHaveAttribute("title", "Sign in to subscribe");
    // The real count is public info and still shows.
    expect(await screen.findByText("42 subscribers")).toBeInTheDocument();
  });

  it("Up Next items have real thumbnails + duration badges, keeping the Because: reasons", async () => {
    server.use(
      http.get("*/watch/:id/suggestions", () =>
        HttpResponse.json({
          items: [
            {
              video: {
                ...fixtureVideos[2],
                thumbnailUrl: "https://cdn.example/thumb-java.jpg",
              },
              reason: "Same channel",
            },
            {
              video: {
                ...fixtureVideos[1],
                thumbnailUrl: "https://cdn.example/thumb-react.jpg",
              },
              reason: "Same topic",
            },
          ],
        }),
      ),
    );
    const { container } = renderRoutes("/watch/vid1", testSession);
    expect(await screen.findByText("Up next")).toBeInTheDocument();
    expect(
      container.querySelector(
        'img[src="https://cdn.example/thumb-java.jpg"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        'img[src="https://cdn.example/thumb-react.jpg"]',
      ),
    ).not.toBeNull();
    const badges = Array.from(
      container.querySelectorAll(".watch-duration-badge"),
    ).map((el) => el.textContent);
    expect(badges).toContain("3:02"); // vid3, 182s
    expect(badges).toContain("1:47"); // vid2, 107s
    expect(screen.getByText("Because: Same channel")).toBeInTheDocument();
    expect(screen.getByText("Because: Same topic")).toBeInTheDocument();
  });

  it("clicking a chapter seeks and puts ?t= in the URL", async () => {
    server.use(
      http.get("*/video/:id", () =>
        HttpResponse.json({
          ...fixtureVideos[0],
          filepath: "/uploads/demo.mp4",
          durationSec: 120,
          chapters: [
            { title: "Intro", startSec: 0 },
            { title: "The trap", startSec: 32 },
          ],
        }),
      ),
    );
    const { container } = renderRoutes("/watch/vid1", testSession);
    expect(
      await screen.findByRole("heading", { name: "Python Basics Tutorial" }),
    ).toBeInTheDocument();
    const video = container.querySelector("video");
    if (!video) throw new Error("video element not found");
    const media = stubMedia(video, 0, 120);
    fireEvent(video, new Event("loadedmetadata"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Chapter: The trap" }),
    );
    expect(media.currentTime).toBe(32);
    // ?t=32 is now in the URL state: the Watch header shows the
    // resume point it produces.
    expect(await screen.findByText(/Resumed from 0:32/)).toBeInTheDocument();
  });
});
