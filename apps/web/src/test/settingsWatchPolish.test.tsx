// Settings + Watch polish tests (MSW): preview-match Settings (no URL
// inputs, live handle check, banner/avatar upload + remove, links
// chips, locale + upload-default editors, unsaved indicator) and the
// Watch Autoplay toggle (persisted, honoured at video end).
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import {
  captured,
  fixtureNestedComments,
} from "../mocks/handlers";
import { renderWithProviders, testSession } from "./testUtils";
import { InternetStatusProvider } from "../utils/internetStatusContext";
import Allroutes from "../Allroutes";

const AUTOPLAY_KEY = "acube:watch:autoplay";

// jsdom has no URL.createObjectURL — the Settings local preview
// depends on it, so stub it (same convention as uploadWizard.test).
beforeAll(() => {
  Object.defineProperty(URL, "createObjectURL", {
    value: vi.fn(() => "blob:mock-image-url"),
    configurable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: vi.fn(),
    configurable: true,
  });
});

afterAll(() => {
  delete (URL as unknown as Record<string, unknown>).createObjectURL;
  delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
});

function renderRoutes(route: string, session: typeof testSession | null) {
  return renderWithProviders(
    <InternetStatusProvider>
      <Allroutes seteditcreatechanelbtn={() => {}} />
    </InternetStatusProvider>,
    { route, session },
  );
}

async function renderSettings() {
  renderRoutes("/studio/settings", testSession);
  await screen.findByLabelText("Channel name");
}

function pngFile(name = "banner.png", size = 1024) {
  return new File([new Uint8Array(size)], name, { type: "image/png" });
}

describe("Settings polish — preview match", () => {
  it("has no Banner/Profile picture URL inputs any more", async () => {
    await renderSettings();
    expect(screen.queryByLabelText("Banner image URL")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Profile picture URL"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Banner image URL")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Profile picture URL"),
    ).not.toBeInTheDocument();
    // The pickers are still there — change is file-only now.
    expect(screen.getByLabelText("Choose banner image")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Choose profile picture"),
    ).toBeInTheDocument();
  });

  it("handle check: own handle available, taken handle rejected, format error inline", async () => {
    const user = userEvent.setup();
    await renderSettings();
    const handle = screen.getByLabelText("Handle · unique");
    // Own handle (testuser) shows available after the debounce.
    expect(
      await screen.findByText("✓ available", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    // A taken handle: "Checking…" while the debounced request is in
    // flight, then "✗ taken".
    await user.clear(handle);
    await user.type(handle, "taken");
    expect(screen.getByText("Checking…")).toBeInTheDocument();
    expect(
      await screen.findByText("✗ taken", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    // Too short: local format error (the server's exact message and
    // rule — @acube/shared handleFormatRegex), no network check.
    await user.clear(handle);
    await user.type(handle, "ab");
    expect(
      await screen.findByText(
        "handle must be 3–30 characters: letters, digits, dot, underscore or hyphen",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("✗ taken")).not.toBeInTheDocument();
    expect(screen.queryByText("✓ available")).not.toBeInTheDocument();
    // Hyphens are valid under the same server rule — the check fires
    // and the handle shows available.
    await user.clear(handle);
    await user.type(handle, "code-streamer");
    expect(
      await screen.findByText("✓ available", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it("banner upload updates the preview live and remove clears it", async () => {
    await renderSettings();
    const banner = screen.getByRole("img", { name: "Channel banner preview" });
    expect(banner.style.backgroundImage).not.toContain("cdn.example");
    fireEvent.change(screen.getByLabelText("Choose banner image"), {
      target: { files: [pngFile("banner.png")] },
    });
    await waitFor(() => {
      expect(banner.style.backgroundImage).toContain(
        "https://cdn.example/banner.jpg",
      );
    });
    // The upload carries the file under the "file" multipart field
    // (the contract — same as the video upload). The filename itself
    // is not asserted: axios in node rewrites a jsdom File's name to
    // "blob"; a real browser sends the real name.
    expect(captured.studioBannerUploads).toContain("file");
    // Remove clears back to the gradient (no image layer at all).
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    await userEvent.setup().click(removeButtons[0]);
    await waitFor(() => {
      expect(banner.style.backgroundImage).not.toContain("cdn.example");
    });
    expect(captured.studioImageRemoves).toContain("banner");
  });

  it("avatar upload updates the preview live and remove clears it", async () => {
    await renderSettings();
    // Initials until an avatar exists.
    expect(screen.queryByAltText("Profile picture preview")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Choose profile picture"), {
      target: { files: [pngFile("avatar.png")] },
    });
    const img = await screen.findByAltText("Profile picture preview");
    // The local blob preview lands first; the server URL replaces it
    // on upload success.
    await waitFor(() => {
      expect(img.getAttribute("src")).toContain(
        "https://cdn.example/avatar.jpg",
      );
    });
    expect(captured.studioAvatarUploads).toContain("file");
    // The Studio identity header prefers the uploaded avatar over the
    // Google login photo: after the upload (and the overview refetch
    // the hooks trigger) the identity shows the new avatar image.
    await waitFor(() => {
      const identity = document.querySelector(
        ".studio-identity-avatar-img",
      ) as HTMLImageElement | null;
      expect(identity).toBeInTheDocument();
      expect(identity?.getAttribute("src")).toContain(
        "https://cdn.example/avatar.jpg",
      );
    });
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    await userEvent.setup().click(removeButtons[1]);
    await waitFor(() => {
      expect(
        screen.queryByAltText("Profile picture preview"),
      ).not.toBeInTheDocument();
    });
    // Removing the avatar clears the identity header back to initials.
    await waitFor(() => {
      expect(
        document.querySelector(".studio-identity-avatar-img"),
      ).not.toBeInTheDocument();
    });
    expect(captured.studioImageRemoves).toContain("avatar");
  });

  it("rejects a wrong file type and an oversize file before uploading", async () => {
    await renderSettings();
    fireEvent.change(screen.getByLabelText("Choose banner image"), {
      target: {
        files: [new File(["x"], "notes.txt", { type: "text/plain" })],
      },
    });
    expect(
      await screen.findByText("Choose a JPG or PNG image."),
    ).toBeInTheDocument();
    expect(captured.studioBannerUploads).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Choose banner image"), {
      target: { files: [pngFile("big.png", 5 * 1024 * 1024 + 1)] },
    });
    expect(
      await screen.findByText("Image must be 5 MB or smaller."),
    ).toBeInTheDocument();
    expect(captured.studioBannerUploads).toHaveLength(0);
  });

  it("links render as chips with add / edit / remove in the same style", async () => {
    const user = userEvent.setup();
    await renderSettings();
    expect(
      screen.getByRole("button", { name: "GitHub" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "+ Add link" }),
    ).toBeInTheDocument();
    // Edit the saved link in place.
    await user.click(screen.getByRole("button", { name: "GitHub" }));
    const labelInput = screen.getByLabelText("Link 1 label");
    expect(labelInput).toHaveValue("GitHub");
    await user.clear(labelInput);
    await user.type(labelInput, "GitHub profile");
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(
      screen.getByRole("button", { name: "GitHub profile" }),
    ).toBeInTheDocument();
    // Add a second link; remove the first.
    await user.click(screen.getByRole("button", { name: "+ Add link" }));
    expect(screen.getByLabelText("Link 2 label")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Link 2 label"), "Portfolio");
    await user.type(
      screen.getByLabelText("Link 2 URL"),
      "https://example.com",
    );
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(
      screen.getByRole("button", { name: "Portfolio" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove link 1" }));
    expect(
      screen.queryByRole("button", { name: "GitHub profile" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Portfolio" }),
    ).toBeInTheDocument();
  });

  it("country / language show as a display with an edit chooser", async () => {
    const user = userEvent.setup();
    await renderSettings();
    const display = screen.getByRole("button", {
      name: "Edit country and language",
    });
    expect(display).toHaveTextContent("India · English");
    expect(screen.queryByLabelText("Country")).not.toBeInTheDocument();
    await user.click(display);
    expect(screen.getByLabelText("Country")).toBeInTheDocument();
    expect(screen.getByLabelText("Language")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Country"), "Canada");
    await user.selectOptions(screen.getByLabelText("Language"), "French");
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(display).toHaveTextContent("Canada · French");
  });

  it("upload default shows as a summary with an Edit affordance", async () => {
    const user = userEvent.setup();
    await renderSettings();
    expect(
      screen.getByText("New uploads start as Public · comments ON"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Upload default visibility"),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Edit upload default" }),
    );
    const visibility = screen.getByLabelText("Upload default visibility");
    expect(visibility).toHaveValue("public");
    await user.selectOptions(visibility, "private");
    await user.click(
      screen.getByLabelText("Comments ON for new uploads"),
    );
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(
      screen.getByText("New uploads start as Private · comments OFF"),
    ).toBeInTheDocument();
  });

  it("unsaved indicator appears on edit and clears on save and on discard", async () => {
    const user = userEvent.setup();
    await renderSettings();
    const name = screen.getByLabelText("Channel name");
    await user.clear(name);
    await user.type(name, "Renamed");
    expect(
      screen.getByText("● Unsaved changes preview — not yet live"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => {
      expect(
        screen.queryByText("● Unsaved changes preview — not yet live"),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("Channel name")).toHaveValue("Test User");
    await user.clear(name);
    await user.type(name, "Renamed again");
    expect(
      screen.getByText("● Unsaved changes preview — not yet live"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Settings saved")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByText("● Unsaved changes preview — not yet live"),
      ).not.toBeInTheDocument();
    });
  });
});

describe("Watch — Autoplay toggle", () => {
  beforeEach(() => {
    window.localStorage.removeItem(AUTOPLAY_KEY);
  });

  function renderWatch() {
    server.use(
      http.get("*/comment/get", () =>
        HttpResponse.json({
          items: fixtureNestedComments,
          page: 1,
          limit: 50,
          total: fixtureNestedComments.length,
          totalPages: 1,
        }),
      ),
    );
    return renderRoutes("/watch/vid1", testSession);
  }

  it("renders ON by default and persists the toggle in localStorage", async () => {
    const user = userEvent.setup();
    const view = renderWatch();
    expect(
      await screen.findByText("Playlist · My favourites", {}, { timeout: 5000 }),
    ).toBeInTheDocument(); // 5 s: the playlist query can exceed 1 s under full-suite parallel load
    const toggle = screen.getByRole("button", { name: "Autoplay ON" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Autoplay OFF" })).toBeInTheDocument();
    expect(window.localStorage.getItem(AUTOPLAY_KEY)).toBe("false");
    // A fresh mount reads the saved preference back.
    view.unmount();
    renderWatch();
    expect(
      await screen.findByText("Playlist · My favourites", {}, { timeout: 5000 }),
    ).toBeInTheDocument(); // 5 s: the playlist query can exceed 1 s under full-suite parallel load
    expect(
      screen.getByRole("button", { name: "Autoplay OFF" }),
    ).toBeInTheDocument();
  });

  it("ON advances to the next playlist video at video end", async () => {
    renderWatch();
    expect(
      await screen.findByText("Playlist · My favourites", {}, { timeout: 5000 }),
    ).toBeInTheDocument(); // 5 s: the playlist query can exceed 1 s under full-suite parallel load
    expect(screen.getByText(/Playing 1 of 2/)).toBeInTheDocument();
    fireEvent.ended(screen.getByLabelText("Video"));
    expect(
      await screen.findByRole("heading", { name: "React Hooks Deep Dive" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Playing 2 of 2/)).toBeInTheDocument();
  });

  it("OFF stops at video end and leaves Up Next on screen", async () => {
    window.localStorage.setItem(AUTOPLAY_KEY, "false");
    renderWatch();
    expect(
      await screen.findByText("Playlist · My favourites", {}, { timeout: 5000 }),
    ).toBeInTheDocument(); // 5 s: the playlist query can exceed 1 s under full-suite parallel load
    expect(
      screen.getByRole("button", { name: "Autoplay OFF" }),
    ).toBeInTheDocument();
    fireEvent.ended(screen.getByLabelText("Video"));
    // Still on vid1 after the end event settles.
    await waitFor(() => {
      expect(screen.getByText("Up next")).toBeInTheDocument();
    });
    expect(screen.getByText(/Playing 1 of 2/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Python Basics Tutorial" }),
    ).toBeInTheDocument();
  });
});
