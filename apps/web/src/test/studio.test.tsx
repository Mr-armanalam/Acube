// Phase 5 — Creator Studio tests (MSW): guard redirect, Dashboard from
// mocked overview, Content edit/delete/visibility endpoints, Analytics
// chart + empty state, Settings save.
import { describe, it, expect } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import {
  captured,
  fixtureStudioAnalytics,
  fixtureStudioVideoAnalytics,
  fixtureStudioVideos,
} from "../mocks/handlers";
import { renderWithProviders, testSession } from "./testUtils";
import { InternetStatusProvider } from "../utils/internetStatusContext";
import Allroutes from "../Allroutes";

function renderRoutes(route: string, session: typeof testSession | null) {
  return renderWithProviders(
    <InternetStatusProvider>
      <Allroutes
        seteditcreatechanelbtn={() => {}}
      />
    </InternetStatusProvider>,
    { route, session },
  );
}

describe("Studio", () => {
  it("redirects a signed-out user from /studio to Home", async () => {
    renderRoutes("/studio", null);
    expect(
      await screen.findByText("Python Basics Tutorial"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Creator Studio")).not.toBeInTheDocument();
  });

  it("Dashboard renders mocked overview totals, top videos and comments", async () => {
    renderRoutes("/studio", testSession);
    // 5s: the Dashboard render is slow under full-suite parallel load
    // on a 1.5-CPU VM (flaked at the 1s default in the final turbo run;
    // passes standalone in ~2s).
    expect(await screen.findByText("160", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText("Total views")).toBeInTheDocument();
    // Preview (image 9): exactly 4 KPI cards, real watch-time hours.
    expect(screen.getByText("Likes")).toBeInTheDocument();
    expect(screen.getByText("Videos")).toBeInTheDocument();
    expect(screen.getByText("Watch time")).toBeInTheDocument();
    expect(screen.getByText("0.7 hrs")).toBeInTheDocument(); // 42 min
    expect(screen.queryByText("Total comments")).not.toBeInTheDocument();
    expect(screen.queryByText("Completions")).not.toBeInTheDocument();
    expect(screen.getByText("Python Basics Tutorial")).toBeInTheDocument();
    expect(screen.getByText("Great tutorial!")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /Reply to comment/ }).length,
    ).toBeGreaterThan(0);
  });

  it("Content edit (row menu → modal) calls PATCH /video/:id with the new title", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/content", testSession);
    expect(
      await screen.findByText("Python Basics Tutorial"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Row actions for Python Basics Tutorial" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit details" }));
    const input = screen.getByLabelText("Video title");
    await user.clear(input);
    await user.type(input, "Python Basics Updated");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(captured.videoPatches).toContainEqual({
        id: "vid1",
        body: expect.objectContaining({ title: "Python Basics Updated" }),
      });
    });
  });

  it("Content visibility change (row menu → chooser) calls PATCH /video/:id", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/content", testSession);
    expect(
      await screen.findByText("Python Basics Tutorial"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Row actions for Python Basics Tutorial" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Change visibility" }),
    );
    await user.click(screen.getByRole("menuitemradio", { name: "Private" }));
    await waitFor(() => {
      expect(captured.videoPatches).toContainEqual({
        id: "vid1",
        body: { visibility: "private" },
      });
    });
  });

  it("Content delete (row menu, with confirm) calls DELETE /video/:id", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/content", testSession);
    expect(
      await screen.findByText("Python Basics Tutorial"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Row actions for Python Basics Tutorial" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(
      screen.getByRole("menuitem", { name: "Confirm delete" }),
    );
    await waitFor(() => {
      expect(captured.videoDeletes).toContain("vid1");
    });
  });

  it("Content shows a server-side soft-deleted row as Deleted with Restore", async () => {
    const user = userEvent.setup();
    // Phase 5 fix: the row's deletedAt (from GET /studio/videos) —
    // not only an in-session delete — drives the Deleted badge.
    server.use(
      http.get("*/studio/videos", () =>
        HttpResponse.json({
          items: [
            ...fixtureStudioVideos,
            {
              _id: "vid-deleted",
              videotitle: "Retired: Old Trailer",
              videochanel: "ch1",
              filepath: "/videos/old.mp4",
              uploader: "alice",
              Like: 0,
              views: 0,
              createdat: "2026-11-01T00:00:00.000Z",
              visibility: "public",
              deletedAt: "2026-11-10T00:00:00.000Z",
            },
          ],
          page: 1,
          limit: 50,
          total: 5,
          totalPages: 1,
        }),
      ),
    );
    renderRoutes("/studio/content", testSession);
    expect(
      await screen.findByText("Retired: Old Trailer"),
    ).toBeInTheDocument();
    expect(screen.getByText("Deleted")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Row actions for Retired: Old Trailer" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Restore" }),
    ).toBeInTheDocument();
  });

  it("Analytics renders the chart from the mocked series", async () => {
    renderRoutes("/studio/analytics", testSession);
    expect(await screen.findByText("50")).toBeInTheDocument();
    // Preview (image 11): chart + exactly 4 cards, Top source honest.
    expect(screen.getByText("Views (28d)")).toBeInTheDocument();
    expect(screen.getByText("Avg views / video")).toBeInTheDocument();
    expect(screen.getByText("Like rate")).toBeInTheDocument();
    expect(screen.getByText("Top source")).toBeInTheDocument();
    expect(screen.getByText("Not tracked yet")).toBeInTheDocument();
    expect(screen.getByText("Peak · 25 views")).toBeInTheDocument();
    expect(screen.queryByText("Best day")).not.toBeInTheDocument();
    // Text-table fallback carries the same series (screen-reader only).
    const table = screen.getByLabelText("Views — last 28 days data table");
    expect(within(table).getByText("2026-11-01")).toBeInTheDocument();
    expect(within(table).getByText("25")).toBeInTheDocument();
    expect(
      fixtureStudioAnalytics.days.length,
    ).toBeGreaterThan(0);
  });

  it("Analytics with ?video= calls the per-video endpoint and renders its totals/chart", async () => {
    renderRoutes("/studio/analytics?video=vid1", testSession);
    expect(await screen.findByText("Best day")).toBeInTheDocument();
    expect(captured.videoAnalyticsCalls).toContain("vid1");
    // The endpoint's own totals — views, completions, watch time,
    // best day — never the channel cards.
    expect(screen.getByText("Views (28d)")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("Completions")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("Watch time")).toBeInTheDocument();
    expect(screen.getByText("24 min")).toBeInTheDocument();
    expect(screen.getByText("20 views")).toBeInTheDocument();
    expect(screen.getByText("Peak · 20 views")).toBeInTheDocument();
    expect(screen.queryByText("Avg views / video")).not.toBeInTheDocument();
    expect(screen.queryByText("Like rate")).not.toBeInTheDocument();
    expect(screen.queryByText("Top source")).not.toBeInTheDocument();
    // Text-table fallback carries the same per-video series.
    const table = screen.getByLabelText(
      "Views — Python Basics Tutorial · last 28 days data table",
    );
    expect(within(table).getByText("2026-11-01")).toBeInTheDocument();
    expect(within(table).getByText("2026-11-02")).toBeInTheDocument();
    expect(within(table).getByText("20")).toBeInTheDocument();
    expect(
      fixtureStudioVideoAnalytics.days.length,
    ).toBeGreaterThan(0);
  });

  it("Analytics without ?video= never calls the per-video endpoint", async () => {
    renderRoutes("/studio/analytics", testSession);
    expect(await screen.findByText("50")).toBeInTheDocument();
    expect(captured.videoAnalyticsCalls).toEqual([]);
  });

  it("Analytics with ?video= for an unknown video shows the error state, never channel data", async () => {
    renderRoutes("/studio/analytics?video=vid-missing", testSession);
    expect(
      await screen.findByText("Could not load analytics for this video."),
    ).toBeInTheDocument();
    expect(captured.videoAnalyticsCalls).toContain("vid-missing");
    expect(screen.queryByText("Views (28d)")).not.toBeInTheDocument();
    expect(screen.queryByText("Avg views / video")).not.toBeInTheDocument();
    expect(screen.queryByText("Top source")).not.toBeInTheDocument();
  });

  it("Analytics shows the honest empty state when the series is empty", async () => {
    server.use(
      http.get("*/studio/analytics", () =>
        HttpResponse.json({
          range: 28,
          days: [],
          totals: { views: 0, watchMinutes: 0, likes: 0 },
          bestDay: null,
        }),
      ),
    );
    renderRoutes("/studio/analytics", testSession);
    expect(
      await screen.findByText("Analytics start from today"),
    ).toBeInTheDocument();
  });

  it("Settings saves via PATCH /studio/settings", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/settings", testSession);
    const nameInput = await screen.findByLabelText("Channel name");
    // Contract fix: the form is prefilled from channel.name/desc.
    expect(nameInput).toHaveValue("Test User");
    expect(screen.getByLabelText("Description")).toHaveValue("Test channel");
    await user.clear(nameInput);
    await user.type(nameInput, "Renamed Channel");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      expect(captured.studioSettingsPatches).toHaveLength(1);
      const body = captured.studioSettingsPatches[0] as {
        name?: string;
        desc?: string;
        handle?: string;
        links?: Array<{ label: string; url: string }>;
      };
      expect(body.name).toBe("Renamed Channel");
      // Phase 5 fix contract: the field is `desc`, not `description`,
      // and the full shape (handle, links, …) is sent.
      expect(body.desc).toBe("Test channel");
      expect(body).not.toHaveProperty("description");
      expect(body.handle).toBe("testuser");
      expect(body.links).toEqual([
        { label: "GitHub", url: "https://github.com/testuser" },
      ]);
    });
    expect(await screen.findByText("Settings saved")).toBeInTheDocument();
  });

  it("Comments page lists comments on the creator's videos", async () => {
    renderRoutes("/studio/comments", testSession);
    expect(await screen.findByText("Great tutorial!")).toBeInTheDocument();
    expect(screen.getByText("Helpful, thanks!")).toBeInTheDocument();
  });
});
