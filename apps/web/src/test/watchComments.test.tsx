// Watch comments (NestedComments): composer omits parentId, per-video
// filtered fetch, posting visibility, like/dislike reactions, reply
// counts + show-more, Sort Top/Newest, pinned-first, typography,
// delete still working after the fetch change.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import {
  captured,
  fixtureNestedComments,
  withMockCommentReaction,
} from "../mocks/handlers";
import { renderWithProviders, testSession } from "./testUtils";
import NestedComments from "../Pages/Watch/NestedComments";

// The comment type scale is asserted against the stylesheet source:
// Vitest stubs `?raw` CSS imports to "" (and import.meta.url is not a
// file: URL under Vitest), so read the file directly (tests run in
// Node, from apps/web or the repo root).
function readCommentsCss(): string {
  for (const candidate of [
    join(process.cwd(), "src/Pages/Watch/NestedComments.css"),
    join(process.cwd(), "apps/web/src/Pages/Watch/NestedComments.css"),
  ]) {
    try {
      return readFileSync(candidate, "utf8");
    } catch {
      // Try the next candidate.
    }
  }
  return "";
}

const css = readCommentsCss();

const pageOf = <T,>(items: T[]) => ({
  items,
  page: 1,
  limit: 50,
  total: items.length,
  totalPages: 1,
});

type MockComment = {
  _id: string;
  videoid: string;
  userid: string;
  commentbody: string;
  usercommented: string;
  parentId?: string | null;
  pinnedByCreator?: string | null;
  likes?: number;
  dislikes?: number;
  userReaction?: "like" | "dislike" | null;
  createdAt?: string;
  /** Real API field (see NestedComments header) — the server returns
   * commentedon, not createdAt. */
  commentedon?: string;
};

function renderComments(
  videoid = "vid1",
  session: typeof testSession | null = testSession,
  videoOwnerId = "user1",
) {
  return renderWithProviders(
    <NestedComments videoid={videoid} videoOwnerId={videoOwnerId} />,
    { session },
  );
}

/** MSW overrides that keep a mutable comment list per test, so a
 * refetch after a mutation returns the post-mutation state, like the
 * real API. GET honours ?videoid= (the server does), ?sort=newest
 * (newest-first, capped at ?limit=, like the real server), and POST
 * appends the posted comment to the list. Request URLs are recorded. */
function useMutableComments(initial: MockComment[]) {
  let items = [...initial];
  const urls: string[] = [];
  server.use(
    http.get("*/comment/get", ({ request }) => {
      urls.push(request.url);
      const params = new URL(request.url).searchParams;
      const videoid = params.get("videoid");
      const limit = Number(params.get("limit") ?? 50);
      let filtered = videoid
        ? items.filter((c) => c.videoid === videoid)
        : items;
      // Mirror the real server: ?sort=newest reverses the list, and
      // ?limit= caps the page (default 50).
      if (params.get("sort") === "newest") {
        filtered = [...filtered].reverse();
      }
      filtered = filtered.slice(0, limit);
      // The real list carries the current reaction state — the mock
      // overlays it so a refetch after a like keeps the count.
      return HttpResponse.json(
        pageOf(filtered.map(withMockCommentReaction)),
      );
    }),
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
          parentId: (body.parentId as string | null) ?? null,
          likes: 0,
          dislikes: 0,
          userReaction: null,
          createdAt: new Date().toISOString(),
        },
      ];
      return HttpResponse.json({});
    }),
  );
  return {
    urls,
    getItems: () => items,
    setItems: (next: MockComment[]) => {
      items = next;
    },
  };
}

function orderInDocument(...texts: string[]): number[] {
  const body = document.body.textContent ?? "";
  return texts.map((t) => body.indexOf(t));
}

function likeButton(author: string) {
  // The author may appear on several comments (e.g. "carol" on c1
  // and c5) — the first in document order is the top-level one.
  return screen.getAllByRole("button", {
    name: `Like comment by ${author}`,
  })[0];
}

function dislikeButton(author: string) {
  return screen.getAllByRole("button", {
    name: `Dislike comment by ${author}`,
  })[0];
}

describe("Watch comments — composer", () => {
  it("top-level post OMITS parentId; a reply sends the real parent id", async () => {
    const user = userEvent.setup();
    useMutableComments([...fixtureNestedComments]);
    renderComments();
    expect(await screen.findByText("Great tutorial!")).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Add a comment"),
      "Hello from the composer",
    );
    await user.click(screen.getByRole("button", { name: "Comment" }));
    await waitFor(() => expect(captured.comments).toHaveLength(1));
    const topLevel = captured.comments[0] as Record<string, unknown>;
    expect("parentId" in topLevel).toBe(false);
    expect(topLevel.commentbody).toBe("Hello from the composer");

    // Reply to c1: scope to c1's own comment block — after the
    // top-level post above, the new comment sorts first, so the
    // first "Reply" button on the page is no longer c1's.
    const c1 = screen
      .getByText("Great tutorial!")
      .closest(".watch-comment") as HTMLElement;
    await user.click(
      within(c1).getAllByRole("button", { name: "Reply" })[0],
    );
    await user.type(
      screen.getByLabelText("Write a reply"),
      "Replying to carol",
    );
    await user.click(screen.getByRole("button", { name: "Post reply" }));
    await waitFor(() => expect(captured.comments).toHaveLength(2));
    const reply = captured.comments[1] as Record<string, unknown>;
    expect(reply.parentId).toBe("c1");
  });

  it("a posted comment is visible immediately and stays after refetch", async () => {
    const user = userEvent.setup();
    useMutableComments([...fixtureNestedComments]);
    renderComments();
    expect(await screen.findByText("Great tutorial!")).toBeInTheDocument();
    await user.type(
      screen.getByLabelText("Add a comment"),
      "Brand new comment",
    );
    await user.click(screen.getByRole("button", { name: "Comment" }));
    // Optimistic insert shows at once; the refetch (which now returns
    // the posted comment, like the real API) must not remove it.
    expect(await screen.findByText("Brand new comment")).toBeInTheDocument();
    await waitFor(() => expect(captured.comments).toHaveLength(1));
    await waitFor(
      () =>
        expect(screen.getByText("Brand new comment")).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });
});

describe("Watch comments — video-filtered fetch", () => {
  it("fetches with ?videoid= and never shows another video's comments", async () => {
    const otherVideo: MockComment = {
      _id: "other1",
      videoid: "vid2",
      userid: "user9",
      commentbody: "Comment on a different video",
      usercommented: "someone-else",
      parentId: null,
    };
    const { urls } = useMutableComments([
      ...fixtureNestedComments,
      otherVideo,
    ]);
    renderComments("vid1");
    expect(await screen.findByText("Great tutorial!")).toBeInTheDocument();
    expect(
      screen.queryByText("Comment on a different video"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Comments · 6" }),
    ).toBeInTheDocument();
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.includes("videoid=vid1"))).toBe(true);
  });
});

describe("Watch comments — reactions", () => {
  it("like toggles on then off, showing the real count", async () => {
    const user = userEvent.setup();
    useMutableComments([...fixtureNestedComments]);
    renderComments();
    expect(await screen.findByText("Great tutorial!")).toBeInTheDocument();
    const like = likeButton("carol");
    expect(like).toHaveTextContent("0");
    expect(like).toHaveAttribute("aria-pressed", "false");

    await user.click(like);
    await waitFor(() => expect(like).toHaveTextContent("1"));
    await waitFor(() =>
      expect(captured.commentReactions).toHaveLength(1),
    );
    expect(like).toHaveAttribute("aria-pressed", "true");
    expect(captured.commentReactions).toEqual([
      { id: "c1", reaction: "like" },
    ]);

    await user.click(like);
    await waitFor(() => expect(like).toHaveTextContent("0"));
    await waitFor(() =>
      expect(captured.commentReactions).toHaveLength(2),
    );
    expect(like).toHaveAttribute("aria-pressed", "false");
  });

  it("disliking after liking switches sides (like off, dislike on)", async () => {
    const user = userEvent.setup();
    useMutableComments([...fixtureNestedComments]);
    renderComments();
    expect(await screen.findByText("Great tutorial!")).toBeInTheDocument();
    const like = likeButton("carol");
    const dislike = dislikeButton("carol");

    await user.click(like);
    await waitFor(() => expect(like).toHaveTextContent("1"));
    await waitFor(() =>
      expect(captured.commentReactions).toHaveLength(1),
    );

    await user.click(dislike);
    await waitFor(() => expect(like).toHaveTextContent("0"));
    // The dislike control shows no count (preview) — only its toggle
    // state is asserted.
    expect(dislike).toHaveAttribute("aria-pressed", "true");
    expect(like).toHaveAttribute("aria-pressed", "false");
    await waitFor(() =>
      expect(captured.commentReactions).toHaveLength(2),
    );
    expect(captured.commentReactions[1]).toEqual({
      id: "c1",
      reaction: "dislike",
    });
  });

  it("a failed like rolls the optimistic count back", async () => {
    const user = userEvent.setup();
    useMutableComments([...fixtureNestedComments]);
    // Contract (backend 0437c5f): a bad/unknown comment id answers
    // 404 { error: { code: "NOT_FOUND" } } on the reaction routes —
    // the hook rolls back on any failure, whatever the status.
    server.use(
      http.post("*/comment/:id/like", () =>
        HttpResponse.json(
          { error: { code: "NOT_FOUND", message: "Comment not found" } },
          { status: 404 },
        ),
      ),
    );
    renderComments();
    expect(await screen.findByText("Great tutorial!")).toBeInTheDocument();
    const like = likeButton("carol");
    await user.click(like);
    // Optimistic +1 flashes, then the error rolls it back to 0.
    await waitFor(() => expect(like).toHaveTextContent("0"));
    expect(like).toHaveAttribute("aria-pressed", "false");
  });

  it("anonymous visitors see disabled reaction buttons with a clear title", async () => {
    useMutableComments([...fixtureNestedComments]);
    renderComments("vid1", null);
    expect(await screen.findByText("Great tutorial!")).toBeInTheDocument();
    const like = likeButton("carol");
    expect(like).toBeDisabled();
    expect(like).toHaveAttribute("title", "Sign in to like this comment");
    const dislike = dislikeButton("carol");
    expect(dislike).toBeDisabled();
    expect(dislike).toHaveAttribute(
      "title",
      "Sign in to dislike this comment",
    );
    expect(captured.commentReactions).toHaveLength(0);
  });
});

describe("Watch comments — replies, counts, show-more", () => {
  function threadFixture(): MockComment[] {
    const parent: MockComment = {
      _id: "p1",
      videoid: "vid1",
      userid: "user2",
      commentbody: "Parent thread",
      usercommented: "carol",
      parentId: null,
    };
    const replies = [1, 2, 3, 4, 5].map((n) => ({
      _id: `r${n}`,
      videoid: "vid1",
      userid: `user${n + 2}`,
      commentbody: `Reply ${n}`,
      usercommented: `viewer${n}`,
      parentId: "p1",
    }));
    const nested: MockComment = {
      _id: "n1",
      videoid: "vid1",
      userid: "user9",
      commentbody: "Nested under reply 1",
      usercommented: "nested-viewer",
      parentId: "r1",
    };
    return [parent, ...replies, nested];
  }

  it("shows the first 3 replies, then 'Show more replies', then all", async () => {
    const user = userEvent.setup();
    useMutableComments(threadFixture());
    renderComments();
    expect(await screen.findByText("Parent thread")).toBeInTheDocument();
    // 5 direct replies + 1 nested = 6 in the thread; only the first
    // 3 direct replies are shown at first.
    expect(screen.getByText("Reply 1")).toBeInTheDocument();
    expect(screen.getByText("Reply 3")).toBeInTheDocument();
    expect(screen.queryByText("Reply 4")).not.toBeInTheDocument();
    expect(screen.queryByText("Reply 5")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show more replies" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Show more replies" }),
    );
    expect(screen.getByText("Reply 4")).toBeInTheDocument();
    expect(screen.getByText("Reply 5")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Hide replies" }).length,
    ).toBeGreaterThanOrEqual(1);

    // Collapse the PARENT thread (scope to its own block — the
    // nested reply r1 has its own "Hide replies" button too).
    const parent = screen
      .getByText("Parent thread")
      .closest(".watch-comment") as HTMLElement;
    await user.click(
      within(parent).getAllByRole("button", { name: "Hide replies" })[0],
    );
    expect(screen.queryByText("Reply 1")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /6 replies/ }),
    ).toBeInTheDocument();
  });

  it("a reply posted to a collapsed thread appears under its parent", async () => {
    const user = userEvent.setup();
    useMutableComments(threadFixture());
    renderComments();
    expect(await screen.findByText("Parent thread")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Show more replies" }),
    );
    const parent = screen
      .getByText("Parent thread")
      .closest(".watch-comment") as HTMLElement;
    await user.click(
      within(parent).getAllByRole("button", { name: "Hide replies" })[0],
    );
    expect(
      screen.getByRole("button", { name: /6 replies/ }),
    ).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Reply" })[0]);
    await user.type(
      screen.getByLabelText("Write a reply"),
      "Fresh reply in a collapsed thread",
    );
    await user.click(screen.getByRole("button", { name: "Post reply" }));
    expect(
      await screen.findByText("Fresh reply in a collapsed thread"),
    ).toBeInTheDocument();
    await waitFor(() => expect(captured.comments).toHaveLength(1));
    expect(
      (captured.comments[0] as Record<string, unknown>).parentId,
    ).toBe("p1");
  });
});

describe("Watch comments — sort + pinned", () => {
  const sortedFixture: MockComment[] = [
    {
      _id: "a",
      videoid: "vid1",
      userid: "user2",
      commentbody: "Old popular",
      usercommented: "carol",
      parentId: null,
      likes: 10,
      dislikes: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      _id: "b",
      videoid: "vid1",
      userid: "user3",
      commentbody: "New unpopular",
      usercommented: "dave",
      parentId: null,
      likes: 0,
      dislikes: 0,
      createdAt: "2026-06-01T00:00:00.000Z",
    },
    {
      _id: "c",
      videoid: "vid1",
      userid: "user4",
      commentbody: "Mid liked",
      usercommented: "erin",
      parentId: null,
      likes: 3,
      dislikes: 0,
      createdAt: "2026-03-01T00:00:00.000Z",
    },
    {
      _id: "d",
      videoid: "vid1",
      userid: "user1",
      commentbody: "Pinned post",
      usercommented: "Test User",
      parentId: null,
      likes: 0,
      dislikes: 0,
      pinnedByCreator: "user1",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];

  it("defaults to Top (most-liked first) with the pinned comment first", async () => {
    useMutableComments(sortedFixture);
    renderComments();
    expect(await screen.findByText("Pinned post")).toBeInTheDocument();
    // Sort is a TEXT button ("Sort: Top"), not a boxed select.
    const sortButton = screen.getByRole("button", { name: "Sort comments" });
    expect(sortButton).toHaveTextContent("Sort: Top");
    expect(
      screen.queryByRole("combobox", { name: "Sort comments" }),
    ).not.toBeInTheDocument();
    const [pinned, popular, mid, unpopular] = orderInDocument(
      "Pinned post",
      "Old popular",
      "Mid liked",
      "New unpopular",
    );
    expect(pinned).toBeLessThan(popular);
    expect(popular).toBeLessThan(mid);
    expect(mid).toBeLessThan(unpopular);
  });

  it("Newest puts the newest first, pinned still first", async () => {
    const user = userEvent.setup();
    useMutableComments(sortedFixture);
    renderComments();
    expect(await screen.findByText("Pinned post")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sort comments" }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "Newest" }),
    );
    expect(screen.getByRole("button", { name: "Sort comments" })).toHaveTextContent(
      "Sort: Newest",
    );
    const [pinned, newest, mid, oldest] = orderInDocument(
      "Pinned post",
      "New unpopular",
      "Mid liked",
      "Old popular",
    );
    expect(pinned).toBeLessThan(newest);
    expect(newest).toBeLessThan(mid);
    expect(mid).toBeLessThan(oldest);
  });
});

describe("Watch comments — typography + delete", () => {
  it("applies the compact comment type scale (body 14px, meta 13px)", async () => {
    useMutableComments([...fixtureNestedComments]);
    renderComments();
    const body = await screen.findByText("Great tutorial!");
    expect(body).toHaveClass("watch-comment-text");
    // "carol" authors two fixture comments — the first is c1's. The
    // meta line shows "@" + the display name (no handle field exists).
    const author = screen.getAllByText("@carol")[0];
    expect(author.closest(".watch-comment-meta")).not.toBeNull();
    expect(screen.getByText("Thanks, glad it helped!")).toHaveClass(
      "watch-comment-text",
    );
    expect(css).toMatch(/\.watch-comment-text\s*\{[^}]*font-size:\s*14px/);
    expect(css).toMatch(/\.watch-comment-meta\s*\{[^}]*font-size:\s*13px/);
  });

  it("delete still removes the comment after the fetch change", async () => {
    const user = userEvent.setup();
    const store = useMutableComments([...fixtureNestedComments]);
    server.use(
      http.delete("*/comment/delete/:id", ({ params }) => {
        store.setItems(
          store
            .getItems()
            .filter((c) => c._id !== String(params.id)),
        );
        return HttpResponse.json({});
      }),
    );
    renderComments();
    expect(await screen.findByText("Thanks, glad it helped!")).toBeInTheDocument();
    // c2 is the test user's own comment — the only Delete button.
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(
        screen.queryByText("Thanks, glad it helped!"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Great tutorial!")).toBeInTheDocument();
  });
});

describe("Watch comments — redesign (image-37)", () => {
  it("renders relative time from commentedon (the real API field)", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    useMutableComments([
      {
        _id: "t1",
        videoid: "vid1",
        userid: "user2",
        commentbody: "Timed comment",
        usercommented: "carol",
        parentId: null,
        commentedon: twoHoursAgo,
      },
    ]);
    renderComments();
    expect(await screen.findByText("Timed comment")).toBeInTheDocument();
    // formatDistanceToNow: "about 2 hours ago".
    expect(screen.getByText(/2 hours ago/)).toBeInTheDocument();
  });

  it("a comment with no timestamp renders no time (never invented)", async () => {
    useMutableComments([...fixtureNestedComments]);
    renderComments();
    expect(await screen.findByText("Great tutorial!")).toBeInTheDocument();
    expect(screen.queryByText(/ago/)).not.toBeInTheDocument();
  });

  it("pinned comment renders the red-tinted box with a ★ avatar", async () => {
    const pinned = [
      ...fixtureNestedComments,
      {
        _id: "c0",
        videoid: "vid1",
        userid: "user1",
        commentbody: "Pinned post",
        usercommented: "Test User",
        parentId: null,
        pinnedByCreator: "user1",
      },
    ];
    useMutableComments(pinned);
    renderComments();
    expect(await screen.findByText("Pinned post")).toBeInTheDocument();
    const body = screen
      .getByText("Pinned post")
      .closest(".watch-comment-body") as HTMLElement;
    expect(body).toHaveClass("watch-comment-body--pinned");
    expect(body.querySelector(".watch-comment-avatar--pinned")).not.toBeNull();
    expect(body.querySelector(".watch-comment-avatar--pinned")).toHaveTextContent(
      "★",
    );
    expect(screen.getByText(/Pinned by creator/)).toBeInTheDocument();
  });

  it("comment actions are text, not pill buttons", async () => {
    const user = userEvent.setup();
    useMutableComments([...fixtureNestedComments]);
    renderComments();
    expect(await screen.findByText("Great tutorial!")).toBeInTheDocument();
    const comments = document.querySelector(".watch-comments") as HTMLElement;
    // No bulky-button classes anywhere in the comments section.
    expect(
      comments.querySelector(".acube-btn, .acube-btn-secondary, .acube-btn-danger"),
    ).toBeNull();
    for (const name of ["Reply", "Delete", "Comment"]) {
      const el = screen.getAllByRole("button", { name })[0];
      expect(el).toHaveClass("watch-comment-text-action");
    }
    // The add-comment box: label + new placeholder, submit as text.
    expect(
      screen.getByPlaceholderText("Be specific — what part helped?"),
    ).toBeInTheDocument();
    expect(screen.getByText("ADD A COMMENT...")).toBeInTheDocument();
    // Empty submit shows an inline message, not an alert().
    await user.click(screen.getByRole("button", { name: "Comment" }));
    expect(
      await screen.findByText("Please type your comment first."),
    ).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
    expect(captured.comments).toHaveLength(0);
  });

  it("logged-out submit shows an inline sign-in message, not an alert()", async () => {
    const user = userEvent.setup();
    useMutableComments([...fixtureNestedComments]);
    renderComments("vid1", null);
    expect(await screen.findByText("Great tutorial!")).toBeInTheDocument();
    await user.type(
      screen.getByLabelText("Add a comment"),
      "Hello from a visitor",
    );
    await user.click(screen.getByRole("button", { name: "Comment" }));
    expect(
      await screen.findByText("Please sign in to comment."),
    ).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
    expect(captured.comments).toHaveLength(0);
  });
});

describe("Watch comments — >50 comments (newest-first fetch)", () => {
  it("requests sort=newest and shows the newest comment past #50", async () => {
    const seed: MockComment[] = Array.from({ length: 51 }, (_, i) => ({
      _id: `c-${i + 1}`,
      videoid: "vid1",
      userid: `user-${i + 1}`,
      commentbody: `Comment ${i + 1} of 51`,
      usercommented: `User ${i + 1}`,
      parentId: null,
      likes: 0,
      dislikes: 0,
      userReaction: null,
      createdAt: new Date(Date.now() + i * 1000).toISOString(),
    }));
    const store = useMutableComments(seed);
    renderComments();
    // Newest-first page 1 (limit 50): the 51st comment is visible,
    // the oldest one is not — with the old oldest-first fetch the
    // 51st would sit on page 2 and never appear after refetch.
    expect(await screen.findByText("Comment 51 of 51")).toBeInTheDocument();
    expect(screen.queryByText("Comment 1 of 51")).not.toBeInTheDocument();
    expect(
      store.urls.some(
        (u) => new URL(u).searchParams.get("sort") === "newest",
      ),
    ).toBe(true);
  });
});
