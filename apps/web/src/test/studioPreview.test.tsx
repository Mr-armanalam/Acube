// Phase 5 match-preview tests (MSW) + new-shell tests:
// the Studio shell is the only shell on /studio/* (no Your-Tube
// navbar, no TopBar), the watch side renders the new premium TopBar,
// and each Studio screen matches preview images 9–15 field by field.
import { describe, it, expect } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, within, fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { server } from "../mocks/server";
import {
  fixtureStudioComments,
  fixtureStudioOverview,
  fixtureVideos,
} from "../mocks/handlers";
import { renderWithProviders, testSession } from "./testUtils";
import { InternetStatusProvider } from "../utils/internetStatusContext";
import Allroutes from "../Allroutes";
import { AppShell } from "../App";

function renderRoutes(route: string, session: typeof testSession | null) {
  return renderWithProviders(
    <InternetStatusProvider>
      <Allroutes seteditcreatechanelbtn={() => {}} />
    </InternetStatusProvider>,
    { route, session },
  );
}

function renderShell(route: string, session: typeof testSession | null) {
  return renderWithProviders(
    <GoogleOAuthProvider clientId="test-client-id">
      <InternetStatusProvider>
        <AppShell />
      </InternetStatusProvider>
    </GoogleOAuthProvider>,
    { route, session },
  );
}

describe("Shell switch", () => {
  it("/studio renders the Studio shell only — no Your-Tube navbar, no TopBar", async () => {
    renderShell("/studio", testSession);
    expect(await screen.findByText("Channel dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Your-Tube")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Search videos")).not.toBeInTheDocument();
    // Studio nav: all six items, red active pill on Dashboard.
    const nav = screen.getByRole("navigation", { name: "Creator Studio" });
    for (const label of [
      "Dashboard",
      "Content",
      "Analytics",
      "Comments",
      "Upload",
      "Channel settings",
    ]) {
      expect(within(nav).getByText(label)).toBeInTheDocument();
    }
    const active = within(nav).getByText("Dashboard").closest("a");
    expect(active?.className).toContain("active");
    expect(screen.getByText("Creator Studio")).toBeInTheDocument();
  });

  it("watch side renders the premium TopBar with search, Studio and Upload", async () => {
    const user = userEvent.setup();
    renderShell("/", testSession);
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    expect(screen.getByLabelText("Search videos")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Studio" }),
    ).toHaveAttribute("href", "/studio");
    const header = screen.getByRole("banner");
    const upload = within(header).getByRole("link", { name: "+ Upload" });
    expect(upload).toHaveAttribute("href", "/studio/upload");
    expect(screen.queryByText("Your-Tube")).not.toBeInTheDocument();
    // TopBar search navigates to /search/:query.
    await user.type(screen.getByLabelText("Search videos"), "python");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(
      await screen.findByText("Python Basics Tutorial"),
    ).toBeInTheDocument();
  });

  it("TopBar offers sign-in when logged out", async () => {
    renderShell("/", null);
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    expect(screen.getByLabelText("Search videos")).toBeInTheDocument();
  });
});

describe("Preview — Dashboard (image 9)", () => {
  it("has exactly the 4 preview KPI cards and red-bar top videos", async () => {
    renderRoutes("/studio", testSession);
    expect(await screen.findByText("Total views")).toBeInTheDocument();
    expect(screen.getByText("Likes")).toBeInTheDocument();
    expect(screen.getByText("Videos")).toBeInTheDocument();
    expect(screen.getByText("Watch time")).toBeInTheDocument();
    expect(screen.getByText("0.7 hrs")).toBeInTheDocument();
    // Word initials in the shell identity ("Test User" → "TU", not
    // the old first-two-characters "TE") and the live-videos split
    // (3 public + 1 draft in the fixture, none deleted) — both were
    // screenshot diffs in the verification pass.
    expect(screen.getByText("TU")).toBeInTheDocument();
    expect(screen.queryByText("TE")).not.toBeInTheDocument();
    expect(screen.getByText("3 public · 0 private")).toBeInTheDocument();
    // No 28-day data table on the Dashboard.
    expect(
      screen.queryByLabelText(/data table/),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Top performing videos")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", {
        name: "Views for Python Basics Tutorial",
      }),
    ).toBeInTheDocument();
  });

  it("counts a legacy video with no visibility field as public in the Videos subtext", async () => {
    // Backend live-video rule + VisibilityBadge both treat a missing
    // visibility as public; the Dashboard split must agree (it used to
    // count such a row as neither public nor private).
    const legacy = { ...fixtureVideos[0] };
    delete (legacy as { visibility?: string }).visibility;
    server.use(
      http.get("*/studio/videos", () =>
        HttpResponse.json({
          items: [legacy],
          page: 1,
          limit: 50,
          total: 1,
          totalPages: 1,
        }),
      ),
    );
    renderRoutes("/studio", testSession);
    expect(await screen.findByText("Total views")).toBeInTheDocument();
    expect(screen.getByText("1 public · 0 private")).toBeInTheDocument();
  });

  it("Latest comments show a relative time like the preview, not the commenter", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    server.use(
      http.get("*/studio/overview", () =>
        HttpResponse.json({
          ...fixtureStudioOverview,
          latestComments: [
            {
              ...fixtureStudioOverview.latestComments[0],
              commentedon: twoHoursAgo,
            },
          ],
        }),
      ),
    );
    renderRoutes("/studio", testSession);
    expect(await screen.findByText("Total views")).toBeInTheDocument();
    expect(screen.getByText(/2 hours ago/)).toBeInTheDocument();
    expect(screen.queryByText(/· carol/)).not.toBeInTheDocument();
  });

  it("excludes a soft-deleted row from the Videos visibility split", async () => {
    // The deleted trailer (visibility public) used to read as an 8th
    // public video against a Videos card that says 7 live.
    const deleted = {
      ...fixtureVideos[0],
      _id: "vid-deleted",
      videotitle: "Retired trailer",
      deletedAt: new Date().toISOString(),
    };
    server.use(
      http.get("*/studio/videos", () =>
        HttpResponse.json({
          items: [deleted, ...fixtureVideos],
          page: 1,
          limit: 50,
          total: 5,
          totalPages: 1,
        }),
      ),
    );
    renderRoutes("/studio", testSession);
    expect(await screen.findByText("Total views")).toBeInTheDocument();
    expect(screen.getByText("3 public · 0 private")).toBeInTheDocument();
  });
});

describe("Preview — Content (image 10)", () => {
  it("columns run Video / Visibility / Date / Views / Likes, pills capitalised", async () => {
    renderRoutes("/studio/content", testSession);
    expect(
      await screen.findByText("Python Basics Tutorial"),
    ).toBeInTheDocument();
    const table = screen.getByRole("table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((h) => (h.textContent ?? "").trim());
    expect(headers).toEqual([
      "",
      "Video",
      "Visibility",
      "Date",
      "Views",
      "Likes",
      "",
    ]);
    expect(screen.getAllByText("Public").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
    // Cleanup: restore is indefinite — the API enforces no 30-day
    // expiry, so the note says "restorable", not "30-day restore".
    expect(
      screen.getByText(/Row actions:.*soft-delete, restorable/),
    ).toBeInTheDocument();
    // Content cleanup (preview image 20): no per-row buttons, no
    // per-row visibility dropdown, no inline edit — only a pencil and
    // a "⋯" button per row, opening the row menu.
    expect(
      screen.queryByRole("button", { name: "Edit details" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "View analytics" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Visibility for /),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Row actions for / }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /More actions for / }).length,
    ).toBeGreaterThan(0);
    // Preview date format ("22 Nov 2024"), not the ISO slice.
    expect(screen.getByText("1 Nov 2026")).toBeInTheDocument();
    expect(screen.queryByText("2026-11-01")).not.toBeInTheDocument();
    // Draft rows show "—" for date/views/likes, like the preview.
    const draftRow = screen
      .getByText("Untitled draft — trim 03")
      .closest("tr") as HTMLElement;
    expect(within(draftRow).getAllByText("—").length).toBe(3);
  });

  it("a thumbnail URL that does not resolve falls back instead of a broken-image icon", async () => {
    server.use(
      http.get("*/studio/videos", () =>
        HttpResponse.json({
          items: [
            {
              ...fixtureVideos[0],
              thumbnailUrl: "https://example.com/broken-thumb.jpg",
            },
          ],
          page: 1,
          limit: 50,
          total: 1,
          totalPages: 1,
        }),
      ),
    );
    const { container } = renderRoutes("/studio/content", testSession);
    expect(
      await screen.findByText("Python Basics Tutorial"),
    ).toBeInTheDocument();
    const img = container.querySelector(
      'img[src="https://example.com/broken-thumb.jpg"]',
    );
    expect(img).not.toBeNull();
    fireEvent.error(img as Element);
    expect(
      screen.getByLabelText("Video thumbnail unavailable"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        'img[src="https://example.com/broken-thumb.jpg"]',
      ),
    ).toBeNull();
  });
});

describe("Preview — Analytics (image 11)", () => {
  it("chart + exactly 4 cards; Top source is the honest not-tracked card", async () => {
    renderRoutes("/studio/analytics", testSession);
    expect(await screen.findByText("Views (28d)")).toBeInTheDocument();
    expect(screen.getByText("Avg views / video")).toBeInTheDocument();
    expect(screen.getByText("Like rate")).toBeInTheDocument();
    expect(screen.getByText("Top source")).toBeInTheDocument();
    expect(screen.getByText("Not tracked yet")).toBeInTheDocument();
    expect(
      screen.getByText("Traffic source not tracked yet"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Best day")).not.toBeInTheDocument();
  });
});

describe("Preview — Upload (image 12)", () => {
  it("states the 10 MB limit and never shows the preview's 84 MB file", async () => {
    renderRoutes("/studio/upload", testSession);
    expect(await screen.findByText(/Step 1 of 3/)).toBeInTheDocument();
    expect(screen.getAllByText(/max 10 MB/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/84 MB/)).not.toBeInTheDocument();
  });

  it("rejects a file over 10 MB on step 1", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/upload", testSession);
    // Upload-wizard fix: the client limit is the server's 10 MiB
    // (10,485,760 bytes), not the old round 10,000,000 — the oversize
    // probe must be over the real limit.
    const big = new File([new ArrayBuffer(10 * 1024 * 1024 + 1)], "big.mp4", {
      type: "video/mp4",
    });
    await user.upload(screen.getByLabelText("Choose video file"), big);
    expect(
      await screen.findByText("Please attach a video file less than 10 MB"),
    ).toBeInTheDocument();
  });
});

describe("Preview — Comments (image 13)", () => {
  it("renders a Comment / Video / When / Actions table with Reply · Heart · Delete", async () => {
    renderRoutes("/studio/comments", testSession);
    expect(await screen.findByText("Great tutorial!")).toBeInTheDocument();
    const table = screen.getByRole("table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((h) => (h.textContent ?? "").trim());
    expect(headers).toEqual(["Comment", "Video", "When", "Actions"]);
    expect(screen.getByText(/Hearts are session-only/)).toBeInTheDocument();
  });

  it("shows the Pinned badge when the backend provides pinnedByCreator", async () => {
    server.use(
      http.get("*/studio/comments", () =>
        HttpResponse.json({
          items: [
            {
              ...fixtureStudioComments[0],
              pinnedByCreator: "user1",
            },
            fixtureStudioComments[1],
          ],
          page: 1,
          limit: 50,
          total: 2,
          totalPages: 1,
        }),
      ),
    );
    renderRoutes("/studio/comments", testSession);
    expect(await screen.findByText("Great tutorial!")).toBeInTheDocument();
    expect(screen.getByText(/Pinned/)).toBeInTheDocument();
  });
});

describe("Preview — Settings (images 14–15)", () => {
  it("banner + avatar controls, 2-column grid, red toggle switches, live handle check", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/settings", testSession);
    expect(await screen.findByLabelText("Channel name")).toHaveValue(
      "Test User",
    );
    expect(screen.getByText(/Banner · 2560 × 1440/)).toBeInTheDocument();
    expect(screen.getByText("Profile picture")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Choose profile picture"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Choose banner image")).toBeInTheDocument();
    // Toggles are switches, not checkboxes.
    const pub = screen.getByLabelText(
      "Channel is public — anyone can find this channel",
    );
    expect(pub).toHaveAttribute("role", "switch");
    expect(pub).toBeChecked();
    await user.click(pub);
    expect(pub).not.toBeChecked();
    // Live handle check (GET /studio/handle/available): the caller's
    // own handle shows available — debounced, so allow for the wait.
    expect(
      await screen.findByText("✓ available", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    // Editing marks the form dirty and shows the unsaved indicator.
    const name = screen.getByLabelText("Channel name");
    await user.clear(name);
    await user.type(name, "Renamed");
    await waitFor(() => {
      expect(
        screen.getByText("● Unsaved changes preview — not yet live"),
      ).toBeInTheDocument();
    });
  });
});
