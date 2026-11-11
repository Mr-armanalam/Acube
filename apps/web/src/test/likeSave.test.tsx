import { describe, it, expect } from "vitest";
// Like / save toggles on the video page (Phase 2b Query mutations).
// Phase 3b: liking sends a toggle { action: "like" | "unlike" } —
// never an absolute Like count (the server $inc's the counter).
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { captured, fixtureVideos } from "../mocks/handlers";
import { renderWithProviders, testSession } from "./testUtils";
import Likewatchlatersavebtns from "../Pages/Videopage/Likewatchlatersavebtns";
import SaveMenu from "../Pages/Watch/SaveMenu";

function renderButtons() {
  return renderWithProviders(
    <Likewatchlatersavebtns vv={fixtureVideos[0]} vid="vid1" />,
    { session: testSession },
  );
}

describe("Like / save buttons", () => {
  it("likes a video: Like count +1 and a liked entry is added", async () => {
    const user = userEvent.setup();
    renderButtons();
    await user.click(await screen.findByText("5"));

    await waitFor(() => expect(captured.likeVideo).toHaveLength(1));
    expect(captured.likeVideo[0]).toEqual({ id: "vid1", body: { action: "like" } });
    expect(captured.addLiked).toEqual([{ videoid: "vid1", viewer: "user1" }]);
  });

  it("unlikes on a second click: Like count -1 and the entry is removed", async () => {
    const user = userEvent.setup();
    renderButtons();
    await user.click(await screen.findByText("5"));
    await waitFor(() => expect(captured.likeVideo).toHaveLength(1));
    await user.click(screen.getByText("5"));

    await waitFor(() => expect(captured.likeVideo).toHaveLength(2));
    expect(captured.likeVideo[1]).toEqual({ id: "vid1", body: { action: "unlike" } });
    expect(captured.deleteLiked).toEqual([
      { videoid: "vid1", viewer: "user1" },
    ]);
  });

  // Phase 5 fix (verify): Watch Later moved out of the legacy action
  // bar into the Watch page's Save menu — the page had two "Save"
  // controls and a dead Share icon. The toggle itself is unchanged
  // (same legacy watch-later endpoint), only its home moved.
  it("saves and unsaves a video via watch-later from the Save menu", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SaveMenu videoid="vid1" />, {
      session: testSession,
    });
    await user.click(
      screen.getByRole("button", { name: "+ Save · Watch Later" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Watch later" }),
    );
    await waitFor(() => expect(captured.addWatchLater).toHaveLength(1));
    expect(captured.addWatchLater[0]).toEqual({
      videoid: "vid1",
      viewer: "user1",
    });

    await user.click(
      await screen.findByRole("button", { name: "✓ Watch later" }),
    );
    await waitFor(() => expect(captured.deleteWatchLater).toHaveLength(1));
    expect(captured.deleteWatchLater[0]).toEqual({
      videoid: "vid1",
      viewer: "user1",
    });
  });

  it("blocks liking when logged out", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Likewatchlatersavebtns vv={fixtureVideos[0]} vid="vid1" />,
      { session: null },
    );
    await user.click(await screen.findByText("5"));
    expect(window.alert).toHaveBeenCalledWith("please login to like video");
    expect(captured.likeVideo).toHaveLength(0);
  });
});
