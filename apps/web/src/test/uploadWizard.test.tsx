// Upload-wizard fix tests (MSW + real route /studio/upload):
// the Step 1 modal, drag-and-drop, client-side mp4/size rejection,
// thumbnail-URL validation before any request, the real 3-step flow
// with a <video> preview, and the SERVER's error message surfacing.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { captured } from "../mocks/handlers";
import { renderWithProviders, testSession } from "./testUtils";
import { InternetStatusProvider } from "../utils/internetStatusContext";
import Allroutes from "../Allroutes";
import { MAX_VIDEO_BYTES } from "../utils/uploadLimits";

// Frame extraction needs real media decoding (jsdom has none), so the
// picker tests stub it with three small data-URL frames; everything
// else in the module (validateImageFile, precedence) stays real.
vi.mock("../utils/thumbnail", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../utils/thumbnail")>();
  return {
    ...orig,
    extractVideoFrames: vi.fn(() =>
      Promise.resolve([
        "data:image/jpeg;base64,AAA",
        "data:image/jpeg;base64,BBB",
        "data:image/jpeg;base64,CCC",
      ]),
    ),
  };
});

const createObjectURLMock = vi.fn(() => "blob:mock-video-url");
const revokeObjectURLMock = vi.fn();

beforeAll(() => {
  // jsdom has no URL.createObjectURL — the wizard's preview depends
  // on it, so stub it and assert the <video> gets the object URL.
  Object.defineProperty(URL, "createObjectURL", {
    value: createObjectURLMock,
    configurable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: revokeObjectURLMock,
    configurable: true,
  });
});

afterAll(() => {
  delete (URL as unknown as Record<string, unknown>).createObjectURL;
  delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
});

afterEach(() => {
  createObjectURLMock.mockClear();
  revokeObjectURLMock.mockClear();
});

function renderWizard() {
  return renderWithProviders(
    <InternetStatusProvider>
      <Allroutes seteditcreatechanelbtn={() => {}} />
    </InternetStatusProvider>,
    { route: "/studio/upload", session: testSession },
  );
}

function mp4File(name = "demo.mp4", size = 52_000): File {
  return new File([new ArrayBuffer(size)], name, { type: "video/mp4" });
}

async function pickFileViaInput(file: File) {
  const input = screen.getByLabelText("Choose video file");
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByLabelText(`Preview of ${file.name}`);
}

async function goToStep2(file: File = mp4File()) {
  renderWizard();
  await screen.findByText("Drag and drop video files to upload");
  await pickFileViaInput(file);
  await userEvent.click(
    screen.getByRole("button", { name: "Continue to details" }),
  );
  await screen.findByText(/Step 2 of 3/);
}

async function goToStep3() {
  await goToStep2();
  await userEvent.type(screen.getByLabelText("Title"), "How I plan my week");
  await userEvent.type(
    screen.getByLabelText("Description"),
    "My Sunday routine",
  );
  await userEvent.type(screen.getByLabelText("Tags"), "planning, routine");
  await userEvent.click(
    screen.getByRole("button", { name: "Continue to review" }),
  );
  await screen.findByText(/Step 3 of 3/);
}

describe("Upload wizard — Step 1 modal", () => {
  it("renders the YouTube-Studio-style modal: title, drag text, Select files", async () => {
    renderWizard();
    expect(
      await screen.findByRole("dialog", { name: "Upload videos" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Drag and drop video files to upload"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Select files" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 3 — File · mp4, max 10 MB")).toBeInTheDocument();
    // No false copy anywhere on the page.
    expect(screen.queryByText(/resumable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/continues in background/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/84 MB/)).not.toBeInTheDocument();
  });

  it("drag-and-drop selects the file and shows a real <video> preview", async () => {
    renderWizard();
    const dropzone = await screen.findByTestId("upload-dropzone");
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [mp4File()] },
    });
    const preview = await screen.findByLabelText("Preview of demo.mp4");
    expect(preview.tagName).toBe("VIDEO");
    expect(preview).toHaveAttribute("src", "blob:mock-video-url");
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/demo\.mp4/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Continue to details" }),
    );
    expect(await screen.findByText(/Step 2 of 3/)).toBeInTheDocument();
  });

  it("drag-and-drop rejects a non-mp4 file with an inline error", async () => {
    renderWizard();
    const dropzone = await screen.findByTestId("upload-dropzone");
    const textFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    fireEvent.drop(dropzone, { dataTransfer: { files: [textFile] } });
    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Only mp4 video files are supported");
    expect(screen.queryByLabelText(/Preview of/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue to details" }),
    ).not.toBeInTheDocument();
  });

  it("rejects an oversize file with an inline error (limit is the server's 10 MiB)", async () => {
    renderWizard();
    await screen.findByText("Drag and drop video files to upload");
    const big = mp4File("big.mp4", MAX_VIDEO_BYTES + 1);
    const input = screen.getByLabelText("Choose video file");
    fireEvent.change(input, { target: { files: [big] } });
    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Please attach a video file less than 10 MB");
    expect(screen.queryByLabelText(/Preview of/)).not.toBeInTheDocument();
  });

  it("accepts a file just under the server limit (10,485,760 bytes)", async () => {
    renderWizard();
    await screen.findByText("Drag and drop video files to upload");
    // Just under the limit: 10,485,760 - 1 bytes. The old client limit
    // (10,000,000) would have rejected this file; the server accepts it.
    await pickFileViaInput(mp4File("edge.mp4", MAX_VIDEO_BYTES - 1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("X closes the modal and leaves the upload page", async () => {
    renderWizard();
    await screen.findByRole("dialog", { name: "Upload videos" });
    await userEvent.click(screen.getByRole("button", { name: "Close upload" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Upload videos" }),
      ).not.toBeInTheDocument();
    });
  });
});

describe("Upload wizard — Steps 2 and 3", () => {
  it("Step 2 shows a frame of the picked video, not the orange placeholder", async () => {
    await goToStep2();
    const frame = screen.getByLabelText("Preview of the picked video");
    expect(frame.tagName).toBe("VIDEO");
    expect(frame).toHaveAttribute("src", "blob:mock-video-url");
  });

  it("an invalid thumbnail URL is blocked client-side with no request sent", async () => {
    await goToStep2();
    await userEvent.type(screen.getByLabelText("Title"), "Bad thumb");
    await userEvent.type(screen.getByLabelText("Thumbnail URL"), "not-a-url");
    await userEvent.click(
      screen.getByRole("button", { name: "Continue to review" }),
    );
    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Enter a valid thumbnail URL");
    // Still on Step 2, and nothing was posted.
    expect(screen.getByText(/Step 2 of 3/)).toBeInTheDocument();
    expect(captured.uploads).toHaveLength(0);
  });

  it("Step 3 review shows the entered details and the video preview", async () => {
    await goToStep3();
    expect(screen.getByText("How I plan my week")).toBeInTheDocument();
    expect(screen.getByText("My Sunday routine")).toBeInTheDocument();
    expect(screen.getByText("planning, routine")).toBeInTheDocument();
    expect(screen.getByText("Public")).toBeInTheDocument();
    const preview = screen.getByLabelText("Preview of demo.mp4");
    expect(preview.tagName).toBe("VIDEO");
    expect(preview).toHaveAttribute("src", "blob:mock-video-url");
  });

  it("Publish posts once and shows the done screen with a Watch link", async () => {
    await goToStep3();
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Your video was uploaded.")).toBeInTheDocument();
    expect(captured.uploads).toHaveLength(1);
    expect(captured.uploads[0].title).toBe("How I plan my week");
    expect(captured.uploads[0].description).toBe("My Sunday routine");
    expect(captured.uploads[0].tags).toBe("planning, routine");
    expect(captured.uploads[0].visibility).toBe("public");
    const watch = screen.getByRole("link", { name: "Watch video" });
    expect(watch).toHaveAttribute("href", "/watch/vid-uploaded");
    expect(
      screen.getByRole("link", { name: "View in Content" }),
    ).toHaveAttribute("href", "/studio/content");
  });

  it("Save as draft posts with visibility=draft", async () => {
    await goToStep3();
    await userEvent.click(screen.getByRole("button", { name: "Save as draft" }));
    expect(await screen.findByText("Your video was uploaded.")).toBeInTheDocument();
    expect(captured.uploads).toHaveLength(1);
    expect(captured.uploads[0].visibility).toBe("draft");
  });

  it("surfaces the SERVER's error message, not axios's generic text", async () => {
    server.use(
      http.post("*/video/uploadvideo", () =>
        HttpResponse.json(
          { message: "Failed to upload video to cloudinary" },
          { status: 400 },
        ),
      ),
    );
    await goToStep3();
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Failed to upload video to cloudinary");
    expect(alert).not.toHaveTextContent("Request failed with status code 400");
    // Still on the review step — the failure is recoverable.
    expect(screen.getByText(/Step 3 of 3/)).toBeInTheDocument();
  });

  it("surfaces VALIDATION_ERROR field details from the server", async () => {
    server.use(
      http.post("*/video/uploadvideo", () =>
        HttpResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid request body",
              details: [{ path: "thumbnailUrl", message: "must be a valid URL" }],
            },
          },
          { status: 400 },
        ),
      ),
    );
    await goToStep3();
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("thumbnailUrl: must be a valid URL");
    expect(alert).not.toHaveTextContent("Request failed with status code 400");
  });
});

describe("Upload wizard — thumbnail field (file + URL + auto frames)", () => {
  function imageFile(name: string, size: number, type: string): File {
    return new File([new ArrayBuffer(size)], name, { type });
  }

  async function goToReviewWithTitle() {
    await userEvent.type(screen.getByLabelText("Title"), "Thumb test video");
    await userEvent.click(
      screen.getByRole("button", { name: "Continue to review" }),
    );
    await screen.findByText(/Step 3 of 3/);
  }

  it("rejects a wrong-type thumbnail image and an oversize one, inline", async () => {
    await goToStep2();
    const input = screen.getByLabelText("Upload thumbnail image");
    fireEvent.change(input, {
      target: { files: [imageFile("thumb.gif", 1024, "image/gif")] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a JPG or PNG image.",
    );
    fireEvent.change(input, {
      target: {
        files: [imageFile("big.png", 5 * 1024 * 1024 + 1, "image/png")],
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Image must be 5 MB or smaller.",
    );
    expect(
      screen.queryByAltText("Preview of the chosen thumbnail image"),
    ).not.toBeInTheDocument();
  });

  it("a valid thumbnail image shows a live preview", async () => {
    await goToStep2();
    const input = screen.getByLabelText("Upload thumbnail image");
    fireEvent.change(input, {
      target: { files: [imageFile("thumb.png", 2048, "image/png")] },
    });
    const preview = await screen.findByAltText(
      "Preview of the chosen thumbnail image",
    );
    expect(preview).toHaveAttribute("src", "blob:mock-video-url");
    expect(screen.getByText(/thumb\.png/)).toBeInTheDocument();
  });

  it("a chosen file wins over the pasted URL on publish", async () => {
    await goToStep2();
    await userEvent.type(
      screen.getByLabelText("Thumbnail URL"),
      "https://example.com/thumb.jpg",
    );
    fireEvent.change(screen.getByLabelText("Upload thumbnail image"), {
      target: { files: [imageFile("thumb.png", 2048, "image/png")] },
    });
    await goToReviewWithTitle();
    expect(screen.getByText("Image file: thumb.png")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Your video was uploaded.")).toBeInTheDocument();
    expect(captured.uploads).toHaveLength(1);
    expect(captured.uploads[0].hasThumbnailFile).toBe(true);
    expect(captured.uploads[0].thumbnailFileType).toBe("image/png");
    expect(captured.uploads[0].thumbnailUrl).toBeNull();
  });

  it("a pasted URL still works when no file is chosen", async () => {
    await goToStep2();
    await userEvent.type(
      screen.getByLabelText("Thumbnail URL"),
      "https://example.com/thumb.jpg",
    );
    await goToReviewWithTitle();
    expect(screen.getByText("https://example.com/thumb.jpg")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Your video was uploaded.")).toBeInTheDocument();
    expect(captured.uploads).toHaveLength(1);
    expect(captured.uploads[0].thumbnailUrl).toBe("https://example.com/thumb.jpg");
    expect(captured.uploads[0].hasThumbnailFile).toBe(false);
  });

  it("frame picker: middle frame is Suggested; clicking one selects it and publish sends it as the thumbnail file", async () => {
    await goToStep2();
    const frame1 = await screen.findByRole("button", {
      name: "Use auto-generated frame 1",
    });
    expect(
      screen.getByRole("button", { name: "Use auto-generated frame 2" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Use auto-generated frame 3" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Suggested")).toBeInTheDocument();
    // Nothing chosen yet: no frame is pressed.
    expect(frame1).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(frame1);
    expect(frame1).toHaveAttribute("aria-pressed", "true");
    expect(
      await screen.findByAltText("Preview of auto-generated thumbnail frame 1"),
    ).toBeInTheDocument();
    await goToReviewWithTitle();
    expect(screen.getByText("Auto-generated frame 1 of 3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Your video was uploaded.")).toBeInTheDocument();
    expect(captured.uploads).toHaveLength(1);
    expect(captured.uploads[0].hasThumbnailFile).toBe(true);
    expect(captured.uploads[0].thumbnailFileType).toBe("image/jpeg");
    expect(captured.uploads[0].thumbnailUrl).toBeNull();
  });

  it("with nothing chosen the review says server-generated and no thumbnail part is sent (auto-default)", async () => {
    await goToStep3();
    expect(screen.getByText("Auto-generated by the server")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Your video was uploaded.")).toBeInTheDocument();
    expect(captured.uploads).toHaveLength(1);
    expect(captured.uploads[0].hasThumbnailFile).toBe(false);
    expect(captured.uploads[0].thumbnailFileType).toBeNull();
    expect(captured.uploads[0].thumbnailUrl).toBeNull();
  });

  it("surfaces a server 400 for a bad thumbnail verbatim", async () => {
    server.use(
      http.post("*/video/uploadvideo", () =>
        HttpResponse.json(
          { message: "Thumbnail URL is unreachable" },
          { status: 400 },
        ),
      ),
    );
    await goToStep2();
    await userEvent.type(
      screen.getByLabelText("Thumbnail URL"),
      "https://example.com/thumb.jpg",
    );
    await goToReviewWithTitle();
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Thumbnail URL is unreachable");
    expect(alert).not.toHaveTextContent("Request failed with status code 400");
  });

  it("a done screen shows the thumbnail the server stored", async () => {
    server.use(
      http.post("*/video/uploadvideo", () =>
        HttpResponse.json({
          message: "File uploaded successfully",
          video: {
            id: "vid-uploaded",
            videotitle: "Thumb test video",
            visibility: "public",
            description: "",
            tags: [],
            thumbnailUrl: "https://cdn.example.com/frames/frame-2.jpg",
            autoThumbnails: [
              "https://cdn.example.com/frames/frame-1.jpg",
              "https://cdn.example.com/frames/frame-2.jpg",
            ],
          },
        }),
      ),
    );
    await goToStep3();
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Your video was uploaded.")).toBeInTheDocument();
    const thumb = document.querySelector(".acube-empty img");
    expect(thumb?.getAttribute("src")).toBe(
      "https://cdn.example.com/frames/frame-2.jpg",
    );
  });
});
