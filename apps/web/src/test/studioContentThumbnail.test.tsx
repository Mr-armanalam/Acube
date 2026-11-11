// Edit details modal — local thumbnail upload (MSW).
//
// * The URL input stays AND a file picker is added: small Choose file
//   button + live preview + Remove.
// * Precedence: chosen file > pasted URL > saved thumbnail; a chosen
//   file means the URL is never sent.
// * Validation: JPG/PNG, 5 MB cap (same messages as Settings).
// * Save with a file sends multipart PATCH /video/:id with the file
//   part `thumbnail`; without a file the request stays JSON, as before.
// * A server error is shown verbatim in the modal and the modal stays
//   open.
//
// jsdom has no URL.createObjectURL, so the blob preview URL is stubbed
// here (the component only needs a string to render).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, within, fireEvent, render } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { renderWithProviders, testSession } from "./testUtils";
import { InternetStatusProvider } from "../utils/internetStatusContext";
import Allroutes from "../Allroutes";
import VideoThumb from "../Component/VideoThumb";

function renderContent() {
  return renderWithProviders(
    <InternetStatusProvider>
      <Allroutes seteditcreatechanelbtn={() => {}} />
    </InternetStatusProvider>,
    { route: "/studio/content", session: testSession },
  );
}

async function openEditModal(
  user: ReturnType<typeof userEvent.setup>,
  title = "Python Basics Tutorial",
) {
  renderContent();
  expect(await screen.findByText(title)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: `Row actions for ${title}` }));
  await user.click(screen.getByRole("menuitem", { name: "Edit details" }));
  const dialog = screen.getByRole("dialog", {
    name: `Edit details for ${title}`,
  });
  return dialog;
}

type CapturedPatch = {
  id: string;
  json?: unknown;
  form?: {
    fields: Record<string, string>;
    file?: { name: string; type: string };
  };
};

// axios sends jsdom's FormData, which undici's multipart parser
// rejects — read the raw multipart body and parse the parts by hand
// (same workaround as the banner/avatar handlers in mocks/handlers).
// NOTE: axios-in-node rewrites a jsdom File's name to "blob", so the
// filename is not asserted — a real browser sends the real name; the
// field name (`thumbnail`) and MIME type are the contract.
function parseMultipart(text: string): CapturedPatch["form"] {
  const fields: Record<string, string> = {};
  let file: { name: string; type: string } | undefined;
  const partRe =
    /Content-Disposition: form-data; name="([^"]+)"(?:; filename="([^"]+)")?(?:\r\nContent-Type: ([^\r\n]+))?\r\n\r\n([\s\S]*?)(?=\r\n--)/g;
  let m: RegExpExecArray | null;
  while ((m = partRe.exec(text)) !== null) {
    const [, name, filename, contentType, value] = m;
    if (filename !== undefined) {
      file = { name: filename, type: contentType ?? "" };
    } else {
      fields[name] = value;
    }
  }
  return { fields, file };
}

function usePatchCapture(
  captured: CapturedPatch[],
  status = 200,
  errorBody?: unknown,
) {
  server.use(
    http.patch("*/video/:id", async ({ params, request }) => {
      const contentType = request.headers.get("content-type") ?? "";
      if (contentType.includes("multipart/form-data")) {
        captured.push({
          id: String(params.id),
          form: parseMultipart(await request.text()),
        });
      } else {
        captured.push({ id: String(params.id), json: await request.json() });
      }
      if (status >= 400) {
        return HttpResponse.json(
          errorBody ?? { error: { message: "Bad request" } },
          { status },
        );
      }
      return HttpResponse.json({});
    }),
  );
}

function pngFile(name = "thumb.png", size = 1024) {
  return new File([new Uint8Array(size)], name, { type: "image/png" });
}

describe("VideoThumb broken-state reset", () => {
  it("retries a new src after the previous one failed to load", () => {
    const { rerender, container } = render(
      <VideoThumb src="https://broken.example/old.jpg" />,
    );
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    fireEvent.error(img);
    expect(
      screen.getByLabelText("Video thumbnail unavailable"),
    ).toBeInTheDocument();
    // Same component instance, new src (e.g. a fresh upload replacing
    // a broken placeholder URL): the ▶ placeholder must give way to
    // the new image instead of sticking forever.
    rerender(<VideoThumb src="https://cdn.example/new.jpg" />);
    const next = container.querySelector("img") as HTMLImageElement;
    expect(next).toBeInTheDocument();
    expect(next.getAttribute("src")).toBe("https://cdn.example/new.jpg");
    expect(
      screen.queryByLabelText("Video thumbnail unavailable"),
    ).not.toBeInTheDocument();
  });
});

describe("Edit details thumbnail upload", () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    // jsdom has no URL.createObjectURL — stub only the statics so
    // `new URL(...)` (URL validation) keeps working.
    URL.createObjectURL = vi.fn(() => "blob:mock-thumb") as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it("keeps the URL input and adds a file picker + preview area", async () => {
    const user = userEvent.setup();
    const dialog = await openEditModal(user);
    expect(within(dialog).getByLabelText("Thumbnail URL")).toBeInTheDocument();
    expect(
      within(dialog).getByLabelText("Upload thumbnail image"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("JPG or PNG, 5 MB or smaller. A chosen file replaces the URL above."),
    ).toBeInTheDocument();
    // The fixture video has no saved thumbnail, so no preview yet.
    // (VideoThumb renders <img alt="">, which has no accessible role —
    // query the DOM node directly.)
    expect(dialog.querySelector("img")).toBeNull();
  });

  it("pasting a URL shows a live preview of that URL", async () => {
    const user = userEvent.setup();
    const dialog = await openEditModal(user);
    await user.type(
      within(dialog).getByLabelText("Thumbnail URL"),
      "https://cdn.example/thumb.jpg",
    );
    await waitFor(() => {
      const img = dialog.querySelector("img") as HTMLImageElement | null;
      expect(img).toBeInTheDocument();
      expect(img?.getAttribute("src")).toBe("https://cdn.example/thumb.jpg");
    });
  });

  it("choosing a file previews it and Save sends multipart with the thumbnail part, no URL", async () => {
    const user = userEvent.setup();
    const captured: CapturedPatch[] = [];
    usePatchCapture(captured);
    const dialog = await openEditModal(user);
    await user.type(
      within(dialog).getByLabelText("Thumbnail URL"),
      "https://cdn.example/ignored.jpg",
    );
    fireEvent.change(within(dialog).getByLabelText("Upload thumbnail image"), {
      target: { files: [pngFile("thumb.png", 2048)] },
    });
    expect(
      await within(dialog).findByText(
        "Using thumb.png — the URL above is ignored.",
      ),
    ).toBeInTheDocument();
    const img = dialog.querySelector("img") as HTMLImageElement | null;
    expect(img?.getAttribute("src")).toBe("blob:mock-thumb");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(captured).toHaveLength(1);
    });
    const patch = captured[0];
    expect(patch.id).toBe("vid1");
    // The file part is present with the right MIME type; the filename
    // is "blob" under axios-in-node (see parseMultipart) and is not
    // asserted — the "Using thumb.png" note above proves the component
    // picked the real file.
    expect(patch.form?.file?.type).toBe("image/png");
    expect(patch.form?.file?.name).toBeTruthy();
    // Precedence: the pasted URL is never sent with a chosen file.
    expect(patch.form?.fields).not.toHaveProperty("thumbnailUrl");
    expect(patch.form?.fields.title).toBe("Python Basics Tutorial");
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: "Edit details for Python Basics Tutorial",
        }),
      ).not.toBeInTheDocument();
    });
  });

  it("Remove clears the file and Save falls back to the URL as JSON", async () => {
    const user = userEvent.setup();
    const captured: CapturedPatch[] = [];
    usePatchCapture(captured);
    const dialog = await openEditModal(user);
    await user.type(
      within(dialog).getByLabelText("Thumbnail URL"),
      "https://cdn.example/keep.jpg",
    );
    fireEvent.change(within(dialog).getByLabelText("Upload thumbnail image"), {
      target: { files: [pngFile()] },
    });
    expect(
      await within(dialog).findByText(
        "Using thumb.png — the URL above is ignored.",
      ),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(
      within(dialog).queryByText(/the URL above is ignored/),
    ).not.toBeInTheDocument();
    // Preview falls back to the pasted URL.
    const img = dialog.querySelector("img") as HTMLImageElement | null;
    expect(img?.getAttribute("src")).toBe("https://cdn.example/keep.jpg");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(captured).toHaveLength(1);
    });
    expect(captured[0].form).toBeUndefined();
    expect(captured[0].json).toEqual(
      expect.objectContaining({
        title: "Python Basics Tutorial",
        thumbnailUrl: "https://cdn.example/keep.jpg",
      }),
    );
    expect(captured[0].json).not.toHaveProperty("thumbnail");
  });

  it("rejects a wrong type and an oversize file inline, without uploading", async () => {
    const user = userEvent.setup();
    const captured: CapturedPatch[] = [];
    usePatchCapture(captured);
    const dialog = await openEditModal(user);
    fireEvent.change(within(dialog).getByLabelText("Upload thumbnail image"), {
      target: {
        files: [new File(["x"], "notes.txt", { type: "text/plain" })],
      },
    });
    expect(
      await within(dialog).findByText("Choose a JPG or PNG image."),
    ).toBeInTheDocument();
    expect(captured).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText("Upload thumbnail image"), {
      target: { files: [pngFile("big.png", 5 * 1024 * 1024 + 1)] },
    });
    expect(
      await within(dialog).findByText("Image must be 5 MB or smaller."),
    ).toBeInTheDocument();
    expect(captured).toHaveLength(0);
    // The rejected file is simply not stored: saving still sends the
    // JSON edit, with no file part.
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(captured).toHaveLength(1);
    });
    expect(captured[0].form).toBeUndefined();
  });

  it("a server error is shown verbatim and the modal stays open", async () => {
    const user = userEvent.setup();
    const captured: CapturedPatch[] = [];
    usePatchCapture(captured, 400, {
      error: { message: "Thumbnail must be JPG or PNG, max 5 MB" },
    });
    const dialog = await openEditModal(user);
    fireEvent.change(within(dialog).getByLabelText("Upload thumbnail image"), {
      target: { files: [pngFile()] },
    });
    expect(
      await within(dialog).findByText(
        "Using thumb.png — the URL above is ignored.",
      ),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText(
        "Thumbnail must be JPG or PNG, max 5 MB",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", {
        name: "Edit details for Python Basics Tutorial",
      }),
    ).toBeInTheDocument();
    expect(captured).toHaveLength(1);
  });

  it("no file → JSON PATCH exactly as before, with no thumbnail key", async () => {
    const user = userEvent.setup();
    const captured: CapturedPatch[] = [];
    usePatchCapture(captured);
    const dialog = await openEditModal(user);
    const title = within(dialog).getByLabelText("Video title");
    await user.clear(title);
    await user.type(title, "Python Basics Renamed");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(captured).toHaveLength(1);
    });
    expect(captured[0].form).toBeUndefined();
    expect(captured[0].json).toEqual(
      expect.objectContaining({ title: "Python Basics Renamed" }),
    );
    expect(captured[0].json).not.toHaveProperty("thumbnail");
  });
});
