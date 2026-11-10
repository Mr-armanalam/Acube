import { describe, it, expect } from "vitest";
// Download gating (Phase 2c regression): the old guard
// `user === null || undefined` was always falsy, so logged-out users were
// never blocked, and the mutation was called with no video id.
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { captured } from "../mocks/handlers";
import { renderWithProviders, testSession } from "./testUtils";
import DownloadVideo from "../Component/DownloadVideo/DownloadVideo";

describe("Download gating", () => {
  it("blocks a logged-out user and records no download", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DownloadVideo video="/videos/python.mp4" videoId="vid1" />,
      { session: null },
    );
    await user.click(screen.getByRole("link"));
    expect(window.alert).toHaveBeenCalledWith(
      "Please login to download videos",
    );
    expect(captured.downloads).toHaveLength(0);
  });

  it("records the download with the video id for a signed-in user", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DownloadVideo video="/videos/python.mp4" videoId="vid1" />,
      { session: testSession },
    );
    await user.click(screen.getByRole("link"));
    await waitFor(() => expect(captured.downloads).toHaveLength(1));
    expect(captured.downloads[0]).toEqual({ videoId: "vid1" });
    expect(window.alert).not.toHaveBeenCalledWith(
      "Please login to download videos",
    );
  });

  it("upgrade sends no amount — the price comes from the server catalogue", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DownloadVideo video="/videos/python.mp4" videoId="vid1" />,
      { session: testSession },
    );
    await user.click(await screen.findByText("Upgrade"));
    await waitFor(() => expect(captured.paymentRequests).toHaveLength(1));
    // Phase 3b: an empty body — no amount, no user id, no email.
    expect(captured.paymentRequests[0]).toEqual({});
  });
});
