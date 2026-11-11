// Home page (Phase 2c regression): an empty video list must render an
// empty state — the old code scheduled location.reload() after 5s.
//
// Home + Channel + Account rebuild: the chips row has NO Upload button
// and NO background (the TopBar keeps its own + Upload); categories
// are REAL — derived from the loaded videos' tags, never hardcoded —
// and clicking a chip filters the grid to videos carrying that tag;
// cards match the approved preview (duration badge bottom-right,
// channel avatar left, title, then "Channel · views" with views on
// the right of that line, no upload time).
import { vi, describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { fixtureVideos } from "../mocks/handlers";
import { renderWithProviders } from "./testUtils";
import Home from "../Pages/Home/Home";
import type { Video } from "../types";

describe("Home page", () => {
  it("shows videos when the list is non-empty", async () => {
    renderWithProviders(<Home />);
    expect(
      await screen.findByText("Python Basics Tutorial"),
    ).toBeInTheDocument();
  });

  it("shows an empty state — and never reloads — when the list is empty", async () => {
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    server.use(http.get("*/video/getvideos", () => HttpResponse.json([])));
    renderWithProviders(<Home />);
    expect(await screen.findByText(/No videos yet/i)).toBeInTheDocument();
    // The old code scheduled location.reload() via setTimeout; no timer
    // scheduled during this render may reference a reload.
    const reloadTimers = setTimeoutSpy.mock.calls.filter(([fn]) =>
      String(fn).includes("reload"),
    );
    expect(reloadTimers).toHaveLength(0);
    setTimeoutSpy.mockRestore();
  });

  it("derives category chips from the videos' tags — no hardcoded topics", async () => {
    renderWithProviders(<Home />);
    await screen.findByText("Python Basics Tutorial");
    // Fixture tags: coding, python, learning, react, java.
    for (const tag of ["coding", "python", "learning", "react", "java"]) {
      expect(
        screen.getByRole("button", { name: tag }),
      ).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    // The old hardcoded chips had no video behind them.
    for (const invented of ["Motivation", "Nature", "Music"]) {
      expect(
        screen.queryByRole("button", { name: invented }),
      ).not.toBeInTheDocument();
    }
    // "All" is the active (white) pill on first render.
    expect(screen.getByRole("button", { name: "All" })).toHaveClass("active");
  });

  it("filters the grid by tag when a chip is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />);
    await screen.findByText("Python Basics Tutorial");

    await user.click(screen.getByRole("button", { name: "python" }));
    expect(screen.getByText("Python Basics Tutorial")).toBeInTheDocument();
    expect(
      screen.queryByText("React Hooks Deep Dive"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Java for Beginners")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "java" }));
    expect(
      screen.getByText("Java for Beginners"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Python Basics Tutorial"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All" }));
    expect(
      screen.getByText("Python Basics Tutorial"),
    ).toBeInTheDocument();
    expect(screen.getByText("React Hooks Deep Dive")).toBeInTheDocument();
    expect(screen.getByText("Java for Beginners")).toBeInTheDocument();
  });

  it("has no Upload button in the chips row", async () => {
    renderWithProviders(<Home />);
    await screen.findByText("Python Basics Tutorial");
    expect(screen.queryByText("+ Upload")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /upload/i })).not.toBeInTheDocument();
  });

  it("shows duration badges and Channel · views meta, no upload time", async () => {
    renderWithProviders(<Home />);
    await screen.findByText("Python Basics Tutorial");
    // m:ss from durationSec: 134 -> 2:14, 107 -> 1:47, 182 -> 3:02.
    expect(screen.getByText("2:14")).toBeInTheDocument();
    expect(screen.getByText("1:47")).toBeInTheDocument();
    expect(screen.getByText("3:02")).toBeInTheDocument();
    // Channel name, views on the right of the same line.
    expect(screen.getAllByText("alice")).toHaveLength(2);
    expect(screen.getByText("bob")).toBeInTheDocument();
    expect(screen.getByText("· 100 views")).toBeInTheDocument();
    expect(screen.getByText("· 50 views")).toBeInTheDocument();
    expect(screen.getByText("· 10 views")).toBeInTheDocument();
    // The old card showed "N views • less than a minute ago".
    expect(screen.queryByText(/ago/i)).not.toBeInTheDocument();
  });

  it("shows a video with no tags only under All", async () => {
    const user = userEvent.setup();
    const tagless: Video = {
      _id: "vid-tagless",
      videotitle: "Untagged Wanderings",
      videochanel: "ch9",
      filepath: "/videos/wander.mp4",
      uploader: "carol",
      views: 7,
      createdat: "2026-11-04T00:00:00.000Z",
      tags: [],
      visibility: "public",
      deletedAt: null,
    };
    server.use(
      http.get("*/video/getvideos", () =>
        HttpResponse.json([...fixtureVideos, tagless]),
      ),
    );
    renderWithProviders(<Home />);
    await screen.findByText("Untagged Wanderings");
    // No chip exists for a tag no video carries.
    expect(
      screen.getAllByRole("button", { name: /^(All|coding|python|learning|react|java)$/ }),
    ).toHaveLength(6);

    await user.click(screen.getByRole("button", { name: "coding" }));
    expect(
      screen.queryByText("Untagged Wanderings"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Python Basics Tutorial"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("Untagged Wanderings")).toBeInTheDocument();
  });
});
