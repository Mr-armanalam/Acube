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
    expect(await screen.findByText("160")).toBeInTheDocument();
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

  it("Content edit calls PATCH /video/:id with the new title", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/content", testSession);
    expect(
      await screen.findByText("Python Basics Tutorial"),
    ).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /Edit details/ })[0]);
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

  it("Content visibility change calls PATCH /video/:id", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/content", testSession);
    expect(
      await screen.findByText("Python Basics Tutorial"),
    ).toBeInTheDocument();
    const select = screen.getByLabelText(
      "Visibility for Python Basics Tutorial",
    );
    await user.selectOptions(select, "private");
    await waitFor(() => {
      expect(captured.videoPatches).toContainEqual({
        id: "vid1",
        body: { visibility: "private" },
      });
    });
  });

  it("Content delete (with confirm) calls DELETE /video/:id", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/content", testSession);
    expect(
      await screen.findByText("Python Basics Tutorial"),
    ).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    await user.click(
      screen.getByRole("button", { name: "Confirm delete" }),
    );
    await waitFor(() => {
      expect(captured.videoDeletes).toContain("vid1");
    });
  });

  it("Content shows a server-side soft-deleted row as Deleted with Restore", async () => {
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
    expect(
      screen.getByRole("button", { name: "Restore" }),
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
