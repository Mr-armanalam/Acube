// Content cleanup tests (MSW): the preview-clean table — row menu
// open/close, Edit details modal save, Change visibility chooser,
// Delete + restore, deterministic gradient thumbnail, draft dashes,
// bulk bar appearing only while a selection exists, and no per-row
// buttons / dropdown / inline edit anywhere.
import { describe, it, expect } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, within, fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import {
  captured,
  fixtureStudioVideos,
  fixtureVideos,
} from "../mocks/handlers";
import { renderWithProviders, testSession } from "./testUtils";
import { InternetStatusProvider } from "../utils/internetStatusContext";
import Allroutes from "../Allroutes";

function renderContent() {
  return renderWithProviders(
    <InternetStatusProvider>
      <Allroutes seteditcreatechanelbtn={() => {}} />
    </InternetStatusProvider>,
    { route: "/studio/content", session: testSession },
  );
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(
    screen.getByRole("button", { name: `Row actions for ${title}` }),
  );
  expect(
    screen.getByRole("menu", { name: `Actions for ${title}` }),
  ).toBeInTheDocument();
}

describe("Content cleanup", () => {
  it("pencil and ⋯ both open the row menu; Escape and backdrop click close it", async () => {
    const user = userEvent.setup();
    renderContent();
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();

    await openMenu(user, "Python Basics Tutorial");
    expect(
      screen.getByRole("menuitem", { name: "Edit details" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Change visibility" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "View analytics" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Delete" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("menu", { name: "Actions for Python Basics Tutorial" }),
    ).not.toBeInTheDocument();

    // The ⋯ button opens the same menu; a backdrop click closes it.
    await user.click(
      screen.getByRole("button", { name: "More actions for Java for Beginners" }),
    );
    expect(
      screen.getByRole("menu", { name: "Actions for Java for Beginners" }),
    ).toBeInTheDocument();
    fireEvent.click(document.querySelector(".studio-menu-backdrop") as Element);
    expect(
      screen.queryByRole("menu", { name: "Actions for Java for Beginners" }),
    ).not.toBeInTheDocument();
  });

  it("Edit details opens a modal (never inline) and Save calls PATCH /video/:id", async () => {
    const user = userEvent.setup();
    renderContent();
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    await openMenu(user, "Python Basics Tutorial");
    await user.click(screen.getByRole("menuitem", { name: "Edit details" }));

    const dialog = screen.getByRole("dialog", {
      name: "Edit details for Python Basics Tutorial",
    });
    expect(dialog).toBeInTheDocument();
    // No inline inputs inside the table itself.
    const table = screen.getByRole("table");
    expect(
      within(table).queryByLabelText("Video description"),
    ).not.toBeInTheDocument();
    const title = within(dialog).getByLabelText("Video title");
    expect(title).toHaveValue("Python Basics Tutorial");
    await user.clear(title);
    await user.type(title, "Python Basics Renamed");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(captured.videoPatches).toContainEqual({
        id: "vid1",
        body: expect.objectContaining({ title: "Python Basics Renamed" }),
      });
    });
    // The modal closes once the save lands (not before — a failed save
    // stays open with the server's message).
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: "Edit details for Python Basics Tutorial",
        }),
      ).not.toBeInTheDocument();
    });
  });

  it("Edit details blocks an invalid thumbnail URL with an inline error and no PATCH", async () => {
    const user = userEvent.setup();
    renderContent();
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    await openMenu(user, "Python Basics Tutorial");
    await user.click(screen.getByRole("menuitem", { name: "Edit details" }));
    const dialog = screen.getByRole("dialog", {
      name: "Edit details for Python Basics Tutorial",
    });
    const thumbInput = within(dialog).getByLabelText("Thumbnail URL");
    await user.clear(thumbInput);
    await user.type(thumbInput, "not-a-url");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Enter a valid thumbnail URL",
    );
    expect(captured.videoPatches).toHaveLength(0);
    // Still open — the failure is recoverable.
    expect(
      screen.getByRole("dialog", {
        name: "Edit details for Python Basics Tutorial",
      }),
    ).toBeInTheDocument();
  });

  it("Edit details modal closes on Escape, X, and Cancel", async () => {
    const user = userEvent.setup();
    renderContent();
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    await openMenu(user, "Python Basics Tutorial");
    await user.click(screen.getByRole("menuitem", { name: "Edit details" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await openMenu(user, "Python Basics Tutorial");
    await user.click(screen.getByRole("menuitem", { name: "Edit details" }));
    await user.click(screen.getByLabelText("Close edit details"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await openMenu(user, "Python Basics Tutorial");
    await user.click(screen.getByRole("menuitem", { name: "Edit details" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(captured.videoPatches).toHaveLength(0);
  });

  it("Change visibility chooser offers all four states and patches on pick", async () => {
    const user = userEvent.setup();
    renderContent();
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    await openMenu(user, "Python Basics Tutorial");
    await user.click(screen.getByRole("menuitem", { name: "Change visibility" }));
    expect(
      screen.getByRole("menuitemradio", { name: "Public" }),
    ).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("menuitemradio", { name: "Unlisted" }));
    await waitFor(() => {
      expect(captured.videoPatches).toContainEqual({
        id: "vid1",
        body: { visibility: "unlisted" },
      });
    });
    expect(
      screen.queryByRole("menu", { name: "Actions for Python Basics Tutorial" }),
    ).not.toBeInTheDocument();
  });

  it("Delete in the menu confirms, then soft-deletes and offers Restore", async () => {
    const user = userEvent.setup();
    renderContent();
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    await openMenu(user, "Python Basics Tutorial");
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByText("Delete this video?")).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Confirm delete" }));
    await waitFor(() => {
      expect(captured.videoDeletes).toContain("vid1");
    });
    expect(await screen.findByText("Deleted")).toBeInTheDocument();
    await openMenu(user, "Python Basics Tutorial");
    await user.click(screen.getByRole("menuitem", { name: "Restore" }));
    await waitFor(() => {
      expect(captured.videoRestores).toContain("vid1");
    });
  });

  it("View analytics in the menu navigates to /studio/analytics?video=<id> and renders the per-video view", async () => {
    const user = userEvent.setup();
    renderContent();
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    await openMenu(user, "Python Basics Tutorial");
    await user.click(screen.getByRole("menuitem", { name: "View analytics" }));
    // Per-video view: the row's video, its own totals and chart — not
    // the channel cards (no Avg views / video, Like rate, Top source).
    expect(
      await screen.findByRole("heading", { name: "Python Basics Tutorial" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Best day")).toBeInTheDocument();
    expect(screen.getByText("Completions")).toBeInTheDocument();
    expect(screen.getByText("Peak · 20 views")).toBeInTheDocument();
    expect(screen.queryByText("Avg views / video")).not.toBeInTheDocument();
    expect(screen.queryByText("Top source")).not.toBeInTheDocument();
    expect(captured.videoAnalyticsCalls).toContain("vid1");
  });

  it("a video with no thumbnailUrl gets a deterministic gradient ▶ box, never a broken image", async () => {
    renderContent();
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    // None of the fixture videos carry a thumbnail URL.
    const placeholders = screen.getAllByLabelText("Video thumbnail unavailable");
    expect(placeholders.length).toBe(fixtureStudioVideos.length);
    const backgrounds = new Set<string>();
    for (const el of placeholders) {
      expect(el.textContent).toContain("▶");
      const style = el.getAttribute("style") ?? "";
      expect(style).toContain("linear-gradient");
      backgrounds.add(style);
    }
    // Deterministic per video id: different videos get different hues.
    expect(backgrounds.size).toBeGreaterThan(1);
    expect(document.querySelector("img.studio-row-thumb")).toBeNull();
  });

  it("a thumbnail URL that does not resolve falls back to the gradient ▶ box", async () => {
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
    const { container } = renderContent();
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    const img = container.querySelector(
      'img[src="https://example.com/broken-thumb.jpg"]',
    );
    expect(img).not.toBeNull();
    fireEvent.error(img as Element);
    const fallback = screen.getByLabelText("Video thumbnail unavailable");
    expect(fallback.textContent).toContain("▶");
    expect(fallback.getAttribute("style") ?? "").toContain("linear-gradient");
  });

  it("draft rows show — for date, views and likes", async () => {
    renderContent();
    expect(await screen.findByText("Untitled draft — trim 03")).toBeInTheDocument();
    const row = screen
      .getByText("Untitled draft — trim 03")
      .closest("tr") as HTMLElement;
    expect(within(row).getAllByText("—").length).toBe(3);
    expect(within(row).getByText("Draft")).toBeInTheDocument();
  });

  it("the bulk bar appears only while a selection exists", async () => {
    const user = userEvent.setup();
    renderContent();
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Delete \d+ selected/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Select Python Basics Tutorial"));
    expect(
      screen.getByRole("button", { name: "Delete 1 selected" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(
      screen.queryByRole("button", { name: /Delete \d+ selected/ }),
    ).not.toBeInTheDocument();
  });

  it("no per-row buttons, dropdown, or inline edit remain in the table", async () => {
    renderContent();
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(
      within(table).queryByRole("button", { name: "Edit details" }),
    ).not.toBeInTheDocument();
    expect(
      within(table).queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    expect(
      within(table).queryByRole("link", { name: "View analytics" }),
    ).not.toBeInTheDocument();
    expect(within(table).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(table).queryByLabelText("Video title")).not.toBeInTheDocument();
    expect(
      within(table).queryByLabelText("Video description"),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Row actions for / }).length,
    ).toBe(fixtureStudioVideos.length);
  });
});
