import { describe, it, expect } from "vitest";
// Download gating (Phase 2c regression): the old guard
// `user === null || undefined` was always falsy, so logged-out users were
// never blocked, and the mutation was called with no video id.
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { captured } from "../mocks/handlers";
import { createPaymentRequest } from "../Api";
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
    await user.click(
      await screen.findByRole("button", { name: /upgrade/i }),
    );
    await waitFor(() => expect(captured.paymentRequests).toHaveLength(1));
    // Phase 3b: an empty body — no amount, no user id, no email.
    expect(captured.paymentRequests[0]).toEqual({});
  });
});

// Premium pricing (₹15 + free window): the mocked catalogue price and
// the free-window / post-cutoff Upgrade states. The premium-status
// mock is overridden per test with fixed booleans — no test depends
// on the real clock.
describe("Premium pricing", () => {
  function mockPremiumStatus(status: {
    isPremium: boolean;
    freeWindowActive: boolean;
  }) {
    server.use(
      http.get("*/download/user/premium-status", () =>
        HttpResponse.json({ success: true, ...status }),
      ),
    );
  }

  function renderDownloadVideo() {
    return renderWithProviders(
      <DownloadVideo video="/videos/python.mp4" videoId="vid1" />,
      { session: testSession },
    );
  }

  it("mocked payment request prices the catalogue at ₹15", async () => {
    const { data } = await createPaymentRequest();
    expect(data.success).toBe(true);
    expect(data.amount).toBe(15);
    expect(data.currency).toBe("INR");
  });

  it("during the free window shows the ₹15 price and still offers Upgrade", async () => {
    mockPremiumStatus({ isPremium: true, freeWindowActive: true });
    const user = userEvent.setup();
    renderDownloadVideo();
    // Effective premium is true for everyone during the window, so
    // the copy — not the Upgrade button's absence — carries the price.
    const line = await screen.findByText(/free until 12 Nov 2027/i);
    expect(line.textContent).toContain("₹15");
    await user.click(screen.getByRole("button", { name: /upgrade/i }));
    await waitFor(() => expect(captured.paymentRequests).toHaveLength(1));
    expect(captured.paymentRequests[0]).toEqual({});
  });

  it("after the cutoff shows Upgrade at ₹15 when not premium", async () => {
    mockPremiumStatus({ isPremium: false, freeWindowActive: false });
    renderDownloadVideo();
    const upgrade = await screen.findByRole("button", {
      name: /upgrade/i,
    });
    expect(upgrade.textContent).toContain("₹15");
    expect(
      screen.queryByText(/free until 12 Nov 2027/i),
    ).toBeNull();
  });

  it("after the cutoff hides Upgrade when premium", async () => {
    mockPremiumStatus({ isPremium: true, freeWindowActive: false });
    renderDownloadVideo();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /upgrade/i }),
      ).toBeNull(),
    );
    expect(
      screen.queryByText(/free until 12 Nov 2027/i),
    ).toBeNull();
  });
});
