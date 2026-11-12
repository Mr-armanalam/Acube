// Watch playlist sidebar (approved preview image-40): header/meta,
// per-item watched / playing / up-next status, small real thumbnails
// + duration badge, current-item red border + ▶, text-link controls
// (no pills), toggle behaviour, and Save-a-copy feedback + guard.
import { describe, it, expect, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import {
  captured,
  fixtureNestedComments,
  fixturePlaylists,
  fixtureVideos,
} from "../mocks/handlers";
import type { Video } from "../types";
import { renderWithProviders, testSession } from "./testUtils";
import { InternetStatusProvider } from "../utils/internetStatusContext";
import Allroutes from "../Allroutes";

const AUTOPLAY_KEY = "acube:watch:autoplay";

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

function renderWatch(
  route = "/watch/vid1",
  session: typeof testSession | null = testSession,
) {
  server.use(
    http.get("*/comment/get", () =>
      HttpResponse.json(pageOf(fixtureNestedComments)),
    ),
  );
  renderRoutes(route, session);
}

/** The playlist card in the sidebar — the Up Next list below it is a
 * separate section and must not be counted in these assertions. */
async function playlistCard() {
  await screen.findByText("Playlist · My favourites", {}, { timeout: 5000 });
  const heading = screen.getByText("Playlist · My favourites");
  const card = heading.closest(".watch-playlist");
  if (!card) throw new Error("playlist card not found");
  return card as HTMLElement;
}

/** Playlist videos with REAL thumbnail URLs (picsum seeds). The shared
 * fixtures deliberately carry no thumbnail — Studio/Content tests pin
 * the ▶ placeholder for them — so the sidebar's real-thumb path is
 * verified by overriding the watch-playlists handler here instead of
 * changing the shared fixtures. */
function withRealThumbs() {
  const playlist = fixturePlaylists[0];
  const videos = playlist.videoIds
    .map((vid) => fixtureVideos.find((f) => f._id === vid))
    .filter((v): v is Video => Boolean(v))
    .map((v) => ({
      ...v,
      thumbnailUrl: `https://picsum.photos/seed/${v._id}/320/180`,
    }));
  server.use(
    http.get("*/watch/:id/playlists", () =>
      HttpResponse.json({
        items: [{ ...playlist, videoCount: videos.length, videos }],
      }),
    ),
  );
}

function historyWith(videoIds: string[]) {
  const now = new Date().toISOString();
  server.use(
    http.get("*/video/getallhistory", () =>
      HttpResponse.json(
        pageOf(
          videoIds.map((videoid, i) => ({
            _id: `h${i}`,
            videoid,
            viewer: "user1",
            likedon: now,
          })),
        ),
      ),
    ),
  );
}

describe("Watch playlist sidebar (image-40)", () => {
  beforeEach(() => {
    window.localStorage.removeItem(AUTOPLAY_KEY);
  });

  it("header + meta show channel, watched count, position and Autoplay", async () => {
    renderWatch();
    const card = await playlistCard();
    // Channel comes from the playlist videos' uploader (vid1: alice);
    // the playlist payload itself carries no channel name.
    expect(
      within(card).getByText(/alice · 0 \/ 2 watched · Playing 1 of 2/),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: "Autoplay ON" }),
    ).toBeInTheDocument();
  });

  it("per-item status: current is Playing now, a history video is ✓ Watched", async () => {
    historyWith(["vid2"]);
    renderWatch();
    const card = await playlistCard();
    expect(
      within(card).getByText(/alice · 1 \/ 2 watched · Playing 1 of 2/),
    ).toBeInTheDocument();
    expect(within(card).getByText("2:14 · Playing now")).toBeInTheDocument();
    expect(within(card).getByText("1:47 · ✓ Watched")).toBeInTheDocument();
  });

  it("a video with no history row is Up next", async () => {
    renderWatch();
    const card = await playlistCard();
    expect(within(card).getByText("1:47 · Up next")).toBeInTheDocument();
  });

  it("small real thumbnails render with a duration badge, no placeholder", async () => {
    withRealThumbs();
    renderWatch();
    const card = await playlistCard();
    const thumbs = card.querySelectorAll("img.watch-playlist-thumb");
    expect(thumbs).toHaveLength(2);
    for (const thumb of Array.from(thumbs)) {
      expect(thumb.getAttribute("src")).toMatch(/picsum\.photos\/seed\/vid/);
    }
    // No 120px Up Next thumb markup and no ▶ placeholder in the card.
    expect(card.querySelectorAll(".watch-thumb-wrap")).toHaveLength(0);
    expect(
      card.querySelector('[aria-label="Video thumbnail unavailable"]'),
    ).toBeNull();
    // Duration badge on the thumb + "duration · status" line (preview
    // arrangement): the badge is the only exact "2:14" in the card.
    expect(within(card).getAllByText("2:14")).toHaveLength(1);
    expect(within(card).getByText("2:14 · Playing now")).toBeInTheDocument();
  });

  it("current item has the red-border class + ▶, others have numbers", async () => {
    renderWatch();
    const card = await playlistCard();
    const current = within(card).getByRole("link", {
      name: /Python Basics Tutorial/,
    });
    expect(current.className).toContain("watch-playlist-item--current");
    expect(current.querySelector(".watch-playlist-index")?.textContent).toBe(
      "▶",
    );
    // The old inline-outline highlight is gone — the class carries it.
    expect(current.getAttribute("style")).toBeNull();
    const next = within(card).getByRole("link", {
      name: /React Hooks Deep Dive/,
    });
    expect(next.className).not.toContain("watch-playlist-item--current");
    expect(next.querySelector(".watch-playlist-index")?.textContent).toBe(
      "2",
    );
  });

  it("has NO pill buttons in the sidebar", async () => {
    renderWatch();
    const card = await playlistCard();
    expect(card.querySelectorAll(".acube-btn-secondary")).toHaveLength(0);
    expect(within(card).queryByText("Save a copy")).toBeNull();
  });

  it("controls are text links with icons", async () => {
    renderWatch();
    const card = await playlistCard();
    expect(
      within(card)
        .getByRole("link", { name: /Play all/ })
        .querySelector("svg"),
    ).not.toBeNull();
    for (const name of [/Shuffle off/, /Loop off/, /Save playlist/]) {
      expect(
        within(card).getByRole("button", { name }).querySelector("svg"),
      ).not.toBeNull();
    }
  });

  it("Shuffle and Loop toggles keep their state", async () => {
    const user = userEvent.setup();
    renderWatch();
    const card = await playlistCard();
    const shuffle = within(card).getByRole("button", { name: /Shuffle off/ });
    await user.click(shuffle);
    expect(
      within(card).getByRole("button", { name: "Shuffle on" }),
    ).toHaveAttribute("aria-pressed", "true");
    const loop = within(card).getByRole("button", { name: /Loop off/ });
    await user.click(loop);
    expect(
      within(card).getByRole("button", { name: "Loop on" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("Autoplay toggle in the meta line persists to localStorage", async () => {
    const user = userEvent.setup();
    renderWatch();
    const card = await playlistCard();
    const toggle = within(card).getByRole("button", { name: "Autoplay ON" });
    await user.click(toggle);
    expect(
      within(card).getByRole("button", { name: "Autoplay OFF" }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(AUTOPLAY_KEY)).toBe("false");
  });

  it("Play all goes to the first video in playlist order", async () => {
    const user = userEvent.setup();
    renderWatch("/watch/vid2");
    const card = await playlistCard();
    expect(
      within(card).getByText(/Playing 2 of 2/),
    ).toBeInTheDocument();
    await user.click(within(card).getByRole("link", { name: /Play all/ }));
    expect(
      await screen.findByRole("heading", { name: "Python Basics Tutorial" }),
    ).toBeInTheDocument();
  });

  it("Save playlist posts a private copy and shows Saved ✓", async () => {
    const user = userEvent.setup();
    renderWatch();
    const card = await playlistCard();
    await user.click(
      within(card).getByRole("button", { name: /Save playlist/ }),
    );
    await waitFor(() => {
      expect(captured.playlistCreates).toContainEqual({
        title: "My favourites (copy)",
        description: "Videos I keep coming back to",
        visibility: "private",
        videoIds: ["vid1", "vid2"],
      });
    });
    expect(
      within(card).getByRole("button", { name: /Saved/ }),
    ).toBeInTheDocument();
  });

  it("Save playlist is disabled when logged out and fires nothing", async () => {
    renderWatch("/watch/vid1", null);
    const card = await playlistCard();
    const save = within(card).getByRole("button", { name: /Save playlist/ });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute(
      "title",
      "Sign in to save a copy of this playlist",
    );
    expect(captured.playlistCreates).toHaveLength(0);
  });

  it("View full playlist is a muted text link to the Playlist page", async () => {
    renderWatch();
    const card = await playlistCard();
    const link = within(card).getByRole("link", {
      name: "View full playlist",
    });
    expect(link.getAttribute("href")).toBe("/playlist/pl1");
    expect(link.className).toContain("watch-playlist-full");
  });
});
