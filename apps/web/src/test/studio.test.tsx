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
} from "../mocks/handlers";
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
    expect(screen.getByText("Python Basics Tutorial")).toBeInTheDocument();
    expect(screen.getByText("Great tutorial!")).toBeInTheDocument();
    expect(screen.getByText("Upload a video")).toBeInTheDocument();
  });

  it("Content edit calls PATCH /video/:id with the new title", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/content", testSession);
    expect(
      await screen.findByText("Python Basics Tutorial"),
    ).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Edit title" })[0]);
    const input = screen.getByLabelText("Video title");
    await user.clear(input);
    await user.type(input, "Python Basics Updated");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(captured.videoPatches).toContainEqual({
        id: "vid1",
        body: { title: "Python Basics Updated" },
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

  it("Analytics renders the chart from the mocked series", async () => {
    renderRoutes("/studio/analytics", testSession);
    expect(await screen.findByText("50")).toBeInTheDocument();
    expect(screen.getByText("Best day")).toBeInTheDocument();
    // Contract fix: bestDay is { date, views }, rendered as one card.
    expect(screen.getByText("2026-11-02 · 25 views")).toBeInTheDocument();
    expect(screen.getAllByText("2026-11-02").length).toBeGreaterThanOrEqual(1);
    // Text-table fallback carries the same series.
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
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => {
      expect(captured.studioSettingsPatches).toHaveLength(1);
      const body = captured.studioSettingsPatches[0] as {
        name?: string;
        desc?: string;
      };
      expect(body.name).toBe("Renamed Channel");
      // Contract fix: the field is `desc`, not `description`.
      expect(body.desc).toBe("Test channel");
      expect(body).not.toHaveProperty("description");
      expect(body).not.toHaveProperty("handle");
      expect(body).not.toHaveProperty("links");
    });
    expect(await screen.findByText("Settings saved")).toBeInTheDocument();
  });

  it("Comments page lists comments on the creator's videos", async () => {
    renderRoutes("/studio/comments", testSession);
    expect(await screen.findByText("Great tutorial!")).toBeInTheDocument();
    expect(screen.getByText("Helpful, thanks!")).toBeInTheDocument();
  });
});
