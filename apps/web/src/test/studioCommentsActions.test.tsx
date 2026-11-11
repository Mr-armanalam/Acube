// Studio Comments actions + pagination (MSW): the fixes for the three
// inbox actions and the pagination regression.
//
// * Delete removes the row (cache-key fix: useDeleteComment now also
//   invalidates ["studio", "comments"]) and never leaves an empty page
//   while rows remain — deleting the only row of page 2 falls back to
//   page 1.
// * Heart toggles the ♡/♥ glyph + aria-pressed and survives a page
//   change within the session (it already worked; this pins it).
// * Reply posts with parentId and appears threaded under its parent;
//   a failed post keeps the composer open with the server's message.
// * Restyle: actions are plain text ("Reply · ♡ · Delete") — no pill
//   classes anywhere in the Actions column.
// * Pagination regression: page 1 = 10 rows, Next → 1 row, Previous
//   returns (11 seeded comments at limit 10).
//
// The MSW overrides below keep a mutable comment list per test so a
// refetch after a mutation returns the post-mutation state, like the
// real API. The delete override mirrors the server: a leaf is removed,
// a parent with children soft-deletes (deleted:true, "[deleted]").
import { describe, it, expect } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
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

type MockComment = {
  _id: string;
  videoid: string;
  userid: string;
  commentbody: string;
  usercommented: string;
  videotitle: string;
  createdAt: string;
  parentId?: string | null;
  hasReply?: boolean;
  deleted?: boolean;
};

function makeComments(count: number): MockComment[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      _id: `c${String(n).padStart(2, "0")}`,
      videoid: "vid1",
      userid: `user${n}`,
      commentbody: `Comment ${n}`,
      usercommented: `viewer${n}`,
      videotitle: "Python Basics Tutorial",
      // Newest first: c01 is the newest.
      createdAt: new Date(Date.UTC(2026, 10, 12 - n, 10, 0, 0)).toISOString(),
      parentId: null,
      hasReply: false,
    };
  });
}

function installCommentList(list: MockComment[]) {
  server.use(
    http.get("*/studio/comments", ({ request }) => {
      const url = new URL(request.url);
      const page = Number(url.searchParams.get("page") ?? 1);
      const limit = Number(url.searchParams.get("limit") ?? 50);
      const sort = url.searchParams.get("sort") ?? "newest";
      const items = [...list].sort((a, b) =>
        sort === "oldest"
          ? a.createdAt.localeCompare(b.createdAt)
          : b.createdAt.localeCompare(a.createdAt),
      );
      const totalPages = Math.max(1, Math.ceil(items.length / limit));
      const slice = items.slice((page - 1) * limit, page * limit);
      return HttpResponse.json({
        items: slice,
        page,
        limit,
        total: items.length,
        totalPages,
      });
    }),
    http.delete("*/comment/delete/:id", ({ params }) => {
      const idx = list.findIndex((c) => c._id === params.id);
      if (idx >= 0) {
        const hasChildren = list.some((c) => c.parentId === params.id);
        if (hasChildren) {
          list[idx] = {
            ...list[idx],
            deleted: true,
            commentbody: "[deleted]",
          };
        } else {
          list.splice(idx, 1);
        }
      }
      return HttpResponse.json({});
    }),
    http.post("*/comment/post", async ({ request }) => {
      const body = (await request.json()) as {
        videoid?: string;
        userid?: string;
        commentbody: string;
        usercommented?: string;
        parentId?: string | null;
      };
      list.push({
        _id: `new-${list.length + 1}`,
        videoid: body.videoid ?? "vid1",
        userid: body.userid ?? "user1",
        commentbody: body.commentbody,
        usercommented: body.usercommented ?? "Test User",
        videotitle: "Python Basics Tutorial",
        createdAt: new Date().toISOString(),
        parentId: body.parentId ?? null,
        hasReply: false,
      });
      return HttpResponse.json("posted the comment");
    }),
  );
}

function bodyRows() {
  const table = screen.getByRole("table");
  return Array.from(table.querySelectorAll("tbody tr"));
}

function rowTexts() {
  return bodyRows().map((r) => r.textContent ?? "");
}

async function openComments(list: MockComment[]) {
  installCommentList(list);
  renderRoutes("/studio/comments", testSession);
  expect(await screen.findByText("Comment 1")).toBeInTheDocument();
}

describe("Studio Comments actions", () => {
  it("actions are plain text Reply · ♡ · Delete, no pill buttons", async () => {
    await openComments(makeComments(2));
    const row = screen
      .getByRole("table")
      .querySelector("tbody tr") as HTMLElement;
    const actions = within(row).getByRole("button", { name: "Reply" });
    expect(actions).toBeInTheDocument();
    const buttons = within(row).getAllByRole("button");
    expect(buttons.map((b) => (b.textContent ?? "").trim())).toEqual([
      "Reply",
      "♡",
      "Delete",
    ]);
    for (const b of buttons) {
      expect(b.className).not.toContain("acube-btn");
    }
    // Dot separators sit between the three text actions.
    expect(row.textContent).toContain("Reply·♡·Delete");
  });

  it("heart toggles the glyph + aria-pressed and survives a page change", async () => {
    const user = userEvent.setup();
    await openComments(makeComments(11));
    const heart = screen.getByLabelText("Heart comment by viewer1");
    expect(heart).toHaveAttribute("aria-pressed", "false");
    expect(heart.textContent).toBe("♡");
    await user.click(heart);
    expect(heart).toHaveAttribute("aria-pressed", "true");
    expect(heart.textContent).toBe("♥");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
    const heartAgain = screen.getByLabelText("Heart comment by viewer1");
    expect(heartAgain).toHaveAttribute("aria-pressed", "true");
    expect(heartAgain.textContent).toBe("♥");
  });

  it("delete removes the row and the pager total updates", async () => {
    const user = userEvent.setup();
    await openComments(makeComments(11));
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    const row = bodyRows().find((r) =>
      (r.textContent ?? "").includes("Comment 5"),
    ) as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(screen.queryByText("Comment 5")).not.toBeInTheDocument();
    });
    // 11 → 10 total at limit 10: one page now, all 10 remaining rows.
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(10);
  });

  it("deleting the only row of page 2 falls back to page 1", async () => {
    const user = userEvent.setup();
    await openComments(makeComments(11));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText("Comment 11")).toBeInTheDocument();
    const row = bodyRows()[0] as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    });
    expect(bodyRows()).toHaveLength(10);
    expect(screen.getByText("Comment 1")).toBeInTheDocument();
  });

  it("deleting a parent with replies removes its row (soft-delete hidden)", async () => {
    const user = userEvent.setup();
    const list = makeComments(3);
    list.push({
      _id: "c04",
      videoid: "vid1",
      userid: "user9",
      commentbody: "Reply to comment 1",
      usercommented: "viewer9",
      videotitle: "Python Basics Tutorial",
      createdAt: new Date(Date.UTC(2026, 10, 12, 11, 0, 0)).toISOString(),
      parentId: "c01",
      hasReply: false,
    });
    await openComments(list);
    const row = bodyRows().find((r) =>
      (r.textContent ?? "").includes("Comment 1"),
    ) as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(screen.queryByText("Comment 1")).not.toBeInTheDocument();
    });
    // The reply stays (its parent is gone) and no "[deleted]" row shows.
    expect(screen.getByText("Reply to comment 1")).toBeInTheDocument();
    expect(screen.queryByText("[deleted]")).not.toBeInTheDocument();
  });

  it("reply posts with parentId and appears threaded under its parent", async () => {
    const user = userEvent.setup();
    await openComments(makeComments(11));
    const row = bodyRows().find((r) =>
      (r.textContent ?? "").includes("Comment 3"),
    ) as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Reply" }));
    const box = screen.getByLabelText("Write a reply");
    await user.type(box, "Thanks for watching!{Enter}");
    await waitFor(() => {
      // The threaded reply renders with a "↳ " prefix, so match by
      // substring rather than exact text.
      expect(screen.getByText(/Thanks for watching!/)).toBeInTheDocument();
    });
    // Composer closed on success; the reply sits directly under its
    // parent (↳ prefix), before the next top-level comment.
    expect(screen.queryByLabelText("Write a reply")).not.toBeInTheDocument();
    const texts = rowTexts();
    const parentIdx = texts.findIndex((t) => t.includes("Comment 3"));
    const replyIdx = texts.findIndex((t) =>
      t.includes("Thanks for watching!"),
    );    const nextIdx = texts.findIndex((t) => t.includes("Comment 4"));
    expect(replyIdx).toBe(parentIdx + 1);
    expect(replyIdx).toBeLessThan(nextIdx);
    expect(texts[replyIdx]).toContain("↳");
  });

  it("a failed reply keeps the composer open with the server message", async () => {
    const user = userEvent.setup();
    const list = makeComments(2);
    installCommentList(list);
    server.use(
      http.post("*/comment/post", () =>
        HttpResponse.json(
          {
            error: {
              message: "parentId must reference a live comment on the same video",
            },
          },
          { status: 400 },
        ),
      ),
    );
    renderRoutes("/studio/comments", testSession);
    expect(await screen.findByText("Comment 1")).toBeInTheDocument();
    const row = bodyRows()[0] as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Reply" }));
    const box = screen.getByLabelText("Write a reply");
    await user.type(box, "Will not post{Enter}");
    expect(
      await screen.findByText(
        "parentId must reference a live comment on the same video",
      ),
    ).toBeInTheDocument();
    // Composer still open, text intact.
    expect(screen.getByLabelText("Write a reply")).toHaveValue(
      "Will not post",
    );
  });

  it("pagination regression: 10 rows, Next → 1 row, Previous returns", async () => {
    const user = userEvent.setup();
    await openComments(makeComments(11));
    expect(bodyRows()).toHaveLength(10);
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    });
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText("Comment 11")).toBeInTheDocument();
    expect(screen.queryByText("Comment 1")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => {
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    });
    expect(bodyRows()).toHaveLength(10);
    expect(screen.getByText("Comment 1")).toBeInTheDocument();
  });
});
