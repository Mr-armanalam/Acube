// Account menu + History / Library preview-match tests (MSW): the
// TopBar avatar menu entries and their targets, the shared account
// pill nav (active pill + Subscriptions honest empty state), History
// resume positions / progress / footer note, and the Library hub card
// grid + playlist create entry points.
import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { captured, fixtureVideos } from "../mocks/handlers";
import { renderWithProviders, testSession } from "./testUtils";
import { InternetStatusProvider } from "../utils/internetStatusContext";
import Allroutes from "../Allroutes";
import TopBar from "../Component/TopBar/TopBar";

vi.mock("@react-oauth/google", () => ({
  GoogleLogin: () => null,
  googleLogout: vi.fn(),
}));

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

describe("TopBar account menu", () => {
  it("lists Your account above Your channel, and Create channel opens the Create/Edit-channel modal", async () => {
    const user = userEvent.setup();
    const seteditcreatechanelbtn = vi.fn();
    renderWithProviders(
      <TopBar seteditcreatechanelbtn={seteditcreatechanelbtn} />,
      {
        route: "/",
        session: testSession,
      },
    );
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    const account = screen.getByRole("link", { name: "Your account" });
    const channel = screen.getByRole("link", { name: "Your channel" });
    const create = screen.getByRole("button", { name: "Create channel" });
    expect(account).toHaveAttribute("href", "/library");
    expect(channel).toHaveAttribute("href", "/channel/user1");
    // Channel creation lives in the legacy Create/Edit-channel modal
    // (it PATCHes the channel); the menu opens it, it does not route.
    // (Sign out is asserted before the click: clicking Create channel
    // closes the menu.)
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    await user.click(create);
    expect(seteditcreatechanelbtn).toHaveBeenCalledTimes(1);
    expect(seteditcreatechanelbtn).toHaveBeenCalledWith(true);
    expect(
      Boolean(
        account.compareDocumentPosition(channel) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  });
});

describe("Account pill nav", () => {
  it("marks History active on /history and links Subscriptions to the honest empty state", async () => {
    const user = userEvent.setup();
    renderRoutes("/history", testSession);
    expect(await screen.findByText("No watch history yet")).toBeInTheDocument();
    const historyPill = screen.getByRole("link", { name: "History" });
    expect(historyPill).toHaveAttribute("aria-current", "page");
    const subsPill = screen.getByRole("link", { name: "Subscriptions" });
    expect(subsPill).toHaveAttribute("href", "/library?view=subscriptions");
    await user.click(subsPill);
    expect(await screen.findByText("No subscriptions yet")).toBeInTheDocument();
    expect(
      screen.getByText(/doesn't have a follow system yet/),
    ).toBeInTheDocument();
  });

  it("marks Library active on /library and points Watch Later / Liked at the hub anchors", async () => {
    renderRoutes("/library", testSession);
    expect(await screen.findByText("Your library")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Watch Later" })).toHaveAttribute(
      "href",
      "/library#watch-later",
    );
    expect(screen.getByRole("link", { name: "Liked" })).toHaveAttribute(
      "href",
      "/library#liked",
    );
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});

describe("History page (preview screen I)", () => {
  it("shows Resume from the stored position with a progress bar, and the footer note", async () => {
    server.use(
      http.get("*/video/getallhistory", () =>
        HttpResponse.json(
          pageOf([
            {
              _id: "h1",
              videoid: "vid1",
              viewer: "user1",
              likedon: new Date().toISOString(),
              progressSec: 84,
            },
          ]),
        ),
      ),
    );
    renderRoutes("/history", testSession);
    expect(await screen.findByText("Resume from 1:24 ▶")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", {
        name: "Watch progress for Python Basics Tutorial",
      }),
    ).toHaveAttribute("aria-valuenow", "63");
    expect(screen.getByText(/Watched 1:24 of 2:14/)).toBeInTheDocument();
    expect(
      screen.getByText(/Progress bars come from the same view events/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Remove Python Basics Tutorial from history",
      }),
    ).toHaveTextContent("✕ Remove");
  });

  it("falls back to the gradient + initial when a thumbnail URL does not resolve", async () => {
    // The seeded demo thumbnails are example.com placeholders that
    // never resolve — the row must show the gradient (preview image-28),
    // never the browser's broken-image icon.
    server.use(
      http.get("*/video/getvideos", () =>
        HttpResponse.json(
          pageOf([
            {
              ...fixtureVideos[0],
              thumbnailUrl: "https://example.com/demo-thumb-broken.jpg",
            },
          ]),
        ),
      ),
      http.get("*/video/getallhistory", () =>
        HttpResponse.json(
          pageOf([
            {
              _id: "h1",
              videoid: "vid1",
              viewer: "user1",
              likedon: new Date().toISOString(),
              progressSec: 84,
            },
          ]),
        ),
      ),
    );
    renderRoutes("/history", testSession);
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    const img = document.querySelector(".history-thumb-img");
    expect(img).toBeInTheDocument();
    fireEvent.error(img as Element);
    expect(document.querySelector(".history-thumb-img")).not.toBeInTheDocument();
    expect(document.querySelector(".history-thumb-initial")).toHaveTextContent("P");
  });
});

describe("Library hub (preview screen J)", () => {
  it("renders Watch Later cards with a saved date, the Liked privacy note, and focuses the create form from + New playlist", async () => {
    const user = userEvent.setup();
    const now = new Date().toISOString();
    server.use(
      http.get("*/video/getallwatchlater", () =>
        HttpResponse.json(
          pageOf([{ _id: "w1", videoid: "vid2", viewer: "user1", likedon: now }]),
        ),
      ),
      http.get("*/video/getalllikevide", () =>
        HttpResponse.json(
          pageOf([{ _id: "l1", videoid: "vid1", viewer: "user1" }]),
        ),
      ),
    );
    renderRoutes("/library", testSession);
    expect(await screen.findByText("React Hooks Deep Dive")).toBeInTheDocument();
    expect(screen.getByText("bob · Saved today")).toBeInTheDocument();
    expect(screen.getByText("Python Basics Tutorial")).toBeInTheDocument();
    expect(
      screen.getByText("Liked videos are private by default"),
    ).toBeInTheDocument();
    expect(screen.getByText("My favourites")).toBeInTheDocument();
    expect(screen.getByText("Saved playlist example")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "+ New playlist" }));
    expect(document.activeElement).toBe(
      screen.getByLabelText("New playlist title"),
    );
  });

  it("creates a playlist with the chosen visibility from the hub form", async () => {
    const user = userEvent.setup();
    renderRoutes("/library", testSession);
    const input = await screen.findByLabelText("New playlist title");
    await user.type(input, "Focus list");
    await user.selectOptions(
      screen.getByLabelText("New playlist visibility"),
      "public",
    );
    await user.click(screen.getByRole("button", { name: "Create playlist" }));
    await waitFor(() => {
      expect(captured.playlistCreates).toContainEqual(
        expect.objectContaining({ title: "Focus list", visibility: "public" }),
      );
    });
  });

  it("falls back to the gradient + initial when a Saved thumbnail URL does not resolve", async () => {
    // Same rule as History: the seeded demo thumbnails are example.com
    // placeholders that never resolve (preview image-29 shows clean
    // gradient thumbs, never a broken-image icon).
    server.use(
      http.get("*/studio/library", () =>
        HttpResponse.json({
          watchlater: [],
          saved: [
            {
              ...fixtureVideos[2],
              thumbnailUrl: "https://example.com/demo-thumb-broken.jpg",
            },
          ],
          liked: [],
          playlists: [],
        }),
      ),
    );
    renderRoutes("/library", testSession);
    expect(await screen.findByText("Java for Beginners")).toBeInTheDocument();
    const img = document.querySelector(".library-card-thumb-img");
    expect(img).toBeInTheDocument();
    fireEvent.error(img as Element);
    expect(
      document.querySelector(".library-card-thumb-img"),
    ).not.toBeInTheDocument();
    expect(document.querySelector(".library-card-initial")).toHaveTextContent(
      "J",
    );
  });
});
