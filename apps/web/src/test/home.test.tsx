// Home page (Phase 2c regression): an empty video list must render an
// empty state — the old code scheduled location.reload() after 5s.
import { vi, describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { renderWithProviders } from "./testUtils";
import Home from "../Pages/Home/Home";

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
});
