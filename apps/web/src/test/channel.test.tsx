// Channel page tests (MSW): rebuilt header (image-26) — banner/avatar,
// name, "@handle · N videos", description "…more" expansion, owner
// "Customize channel" / "Manage videos" links, real Subscribe toggle
// with the subscriber count for non-owners (Watch-page rebuild — the
// old disabled "Coming soon" button is gone), and the Home / Videos /
// Playlists / Posts tabs + channel search.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { captured } from "../mocks/handlers";
import { renderWithProviders, testSession } from "./testUtils";
import { InternetStatusProvider } from "../utils/internetStatusContext";
import Allroutes from "../Allroutes";
import type { Channel, SessionProfile } from "../types";

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

// Fixture channels match the fixture videos' channel ids: vid1 + vid3
// belong to ch1 (Alice), vid2 to ch2 (Bob).
const LONG_DESC =
  "Alice teaches Python, Java and web development with practical projects, live coding sessions, and honest reviews of tools, frameworks, and the occasional keyboard.";
const fixtureChannels: Channel[] = [
  {
    _id: "ch1",
    name: "Alice",
    username: "alice",
    handle: "alicecreates",
    email: "alice@example.com",
    desc: LONG_DESC,
  },
  {
    _id: "ch2",
    name: "Bob",
    username: "bob",
    handle: "bobbuilds",
    email: "bob@example.com",
    desc: "Bob's channel.",
  },
];

const fixtureChannelPlaylists = [
  {
    _id: "pl1",
    owner: "ch1",
    title: "Python series",
    description: "Every Python tutorial in order",
    visibility: "public",
    videoIds: ["vid1", "vid3"],
    createdAt: "2026-11-01T00:00:00.000Z",
  },
];

const ownerSession: SessionProfile = {
  result: {
    _id: "ch1",
    name: "Alice",
    username: "alice",
    email: "alice@example.com",
  },
  token: "test-token",
};

beforeAll(async () => {
  // Channel is React.lazy in Allroutes: warm the chunk once so the
  // first test's findBy* (1 s default timeout) does not race the
  // cold transform behind the Suspense fallback.
  await import("../Pages/Channel/Channel");
});

beforeEach(() => {
  // No MSW handler answers GET /user/getallchannel yet, and the
  // public GET /channel/:id/playlists endpoint is proposed (no
  // backend route) — both are mocked here, scoped to this file.
  server.use(
    http.get("*/user/getallchannel", () =>
      HttpResponse.json(pageOf(fixtureChannels)),
    ),
    http.get("*/channel/:id/playlists", ({ params }) =>
      HttpResponse.json(
        pageOf(
          fixtureChannelPlaylists.filter((p) => p.owner === params.id),
        ),
      ),
    ),
  );
});

describe("Channel header (image-26)", () => {
  it("owner sees name, @handle and the real video count — never a subscriber number, points, or premium pills", async () => {
    renderRoutes("/channel/ch1", ownerSession);
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("@alicecreates · 2 videos")).toBeInTheDocument();
    expect(screen.queryByText(/subscribers/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Points/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Premium/i)).not.toBeInTheDocument();
  });

  it("owner gets Customize channel → /studio/settings and Manage videos → /studio/analytics, not Edit Channel / Upload Video", async () => {
    renderRoutes("/channel/ch1", ownerSession);
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Customize channel" }),
    ).toHaveAttribute("href", "/studio/settings");
    expect(
      screen.getByRole("link", { name: "Manage videos" }),
    ).toHaveAttribute("href", "/studio/analytics");
    expect(
      screen.queryByText(/Edit Channel/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Upload Video/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Subscribe" }),
    ).not.toBeInTheDocument();
  });

  it("non-owner sees a real Subscribe toggle with the subscriber count, and no owner actions", async () => {
    const user = userEvent.setup();
    renderRoutes("/channel/ch1", testSession);
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    // Watch-page rebuild: the disabled "Coming soon" button is gone —
    // Subscribe is a real toggle with the real count.
    const subscribe = screen.getByRole("button", {
      name: "Subscribe to Alice",
    });
    expect(subscribe).toBeEnabled();
    expect(await screen.findByText("42 subscribers")).toBeInTheDocument();
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
    await user.click(subscribe);
    expect(
      await screen.findByRole("button", { name: "Subscribed to Alice" }),
    ).toBeInTheDocument();
    expect(screen.getByText("43 subscribers")).toBeInTheDocument();
    await waitFor(() => {
      expect(captured.subscribeToggles).toContain("ch1");
    });
    expect(
      screen.queryByRole("link", { name: "Customize channel" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Manage videos" }),
    ).not.toBeInTheDocument();
  });

  it("long description truncates with …more and expands on click", async () => {
    const user = userEvent.setup();
    renderRoutes("/channel/ch1", testSession);
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText(LONG_DESC)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "…more" }));
    expect(screen.getByText(LONG_DESC)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.queryByText(LONG_DESC)).not.toBeInTheDocument();
  });
});

describe("Channel tabs", () => {
  it("Home and Videos show the channel's videos", async () => {
    const user = userEvent.setup();
    renderRoutes("/channel/ch1", testSession);
    expect(
      await screen.findByText("Python Basics Tutorial"),
    ).toBeInTheDocument();
    expect(screen.getByText("Java for Beginners")).toBeInTheDocument();
    expect(
      screen.queryByText("React Hooks Deep Dive"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Videos" }));
    expect(
      await screen.findByText("Python Basics Tutorial"),
    ).toBeInTheDocument();
  });

  it("Playlists tab shows the channel's real playlists; Posts tab shows an honest empty state", async () => {
    const user = userEvent.setup();
    renderRoutes("/channel/ch1", testSession);
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Playlists" }));
    const card = await screen.findByRole("link", { name: /Python series/ });
    expect(card).toHaveAttribute("href", "/playlist/pl1");
    expect(screen.getByText("2 videos")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Posts" }));
    expect(await screen.findByText("No posts to show.")).toBeInTheDocument();
    expect(
      screen.getByText("Acube doesn't have community posts yet."),
    ).toBeInTheDocument();
  });

  it("Playlists tab shows an honest empty state when the channel has none", async () => {
    const user = userEvent.setup();
    renderRoutes("/channel/ch2", testSession);
    expect(await screen.findByText("Bob")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Playlists" }));
    expect(await screen.findByText("No playlists yet.")).toBeInTheDocument();
  });

  it("channel search filters the video grid by title", async () => {
    const user = userEvent.setup();
    renderRoutes("/channel/ch1", testSession);
    expect(
      await screen.findByText("Python Basics Tutorial"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Search this channel's videos" }),
    );
    await user.type(
      screen.getByLabelText("Search videos on this channel"),
      "Python",
    );
    expect(
      screen.getByText("Python Basics Tutorial"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Java for Beginners")).not.toBeInTheDocument();
  });

  it("owner still sees real playlists when the public endpoint is down (owner-list fallback)", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/channel/:id/playlists", () =>
        HttpResponse.json({}, { status: 500 }),
      ),
      http.get("*/studio/playlists", () =>
        HttpResponse.json([
          {
            _id: "pl9",
            owner: "ch1",
            title: "Owner playlist",
            description: "",
            visibility: "public",
            videoIds: ["vid1"],
            createdAt: "2026-11-01T00:00:00.000Z",
          },
          {
            _id: "pl10",
            owner: "ch1",
            title: "Hidden private list",
            description: "",
            visibility: "private",
            videoIds: ["vid1"],
            createdAt: "2026-11-01T00:00:00.000Z",
          },
        ]),
      ),
    );
    renderRoutes("/channel/ch1", ownerSession);
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Playlists" }));
    expect(
      await screen.findByText("Owner playlist"),
    ).toBeInTheDocument();
    // A private playlist never appears on the public channel page.
    expect(
      screen.queryByText("Hidden private list"),
    ).not.toBeInTheDocument();
  });
});
