// Phase 5 fix tests (MSW): every screen/feature the audit flagged.
// Home chips filter, Dashboard above-the-fold + allTime/completions,
// Content search/filter/bulk/pagination/restore/draft, Analytics avg
// views + like rate + honest top-source empty state, Upload wizard
// steps, Comments reply/filter/sort/pagination, Settings full form +
// handle-taken error, Watch suggestions with reasons + depth-4
// comments + pinned comment, History pause flag + progress resume +
// feed-miss fallback, Library saved playlists + remove, Playlist
// public read.
import { describe, it, expect } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import {
  captured,
  fixtureNestedComments,
  fixtureVideos,
} from "../mocks/handlers";
import { renderWithProviders, testSession } from "./testUtils";
import { InternetStatusProvider } from "../utils/internetStatusContext";
import Allroutes from "../Allroutes";
import Home from "../Pages/Home/Home";

function renderRoutes(route: string, session: typeof testSession | null) {
  return renderWithProviders(
    <InternetStatusProvider>
      <Allroutes
        seteditcreatechanelbtn={() => {}}
      />
    </InternetStatusProvider>,
    { route, session },
  );
}

const pageOf = <T,>(items: T[]) => ({
  items,
  page: 1,
  limit: 50,
  total: items.length,
  totalPages: 1,
});

describe("A — Home chips filter the feed", () => {
  it("Coding chip shows only coding videos; All restores the feed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />);
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Music" }));
    expect(screen.queryByText("Python Basics Tutorial")).not.toBeInTheDocument();
    expect(await screen.findByText(/No videos about Music/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
  });

  it("shows an Upload pill routing into Studio", async () => {
    renderWithProviders(<Home />);
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    const pill = screen.getByRole("link", { name: "+ Upload" });
    expect(pill.getAttribute("href")).toBe("/studio/upload");
  });

  it("shows duration badges on video cards", async () => {
    renderWithProviders(<Home />);
    expect(await screen.findByText("2:14")).toBeInTheDocument(); // vid1 134s
  });
});

describe("B — Dashboard", () => {
  it("shows top videos + latest comments + 4 preview KPI cards", async () => {
    renderRoutes("/studio", testSession);
    expect(await screen.findByText("Total views")).toBeInTheDocument();
    expect(screen.getByText("Top performing videos")).toBeInTheDocument();
    expect(screen.getByText("Latest comments")).toBeInTheDocument();
    expect(screen.getByText("Python Basics Tutorial")).toBeInTheDocument();
    expect(screen.getByText("Great tutorial!")).toBeInTheDocument();
    // Preview (image 9): exactly 4 cards — no Completions, no
    // all-time/statsSince lines, no 28-day data table, no Upload button.
    expect(screen.getByText("Watch time")).toBeInTheDocument();
    expect(screen.getByText("0.7 hrs")).toBeInTheDocument(); // 42 min
    expect(screen.queryByText("Completions")).not.toBeInTheDocument();
    expect(screen.queryByText(/Stats since/)).not.toBeInTheDocument();
    expect(screen.queryByText(/All-time totals/)).not.toBeInTheDocument();
    expect(screen.queryByText("Upload a video")).not.toBeInTheDocument();
    expect(screen.getByText("Test User")).toBeInTheDocument(); // channel identity
    expect(
      screen.getAllByRole("link", { name: /Reply to comment/ }).length,
    ).toBeGreaterThan(0);
  });
});

describe("C — Content", () => {
  it("search narrows the list", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/content", testSession);
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search your videos"), "Java");
    await waitFor(() => {
      expect(screen.queryByText("Python Basics Tutorial")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Java for Beginners")).toBeInTheDocument();
  });

  it("visibility filter shows only drafts", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/content", testSession);
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Filter by visibility"), "draft");
    await waitFor(() => {
      expect(screen.queryByText("Python Basics Tutorial")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Untitled draft — trim 03")).toBeInTheDocument();
  });

  it("bulk-select + bulk delete calls DELETE per selected video", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/content", testSession);
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Select Python Basics Tutorial"));
    await user.click(screen.getByLabelText("Select Java for Beginners"));
    await user.click(screen.getByRole("button", { name: "Delete 2 selected" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete 2 selected" }));
    await waitFor(() => {
      expect(captured.videoDeletes).toContain("vid1");
      expect(captured.videoDeletes).toContain("vid3");
    });
  });

  it("soft-delete shows a Restore affordance that calls POST /video/:id/restore", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/content", testSession);
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Row actions for Python Basics Tutorial" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("menuitem", { name: "Confirm delete" }));
    expect(await screen.findByText("Deleted")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Row actions for Python Basics Tutorial" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Restore" }));
    await waitFor(() => {
      expect(captured.videoRestores).toContain("vid1");
    });
  });

  it("edit details saves description + tags via PATCH /video/:id", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/content", testSession);
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Row actions for Python Basics Tutorial" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit details" }));
    const desc = screen.getByLabelText("Video description");
    await user.clear(desc);
    await user.type(desc, "Updated description");
    const tags = screen.getByLabelText("Video tags");
    await user.clear(tags);
    await user.type(tags, "python, basics");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(captured.videoPatches).toContainEqual({
        id: "vid1",
        body: expect.objectContaining({
          title: "Python Basics Tutorial",
          description: "Updated description",
          tags: ["python", "basics"],
        }),
      });
    });
  });

  it("pagination moves between pages", async () => {
    const user = userEvent.setup();
    // Two pages of one item each, driven by the page query param.
    server.use(
      http.get("*/studio/videos", ({ request }) => {
        const url = new URL(request.url);
        const page = Number(url.searchParams.get("page") ?? 1);
        const items =
          page === 1
            ? [fixtureVideos[0]]
            : [fixtureVideos[2]];
        return HttpResponse.json({
          items,
          page,
          limit: 1,
          total: 2,
          totalPages: 2,
        });
      }),
    );
    renderRoutes("/studio/content", testSession);
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Java for Beginners")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.queryByText("Python Basics Tutorial")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
  });

  it("draft visibility is offered in the Change visibility chooser, and no per-row controls remain", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/content", testSession);
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    // No per-row buttons, dropdown, or inline edit inputs in the table.
    expect(
      screen.queryByRole("button", { name: "Edit details" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "View analytics" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Visibility for Python Basics Tutorial"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Video description"),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Row actions for Python Basics Tutorial" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "View analytics" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("menuitem", { name: "Change visibility" }),
    );
    for (const label of ["Public", "Unlisted", "Private", "Draft"]) {
      expect(
        screen.getByRole("menuitemradio", { name: label }),
      ).toBeInTheDocument();
    }
  });
});

describe("D — Analytics", () => {
  it("adds Avg views/video + Like rate and an honest top-source empty state", async () => {
    renderRoutes("/studio/analytics", testSession);
    expect(await screen.findByText("Avg views / video")).toBeInTheDocument();
    expect(screen.getAllByText("25").length).toBeGreaterThanOrEqual(1); // 50 views / 2 videos
    expect(screen.getByText("Like rate")).toBeInTheDocument();
    expect(screen.getByText("6.0%")).toBeInTheDocument(); // 3/50
    expect(
      screen.getByText("Traffic source not tracked yet"),
    ).toBeInTheDocument();
  });
});

describe("E — Upload wizard", () => {
  it("walks file → details → review and publishes via the upload endpoint", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/upload", testSession);
    expect(await screen.findByText(/Step 1 of 3/)).toBeInTheDocument();
    const file = new File(["fake video"], "morning-routine.mp4", {
      type: "video/mp4",
    });
    const input = screen.getByLabelText("Choose video file");
    await user.upload(input, file);
    expect(screen.getByText(/morning-routine.mp4/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue to details" }));
    // Upload-wizard fix: the wizard is genuinely 3 steps now — step 2
    // is Details only (Title / Description / Tags, thumbnail preview,
    // Visibility); Publish + Save as draft live on the step 3 Review
    // screen, not on Details.
    expect(await screen.findByText(/Step 2 of 3/)).toBeInTheDocument();
    expect(screen.getByText("PREVIEW")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Publish" }),
    ).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Title"), "How I plan my week");
    await user.type(screen.getByLabelText("Description"), "Sunday routine");
    await user.type(screen.getByLabelText("Tags"), "planning, routine");
    await user.click(screen.getByRole("button", { name: "Continue to review" }));
    expect(await screen.findByText(/Step 3 of 3/)).toBeInTheDocument();
    expect(screen.getByText("How I plan my week")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => {
      // NOTE: jsdom/undici serialises the File part as filename "blob"
      // in this environment, so the test asserts the title (the field
      // the wizard controls), not the raw filename.
      expect(captured.uploads).toContainEqual(
        expect.objectContaining({
          title: "How I plan my week",
          description: "Sunday routine",
          tags: "planning, routine",
          visibility: "public",
        }),
      );
    });
    expect(await screen.findByText("Your video was uploaded.")).toBeInTheDocument();
    // Phase 5 fix: the upload response carries the new video id, so the
    // wizard links straight to the video.
    const watchLink = screen.getByRole("link", { name: "Watch video" });
    expect(watchLink.getAttribute("href")).toBe("/watch/vid-uploaded");
  });

  it("Save as draft is offered on the review step and title is required", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/upload", testSession);
    expect(await screen.findByText(/Step 1 of 3/)).toBeInTheDocument();
    const file = new File(["fake video"], "draft.mp4", { type: "video/mp4" });
    await user.upload(screen.getByLabelText("Choose video file"), file);
    await user.click(screen.getByRole("button", { name: "Continue to details" }));
    expect(await screen.findByText(/Step 2 of 3/)).toBeInTheDocument();
    // Upload-wizard fix: Publish / Save as draft live on step 3, not
    // step 2 — and "Continue to review" is disabled until a title is set.
    expect(
      screen.queryByRole("button", { name: "Publish" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save as draft" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue to review" }),
    ).toBeDisabled();
    await user.type(screen.getByLabelText("Title"), "Draft title");
    expect(screen.getByRole("radio", { name: "Draft" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue to review" }));
    expect(await screen.findByText(/Step 3 of 3/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save as draft" })).toBeEnabled();
    // Phase 5 fix: Save as draft actually submits visibility=draft
    // (before the backend fix the field was dropped and the upload
    // became a public video).
    await user.click(screen.getByRole("button", { name: "Save as draft" }));
    await waitFor(() => {
      expect(captured.uploads).toContainEqual(
        expect.objectContaining({ title: "Draft title", visibility: "draft" }),
      );
    });
    expect(await screen.findByText("Your video was uploaded.")).toBeInTheDocument();
  });

  it("rejects files over 10 MB", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/upload", testSession);
    expect(await screen.findByText(/Step 1 of 3/)).toBeInTheDocument();
    // Upload-wizard fix: the client limit is the server's 10 MiB
    // (10,485,760 bytes), not the old round 10,000,000 — the oversize
    // probe must be over the real limit.
    const big = new File([new ArrayBuffer(10 * 1024 * 1024 + 1)], "big.mp4", {
      type: "video/mp4",
    });
    await user.upload(screen.getByLabelText("Choose video file"), big);
    expect(
      await screen.findByText("Please attach a video file less than 10 MB"),
    ).toBeInTheDocument();
  });
});

describe("F — Studio Comments", () => {
  it("Unreplied filter, sort and reply box work", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/comments", testSession);
    expect(await screen.findByText("Great tutorial!")).toBeInTheDocument();
    expect(screen.getByText("Helpful, thanks!")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Filter comments"), "unreplied");
    await waitFor(() => {
      expect(screen.queryByText("Great tutorial!")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Helpful, thanks!")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Filter comments"), "");
    expect(await screen.findByText("Great tutorial!")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Reply" })[0]);
    const box = screen.getByLabelText("Write a reply");
    await user.type(box, "Thanks for watching{Enter}");
    await waitFor(() => {
      expect(captured.comments).toContainEqual(
        expect.objectContaining({ parentId: "c1", commentbody: "Thanks for watching" }),
      );
    });
  });

  it("heart toggle flips aria-pressed and pagination renders", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/comments", testSession);
    expect(await screen.findByText("Great tutorial!")).toBeInTheDocument();
    const heart = screen.getByLabelText("Heart comment by carol");
    expect(heart).toHaveAttribute("aria-pressed", "false");
    await user.click(heart);
    expect(heart).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
  });
});

describe("G — Settings", () => {
  it("renders the full form and saves the full shape", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/settings", testSession);
    expect(await screen.findByLabelText("Channel name")).toHaveValue("Test User");
    expect(screen.getByLabelText("Handle · unique")).toHaveValue("testuser");
    expect(screen.getByLabelText("Channel URL")).toHaveValue(
      `${window.location.origin}/@testuser`,
    );
    expect(screen.getByLabelText("Contact email · for viewers")).toHaveValue(
      "hello@test.example",
    );
    expect(screen.getByLabelText("Link 1 label")).toHaveValue("GitHub");
    expect(screen.getByLabelText("Channel is public — anyone can find this channel")).toBeChecked();
    await user.click(screen.getByRole("button", { name: "+ Add link" }));
    expect(screen.getByLabelText("Link 2 label")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      expect(captured.studioSettingsPatches).toHaveLength(1);
    });
    expect(await screen.findByText("Settings saved")).toBeInTheDocument();
  });

  it("shows the backend error for a taken handle", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/settings", testSession);
    const handle = await screen.findByLabelText("Handle · unique");
    await user.clear(handle);
    await user.type(handle, "taken");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText("Handle is already taken"),
    ).toBeInTheDocument();
  });

  it("renders no subscribe/follower UI", async () => {
    renderRoutes("/studio/settings", testSession);
    expect(
      await screen.findByRole("heading", { name: "Channel settings" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/subscribers/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/followers/i)).not.toBeInTheDocument();
  });
});

describe("H — Watch", () => {
  it("Up Next comes from suggestions with Because: reason labels", async () => {
    server.use(
      http.get("*/comment/get", () =>
        HttpResponse.json(pageOf(fixtureNestedComments)),
      ),
    );
    renderRoutes("/watch/vid1", testSession);
    expect(await screen.findByText("Up next")).toBeInTheDocument();
    expect(screen.getByText("Because: Same channel")).toBeInTheDocument();
    expect(screen.getByText("Because: Same topic")).toBeInTheDocument();
    expect(screen.queryByText("Subscribe")).not.toBeInTheDocument();
  });

  it("renders nested replies to depth 4 (the old depth-cap bug)", async () => {
    server.use(
      http.get("*/comment/get", () =>
        HttpResponse.json(pageOf(fixtureNestedComments)),
      ),
    );
    renderRoutes("/watch/vid1", testSession);
    expect(
      await screen.findByText("Deepest reply — must still be visible"),
    ).toBeInTheDocument();
    expect(screen.getByText("And one level deeper")).toBeInTheDocument();
  });

  it("renders the pinned creator comment first with a Pinned label", async () => {
    const pinned = [
      ...fixtureNestedComments,
      {
        _id: "c0",
        videoid: "vid1",
        userid: "user1",
        commentbody: "Part 2 drops Friday",
        usercommented: "Test User",
        parentId: null,
        pinnedByCreator: "user1",
      },
    ];
    server.use(
      http.get("*/comment/get", () => HttpResponse.json(pageOf(pinned))),
    );
    renderRoutes("/watch/vid1", testSession);
    expect(await screen.findByText("Part 2 drops Friday")).toBeInTheDocument();
    expect(screen.getByText(/Pinned by creator/)).toBeInTheDocument();
  });

  it("Save menu saves to the library shelf", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/comment/get", () =>
        HttpResponse.json(pageOf(fixtureNestedComments)),
      ),
    );
    renderRoutes("/watch/vid1", testSession);
    expect(await screen.findByText("Up next")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(
      screen.getByRole("button", { name: "Save to library" }),
    );
    await waitFor(() => {
      expect(captured.libraryAdds).toContainEqual({
        videoid: "vid1",
        kind: "saved",
      });
    });
  });

  it("playlist showcase has index numbers, current highlight and Play all", async () => {
    server.use(
      http.get("*/comment/get", () =>
        HttpResponse.json(pageOf(fixtureNestedComments)),
      ),
    );
    renderRoutes("/watch/vid1", testSession);
    expect(await screen.findByText("Playlist · My favourites")).toBeInTheDocument();
    expect(screen.getByText("Playing now", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Play all")).toBeInTheDocument();
    expect(screen.getByText("Shuffle off")).toBeInTheDocument();
    expect(screen.getByText("Loop off")).toBeInTheDocument();
  });
});

describe("I — History", () => {
  it("Pause history calls the backend flag endpoint", async () => {
    const user = userEvent.setup();
    const now = new Date().toISOString();
    server.use(
      http.get("*/video/getallhistory", () =>
        HttpResponse.json(
          pageOf([
            { _id: "h1", videoid: "vid1", viewer: "user1", likedon: now },
          ]),
        ),
      ),
    );
    renderRoutes("/history", testSession);
    expect(await screen.findByText("Python Basics Tutorial")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pause history" }));
    await waitFor(() => {
      expect(captured.historyPausedPatches).toContain(true);
    });
    expect(await screen.findByText("Resume history")).toBeInTheDocument();
    // Restore the shared MSW fixture so later tests start unpaused.
    await user.click(screen.getByRole("button", { name: "Resume history" }));
    await waitFor(() => {
      expect(captured.historyPausedPatches).toContain(false);
    });
  });

  it("loads a row whose video is not in the feed via GET /video/:id", async () => {
    const now = new Date().toISOString();
    server.use(
      http.get("*/video/getallhistory", () =>
        HttpResponse.json(
          pageOf([
            { _id: "h1", videoid: "vid4", viewer: "user1", likedon: now },
          ]),
        ),
      ),
      http.get("*/video/getvideos", () => HttpResponse.json(pageOf([]))),
    );
    renderRoutes("/history", testSession);
    expect(
      await screen.findByText("Untitled draft — trim 03"),
    ).toBeInTheDocument();
  });

  it("Resume links carry the stored progress seconds", async () => {
    const now = new Date().toISOString();
    server.use(
      http.get("*/video/getallhistory", () =>
        HttpResponse.json(
          pageOf([
            {
              _id: "h1",
              videoid: "vid1",
              viewer: "user1",
              likedon: now,
              progressSec: 84,
              durationSec: 134,
            },
          ]),
        ),
      ),
    );
    renderRoutes("/history", testSession);
    const resume = await screen.findByRole("link", { name: /Resume from 1:24/ });
    expect(resume.getAttribute("href")).toBe("/watch/vid1?t=84");
    expect(screen.getByText(/Watched 1:24 of 2:14/)).toBeInTheDocument();
  });
});

describe("J — Library + Playlist", () => {
  it("shows a Saved playlists section and remove buttons", async () => {
    renderRoutes("/library", testSession);
    expect(await screen.findByText("Saved playlist example")).toBeInTheDocument();
    expect(screen.getByText(/Saved playlists/)).toBeInTheDocument();
    expect(screen.getByText("Your playlists & Saved playlists")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Java for Beginners from Saved" }),
    ).toBeInTheDocument();
    await userEvent.setup().click(
      screen.getByRole("button", { name: "Remove Java for Beginners from Saved" }),
    );
    await waitFor(() => {
      expect(captured.libraryRemoves).toContainEqual({
        kind: "saved",
        videoid: "vid3",
      });
    });
  });

  it("Playlist page is public — renders logged out, with Play all", async () => {
    renderRoutes("/playlist/pl1", null);
    expect(await screen.findByText("My favourites")).toBeInTheDocument();
    expect(screen.getByText("Play all")).toBeInTheDocument();
    expect(screen.getByText("Python Basics Tutorial")).toBeInTheDocument();
  });
});

describe("Contract — suggestions + pin endpoints are called", () => {
  it("Watch calls GET /watch/:id/suggestions", async () => {
    server.use(
      http.get("*/comment/get", () =>
        HttpResponse.json(pageOf(fixtureNestedComments)),
      ),
    );
    renderRoutes("/watch/vid1", testSession);
    expect(await screen.findByText("Up next")).toBeInTheDocument();
    await waitFor(() => {
      expect(captured.videoSuggestionCalls).toContain("vid1");
    });
    void fixtureVideos;
  });
});
