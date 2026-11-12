import { describe, it, expect } from "vitest";
// Search page (Phase 2c regression): the route is /search/:Searchquery
// and the page must filter by that exact param. Before the fix it read
// `searchquery` (lowercase), which was always undefined.
import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { renderWithProviders } from "./testUtils";
import Search from "../Pages/Search/Search";

// useParams() only resolves inside a matched <Route>, so mount Search
// under the real /search/:Searchquery route.
function renderSearch(query: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/search/:Searchquery" element={<Search />} />
    </Routes>,
    { route: `/search/${query}` },
  );
}

describe("Search page", () => {
  it("filters videos by the :Searchquery route param", async () => {
    renderSearch("Python");
    expect(
      await screen.findByText("Python Basics Tutorial"),
    ).toBeInTheDocument();
    expect(screen.queryByText("React Hooks Deep Dive")).not.toBeInTheDocument();
    expect(screen.queryByText("Java for Beginners")).not.toBeInTheDocument();
  });

  it("matches case-insensitively", async () => {
    renderSearch("react");
    expect(
      await screen.findByText("React Hooks Deep Dive"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Python Basics Tutorial"),
    ).not.toBeInTheDocument();
  });

  it("shows no matching videos for an unknown query", async () => {
    renderSearch("zzz-no-match");
    // The zero-match branch renders an honest empty state (Search.tsx)
    // instead of the grid — wait for that message, with the real query.
    expect(
      await screen.findByText('No results for "zzz-no-match"'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Python Basics Tutorial"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("React Hooks Deep Dive")).not.toBeInTheDocument();
    expect(screen.queryByText("Java for Beginners")).not.toBeInTheDocument();
  });
});
