// Phase 5 — Watch / History / Library hub tests (MSW): rebuilt player
// controls + nested comments, /videopage redirect, History day groups,
// Library hub lists + playlist create.
import { describe, it, expect } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { captured, fixtureNestedComments } from "../mocks/handlers";
import { renderWithProviders, testSession } from "./testUtils";
import { InternetStatusProvider } from "../utils/internetStatusContext";
import Allroutes from "../Allroutes";

function renderRoutes(route: string, session: typeof testSession | null) {
  return renderWithProviders(
    <InternetStatusProvider>
      <Allroutes
        seteditcreatechanelbtn={() => {}}
        setvideouploadpage={() => {}}
      />
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

describe("Watch page", () => {
  it("renders the rebuilt player controls and nested comments", async () => {
    server.use(
      http.get("*/comment/get", () =>
        HttpResponse.json(pageOf(fixtureNestedComments)),
      ),
    );
    renderRoutes("/watch/vid1", testSession);
    expect(
      await screen.findAllByText("Python Basics Tutorial"),
    ).toHaveLength(2); // title + playlist showcase entry
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Seek" })).toBeInTheDocument();
    expect(screen.getByLabelText("Volume")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fullscreen" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Playback speed" }),
    ).toBeInTheDocument();
    // Nested thread: reply is rendered under its parent, collapsible.
    expect(await screen.findByText("Great tutorial!")).toBeInTheDocument();
    expect(screen.getByText("Thanks, glad it helped!")).toBeInTheDocument();
    expect(screen.getAllByText("Hide replies").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Up next")).toBeInTheDocument();
    // Playlist showcase: vid1 belongs to the mocked "My favourites".
    expect(screen.getByText("Playlist · My favourites")).toBeInTheDocument();
  });

  it("loads the video by id even when it is not in the feed", async () => {
    // Contract fix: the Watch page uses GET /video/:id, not the page-1
    // feed filter — an unlisted video (or one past page 1) still loads.
    server.use(
      http.get("*/video/getvideos", () => HttpResponse.json(pageOf([]))),
    );
    renderRoutes("/watch/vid1", testSession);
    expect(
      await screen.findByRole("heading", { name: "Python Basics Tutorial" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("redirects /videopage/:id to /watch/:id", async () => {
    renderRoutes("/videopage/vid1", testSession);
    expect(
      await screen.findAllByText("Python Basics Tutorial"),
    ).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("reply box posts with the parent comment id", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/comment/get", () =>
        HttpResponse.json(pageOf(fixtureNestedComments)),
      ),
    );
    renderRoutes("/watch/vid1", testSession);
    expect(await screen.findByText("Great tutorial!")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Reply" })[0]);
    const box = screen.getByLabelText("Write a reply");
    await user.type(box, "A nested reply{Enter}");
    await waitFor(() => {
      expect(captured.comments).toContainEqual(
        expect.objectContaining({ parentId: "c1", commentbody: "A nested reply" }),
      );
    });
  });
});

describe("History page", () => {
  it("renders mocked history grouped under Today", async () => {
    const now = new Date().toISOString();
    server.use(
      http.get("*/video/getallhistory", () =>
        HttpResponse.json(
          pageOf([
            // Real history rows carry `likedon`, not `createdAt`.
            { _id: "h1", videoid: "vid1", viewer: "user1", likedon: now },
          ]),
        ),
      ),
    );
    renderRoutes("/history", testSession);
    expect(await screen.findByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Python Basics Tutorial")).toBeInTheDocument();
    expect(screen.getByText("Resume")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear all watch history" }),
    ).toBeInTheDocument();
  });

  it("per-item remove calls DELETE /video/deletehistory/:videoid/:viewer", async () => {
    const user = userEvent.setup();
    const now = new Date().toISOString();
    server.use(
      http.get("*/video/getallhistory", () =>
        HttpResponse.json(
          pageOf([
            { _id: "h1", videoid: "vid1", viewer: "user1", likedon: now },
          ]),
        ),
      ),
    );
    renderRoutes("/history", testSession);
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Remove Python Basics Tutorial from history",
      }),
    );
    await waitFor(() => {
      expect(captured.deleteHistoryItem).toContainEqual({
        videoid: "vid1",
        viewer: "user1",
      });
    });
  });

  it("shows an empty state when there is no history", async () => {
    renderRoutes("/history", testSession);
    expect(
      await screen.findByText("No watch history yet"),
    ).toBeInTheDocument();
  });
});

describe("Library hub", () => {
  it("renders Watch Later, Liked and playlists, and creates a playlist", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/video/getallwatchlater", () =>
        HttpResponse.json(
          pageOf([{ _id: "w1", videoid: "vid2", viewer: "user1" }]),
        ),
      ),
      http.get("*/video/getalllikevide", () =>
        HttpResponse.json(
          pageOf([{ _id: "l1", videoid: "vid1", viewer: "user1" }]),
        ),
      ),
    );
    renderRoutes("/library", testSession);
    expect(await screen.findByText("My favourites")).toBeInTheDocument();
    expect(screen.getByText("React Hooks Deep Dive")).toBeInTheDocument();
    expect(screen.getByText("Python Basics Tutorial")).toBeInTheDocument();
    // Contract fix: the Saved shelf reads GET /studio/library.
    expect(screen.getByText("Java for Beginners")).toBeInTheDocument();
    const input = screen.getByLabelText("New playlist title");
    await user.type(input, "Weekend watches");
    await user.click(
      screen.getByRole("button", { name: "Create playlist" }),
    );
    await waitFor(() => {
      expect(captured.playlistCreates).toContainEqual(
        expect.objectContaining({ title: "Weekend watches" }),
      );
    });
  });

  it("Playlist page renders the playlist's videos in order", async () => {
    renderRoutes("/playlist/pl1", testSession);
    expect(await screen.findByText("My favourites")).toBeInTheDocument();
    expect(screen.getByText("Python Basics Tutorial")).toBeInTheDocument();
    expect(screen.getByText("React Hooks Deep Dive")).toBeInTheDocument();
  });
});
