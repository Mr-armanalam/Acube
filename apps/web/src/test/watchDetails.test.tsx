// Watch details redesign (image-37): channel row meta, uniform
// action row, plain description with a text Show more, "··· More"
// menu with only real actions, and no pill buttons in the section.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { captured, fixtureNestedComments, fixtureVideos } from "../mocks/handlers";
import { renderWithProviders, testSession } from "./testUtils";
import { InternetStatusProvider } from "../utils/internetStatusContext";
import Allroutes from "../Allroutes";

function renderRoutes(route: string, session: typeof testSession | null) {
  return renderWithProviders(
    <InternetStatusProvider>
      <Allroutes seteditcreatechanelbtn={() => {}} />
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

// Same CSS-source trick as watchComments.test.tsx: Vitest stubs CSS
// imports, so the Download pill's ::after label is asserted against
// the stylesheet, while the control itself is asserted in the DOM.
function readWatchCss(): string {
  for (const candidate of [
    join(process.cwd(), "src/Pages/Watch/Watch.css"),
    join(process.cwd(), "apps/web/src/Pages/Watch/Watch.css"),
  ]) {
    try {
      return readFileSync(candidate, "utf8");
    } catch {
      // Try the next candidate.
    }
  }
  return "";
}

const LONG_DESCRIPTION =
  "Learn Python from scratch in this full walkthrough. We cover variables, " +
  "loops, functions, and modules, then build a small project end to end so " +
  "every idea lands in real code you can run yourself afterwards.";

async function renderWatch() {
  server.use(
    http.get("*/comment/get", () =>
      HttpResponse.json(pageOf(fixtureNestedComments)),
    ),
  );
  renderRoutes("/watch/vid1", testSession);
  // 5 s wait (repo precedent: settingsWatchPolish.test.tsx): the
  // heading renders only after the suggestions query resolves, and
  // the 1 s default is too tight under full-suite parallel load.
  expect(await screen.findByText("Up next", {}, { timeout: 5000 })).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Python Basics Tutorial" }),
  ).toBeInTheDocument();
}

describe("Watch details — channel row + action row (image-37)", () => {
  it("title on top; channel row carries views/time/tags + Subscribe far right", async () => {
    await renderWatch();
    const details = document.querySelector(".watch-details") as HTMLElement;
    // Title is the first thing in the details section.
    expect(details.querySelector("h1")).toHaveTextContent(
      "Python Basics Tutorial",
    );
    // Meta line under the channel name: real views/date/tags. Views
    // also lead the description line (scoped to .watch-details, so
    // the Up Next "· N views" is excluded). The count itself is the
    // real one — the view mutation increments the shared fixture
    // across tests, so no hardcoded number is asserted here.
    expect(within(details).getAllByText(/\d+ views/).length).toBe(2);
    expect(screen.getByText(/#coding #python #learning/)).toBeInTheDocument();
    // Real Subscribe pill + real count (42 from the mock subscription).
    expect(
      screen.getByRole("button", { name: "Subscribe to alice" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("42 subscribers", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    // No leftover standalone meta line / Thanks / Dislike text buttons.
    expect(screen.queryByText("Thanks")).not.toBeInTheDocument();
    expect(screen.queryByText("Dislike")).not.toBeInTheDocument();
  });

  it("one uniform action row: combined Like pill, Share, Save, Download, More", async () => {
    await renderWatch();
    // Combined Like pill: the real count (5) lives inside the Like
    // button; the dislike side is an icon-only toggle, no count.
    const like = screen.getByRole("button", { name: "Like this video" });
    expect(like).toHaveTextContent("5");
    expect(like.closest(".watch-like-pill")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Dislike this video" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "↗ Share" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "+ Save · Watch Later" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "··· More" }),
    ).toBeInTheDocument();
    // Download pill: the label is CSS ::after on the shared
    // DownloadVideo control (its rendering is not edited), so assert
    // the control is in the pill AND the stylesheet carries the label.
    const downloadPill = document.querySelector(
      ".watch-download-pill",
    ) as HTMLElement;
    expect(downloadPill).not.toBeNull();
    expect(
      downloadPill.querySelector("a.download, button.download"),
    ).not.toBeNull();
    expect(readWatchCss()).toMatch(
      /\.watch-download-pill[^}]*::after\s*\{[^}]*content:\s*"Download · Premium"/,
    );
  });

  it("no pill-styled buttons remain in the details section", async () => {
    await renderWatch();
    const details = document.querySelector(".watch-details") as HTMLElement;
    expect(
      details.querySelector(
        ".acube-btn, .acube-btn-secondary, .acube-btn-danger",
      ),
    ).toBeNull();
    // The action pills are the uniform .watch-action-pill /
    // .watch-like-pill set — exactly five controls in the row.
    expect(details.querySelectorAll(".watch-action-pill").length).toBe(4);
    expect(details.querySelectorAll(".watch-like-pill").length).toBe(1);
  });

  it("avatars are fixed 36px circles (no stretch)", async () => {
    await renderWatch();
    // The pinned avatar's red background exposed that the bare
    // .studio-avatar span (Studio.css is not loaded on /watch)
    // stretched to the full row height — Watch defines its own size.
    expect(readWatchCss()).toMatch(
      /\.watch-details \.studio-avatar\s*\{[^}]*width:\s*36px[^}]*border-radius:\s*50%/,
    );
    expect(
      document.querySelector(".watch-channel-link .studio-avatar"),
    ).not.toBeNull();
  });

  it("resume position stays visible subtly in the channel meta line", async () => {
    server.use(
      http.get("*/comment/get", () =>
        HttpResponse.json(pageOf(fixtureNestedComments)),
      ),
      http.get("*/video/getallhistory", () =>
        HttpResponse.json(
          pageOf([
            {
              _id: "h1",
              videoid: "vid1",
              viewer: "user1",
              progressSec: 11,
              durationSec: 134,
            },
          ]),
        ),
      ),
    );
    renderRoutes("/watch/vid1", testSession);
    expect(await screen.findByText("Up next", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/Resumed from 0:11/)).toBeInTheDocument();
  });
});

describe("Watch details — description (image-37)", () => {
  it("long description truncates at 140 chars with a Show more TEXT link", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/comment/get", () =>
        HttpResponse.json(pageOf(fixtureNestedComments)),
      ),
      http.get("*/video/vid1", () =>
        HttpResponse.json({
          ...fixtureVideos[0],
          description: LONG_DESCRIPTION,
        }),
      ),
    );
    renderRoutes("/watch/vid1", testSession);
    expect(await screen.findByText("Up next", {}, { timeout: 5000 })).toBeInTheDocument();
    // Full date, not ISO: "1 Nov 2026". (No hardcoded view count —
    // the view mutation increments the shared fixture across tests.)
    expect(screen.getByText(/views · 1 Nov 2026 —/)).toBeInTheDocument();
    // Truncated: the tail of the long description is absent.
    expect(
      screen.queryByText(/every idea lands in real code/),
    ).not.toBeInTheDocument();
    // Plain text, no description card box.
    expect(
      document.querySelector(".watch-description .acube-card"),
    ).toBeNull();
    const toggle = screen.getByRole("button", { name: "Show more" });
    expect(toggle).toHaveClass("watch-text-action");
    await user.click(toggle);
    expect(
      await screen.findByText(/every idea lands in real code/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show less" }));
    expect(
      screen.queryByText(/every idea lands in real code/),
    ).not.toBeInTheDocument();
  });

  it("short description renders no Show more toggle", async () => {
    await renderWatch();
    expect(
      screen.queryByRole("button", { name: "Show more" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Learn Python from scratch\./),
    ).toBeInTheDocument();
  });

  it("reads createdAt when createdat is absent (real API shape)", async () => {
    server.use(
      http.get("*/comment/get", () =>
        HttpResponse.json(pageOf(fixtureNestedComments)),
      ),
      http.get("*/video/vid1", () =>
        HttpResponse.json({
          ...fixtureVideos[0],
          createdat: undefined,
          createdAt: "2026-11-01T00:00:00.000Z",
        }),
      ),
    );
    renderRoutes("/watch/vid1", testSession);
    expect(
      await screen.findByText("Up next", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/views · 1 Nov 2026 —/)).toBeInTheDocument();
    expect(screen.getByText(/days ago/)).toBeInTheDocument();
  });

  it("omits the time entirely when the video has no date (never invented)", async () => {
    server.use(
      http.get("*/comment/get", () =>
        HttpResponse.json(pageOf(fixtureNestedComments)),
      ),
      http.get("*/video/vid1", () =>
        HttpResponse.json({
          ...fixtureVideos[0],
          createdat: undefined,
          createdAt: undefined,
        }),
      ),
    );
    renderRoutes("/watch/vid1", testSession);
    expect(
      await screen.findByText("Up next", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ago/)).not.toBeInTheDocument();
    // The description lead degrades to "N views — <text>".
    expect(screen.getByText(/views — Learn Python/)).toBeInTheDocument();
  });
});

describe("Watch details — More menu (image-37)", () => {
  it("Copy link copies the real URL and confirms inline", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    await renderWatch();
    await user.click(screen.getByRole("button", { name: "··· More" }));
    const copy = screen.getByRole("menuitem", { name: "Copy link" });
    await user.click(copy);
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    // MemoryRouter does not move window.location, so in jsdom the
    // copied URL is the test page URL — the point is that Copy link
    // copies window.location.href (the real Watch URL in the app).
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(
      await screen.findByRole("menuitem", { name: "✓ Link copied" }),
    ).toBeInTheDocument();
  });

  it("Thanks posts a real thank-you comment (no dead item)", async () => {
    const user = userEvent.setup();
    // Mutable comment list: the refetch after posting must return the
    // posted comment (like the real API), or the optimistic insert is
    // rolled back by the empty default list.
    type MutableComment = {
      _id: string;
      videoid: string;
      userid: string;
      commentbody: string;
      usercommented: string;
      parentId: string | null;
      likes?: number;
      dislikes?: number;
      userReaction?: "like" | "dislike" | null;
      createdAt?: string;
    };
    let items: MutableComment[] = [...fixtureNestedComments];
    server.use(
      http.get("*/comment/get", () => HttpResponse.json(pageOf(items))),
      http.post("*/comment/post", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        captured.comments.push(body);
        items = [
          ...items,
          {
            _id: `c-posted-${items.length + 1}`,
            videoid: String(body.videoid ?? "vid1"),
            userid: String(body.userid ?? "user1"),
            commentbody: String(body.commentbody ?? ""),
            usercommented: String(body.usercommented ?? "Test User"),
            parentId: null,
            likes: 0,
            dislikes: 0,
            userReaction: null,
            createdAt: new Date().toISOString(),
          },
        ];
        return HttpResponse.json({});
      }),
    );
    renderRoutes("/watch/vid1", testSession);
    expect(await screen.findByText("Up next", {}, { timeout: 5000 })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "··· More" }));
    await user.click(screen.getByRole("menuitem", { name: "♥ Thanks" }));
    await waitFor(() =>
      expect(
        captured.comments.some(
          (c) =>
            (c as Record<string, unknown>).commentbody ===
            "Thanks for this video!",
        ),
      ).toBe(true),
    );
    expect(
      await screen.findByText("Thanks for this video!"),
    ).toBeInTheDocument();
  });

  it("Thanks is disabled when logged out", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/comment/get", () =>
        HttpResponse.json(pageOf(fixtureNestedComments)),
      ),
    );
    renderRoutes("/watch/vid1", null);
    expect(await screen.findByText("Up next", {}, { timeout: 5000 })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "··· More" }));
    const thanks = screen.getByRole("menuitem", { name: "♥ Thanks" });
    expect(thanks).toBeDisabled();
    expect(thanks).toHaveAttribute("title", "Sign in to say thanks");
  });
});
