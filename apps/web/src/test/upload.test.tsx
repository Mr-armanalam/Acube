// Video upload validation (Phase 2c regression): the limit is 10 MB but
// the old alert claimed "less than 1 kb". Oversize files must be rejected
// with the correct 10 MB message, shown inline — and the modal must close
// on upload success, but NOT on reopen when a previous upload succeeded.
import { vi, describe, it, expect } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { captured } from "../mocks/handlers";
import { createTestStore, renderWithProviders, testSession } from "./testUtils";
import { setUploadProgress } from "../store/slices/uploadSlice";
import Videoupload from "../Pages/Videoupload/Videoupload";

function fileInput(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error("file input not found");
  return input as HTMLInputElement;
}

describe("Video upload", () => {
  it("rejects an oversize file with the correct 10 MB message", async () => {
    const user = userEvent.setup();
    const setPage = vi.fn();
    const { container } = renderWithProviders(
      <Videoupload setvideouploadpage={setPage} />,
      { session: testSession },
    );
    const bigFile = new File([new Uint8Array(10_000_001)], "big.mp4", {
      type: "video/mp4",
    });
    await user.type(
      screen.getByPlaceholderText("Enter title of your video"),
      "Big video",
    );
    await user.upload(fileInput(container), bigFile);
    await user.click(screen.getByDisplayValue("Upload"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /less than 10 MB/i,
    );
    expect(captured.uploads).toHaveLength(0);
    expect(setPage).not.toHaveBeenCalled();
  });

  it("uploads a valid file and closes the modal on success", async () => {
    const user = userEvent.setup();
    const setPage = vi.fn();
    const { container } = renderWithProviders(
      <Videoupload setvideouploadpage={setPage} />,
      { session: testSession },
    );
    const smallFile = new File([new Uint8Array(1024)], "small.mp4", {
      type: "video/mp4",
    });
    await user.type(
      screen.getByPlaceholderText("Enter title of your video"),
      "Small video",
    );
    await user.upload(fileInput(container), smallFile);
    await user.click(screen.getByDisplayValue("Upload"));

    await waitFor(() => expect(captured.uploads).toHaveLength(1));
    expect(captured.uploads[0].title).toBe("Small video");
    // jsdom's XHR serialises the File part with filename "blob" instead
    // of the real name — assert only that a file part was sent.
    expect(captured.uploads[0].fileName).toEqual(expect.any(String));
    await waitFor(() => expect(setPage).toHaveBeenCalledWith(false));
  });

  it("does not close at once when reopened after a previous success", async () => {
    const setPage = vi.fn();
    renderWithProviders(<Videoupload setvideouploadpage={setPage} />, {
      session: testSession,
      upload: { status: "success", progress: 100 },
    });
    // The modal renders and stays open: the stale "success" status from
    // the previous upload must not close this fresh mount.
    expect(
      await screen.findByPlaceholderText("Enter title of your video"),
    ).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(setPage).not.toHaveBeenCalled();
  });

  it("a trailing progress event does not drag success back to uploading", () => {
    const store = createTestStore({
      upload: { status: "success", progress: 100 },
    });
    store.dispatch(setUploadProgress(100));
    expect(store.getState().upload.status).toBe("success");
  });
});
