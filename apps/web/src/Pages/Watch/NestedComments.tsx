// Watch comments: threaded replies via parentId, reply box per
// thread, collapse toggle, creator pin, Sort (Top / Newest), and
// like/dislike reactions (POST /comment/:id/like|dislike).
// Typography lives in NestedComments.css (body 14px, meta 13px —
// down from the inherited 16px); Watch.css is untouched.
// Top-level posts OMIT parentId entirely: the server Zod schema
// rejects an explicit `parentId: null` (400 VALIDATION_ERROR), which
// used to roll the optimistic comment straight back off screen.
// Timestamps: GET /comment returns `commentedon` (the Mongoose Date
// field — the schema has no timestamps, so there is NO createdAt on
// real rows). createdMs reads commentedon first and falls back to
// createdAt (the optimistic insert carries both); a comment with
// neither renders no time at all — never an invented one. Handles
// are the same story: no handle field exists, so the meta line shows
// "@" + the display name.
import React, { useMemo, useState } from "react";
import { AiFillDislike, AiFillLike, AiOutlineDislike, AiOutlineLike } from "react-icons/ai";
import { formatDistanceToNow } from "date-fns/formatDistanceToNow";
import { useAppSelector } from "../../store";
import {
  useCommentsForVideo,
  useDeleteComment,
  useDislikeComment,
  useLikeComment,
  usePinComment,
  usePostComment,
} from "../../query/hooks";
import type { CommentItem } from "../../types";
import "./NestedComments.css";

type CommentSort = "top" | "newest";

/** Direct replies shown before "Show more replies" appears. */
const INITIAL_REPLIES_SHOWN = 3;

interface TreeNode {
  comment: CommentItem;
  children: TreeNode[];
}

function buildTree(comments: CommentItem[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  // List position in the fetched (newest-first) list, for tie-breaks.
  const position = new Map<string, number>();
  comments.forEach((c, i) => position.set(c._id, i));
  for (const c of comments) byId.set(c._id, { comment: c, children: [] });
  for (const c of comments) {
    const node = byId.get(c._id);
    if (!node) continue;
    if (c.parentId && byId.has(c.parentId)) {
      byId.get(c.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // Replies read oldest-first (chronological) no matter which order
  // the server sent the flat list in — the fetch is newest-first
  // (see useComments), so list position alone no longer means
  // oldest-first. Ties (missing/equal timestamps) break by list
  // position: later in a newest-first list is older, so it comes
  // first.
  const sortChildren = (node: TreeNode): void => {
    node.children.sort((a, b) => {
      // NaN guard: two timestamp-less comments both read Infinity,
      // and Infinity - Infinity is NaN, which sort would treat as
      // "equal" without ever reaching the tie-break below.
      const byDate = createdMs(a.comment) - createdMs(b.comment);
      if (!Number.isNaN(byDate) && byDate !== 0) return byDate;
      return (
        (position.get(b.comment._id) ?? 0) -
        (position.get(a.comment._id) ?? 0)
      );
    });
    node.children.forEach(sortChildren);
  };
  roots.forEach(sortChildren);
  return roots;
}

/** Total replies in a thread (direct + nested) — the "N replies" count. */
function countDescendants(node: TreeNode): number {
  return node.children.reduce(
    (total, child) => total + 1 + countDescendants(child),
    0,
  );
}

/** Sort key for "newest": a real timestamp when present. The API
 * returns `commentedon`, not `createdAt` (see header) — reading only
 * createdAt made every real comment sort as timestamp-less. Comments
 * without either (old fixtures carry none) sort as newest, with the
 * original server position breaking ties — the server lists
 * newest-first, so an earlier position is newer. */
function createdMs(comment: CommentItem): number {
  const raw = comment.commentedon ?? comment.createdAt;
  if (!raw) return Number.POSITIVE_INFINITY;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/** Relative time ("2h ago") from the real timestamp, or null when
 * the comment has none — the caller renders no time, never a fake. */
function timeAgo(comment: CommentItem): string | null {
  const ms = createdMs(comment);
  if (!Number.isFinite(ms)) return null;
  return formatDistanceToNow(new Date(ms), { addSuffix: true });
}

function sortRoots(
  roots: TreeNode[],
  sort: CommentSort,
): TreeNode[] {
  const position = new Map<TreeNode, number>();
  roots.forEach((node, index) => position.set(node, index));
  const likesOf = (node: TreeNode): number => node.comment.likes ?? 0;
  return [...roots].sort((a, b) => {
    // The creator-pinned comment always sorts first, either way.
    if (a.comment.pinnedByCreator && !b.comment.pinnedByCreator) return -1;
    if (!a.comment.pinnedByCreator && b.comment.pinnedByCreator) return 1;
    if (sort === "top") {
      const byLikes = likesOf(b) - likesOf(a);
      if (byLikes !== 0) return byLikes;
    }
    // NaN guard: two timestamp-less comments both read Infinity,
    // and Infinity - Infinity is NaN, which sort would treat as
    // "equal" without ever reaching the position tie-break below.
    const byDate = createdMs(b.comment) - createdMs(a.comment);
    if (!Number.isNaN(byDate) && byDate !== 0) return byDate;
    // Tie-break: earlier in the newest-first list is newer.
    return (position.get(a) ?? 0) - (position.get(b) ?? 0);
  });
}

type RepliesVisibility = "collapsed" | "partial" | "expanded";

function CommentNode({
  node,
  depth,
  videoid,
  isVideoOwner,
}: {
  node: TreeNode;
  depth: number;
  videoid: string | undefined;
  isVideoOwner: boolean;
}) {
  const currentuser = useAppSelector((s) => s.auth.session);
  const postMutation = usePostComment();
  const deleteMutation = useDeleteComment();
  const pinMutation = usePinComment();
  const likeMutation = useLikeComment();
  const dislikeMutation = useDislikeComment();
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [visibility, setVisibility] = useState<RepliesVisibility>(() =>
    node.children.length > INITIAL_REPLIES_SHOWN ? "partial" : "expanded",
  );
  const c = node.comment;
  const isOwn = currentuser?.result._id === c.userid;
  // Visual indent caps at level 3; deeper replies still render.
  const indent = Math.min(depth, 3) * 16;
  const totalReplies = countDescendants(node);
  const time = timeAgo(c);
  const visibleChildren =
    visibility === "collapsed"
      ? []
      : visibility === "partial"
        ? node.children.slice(0, INITIAL_REPLIES_SHOWN)
        : node.children;

  const toggleReplies = () => {
    setVisibility((current) =>
      current === "collapsed"
        ? node.children.length > INITIAL_REPLIES_SHOWN
          ? "partial"
          : "expanded"
        : current === "partial"
          ? "expanded"
          : "collapsed",
    );
  };

  const submitReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !currentuser) return;
    postMutation.mutate({
      videoid,
      userid: currentuser.result._id,
      commentbody: replyText.trim(),
      usercommented: currentuser.result.name,
      parentId: c._id,
    });
    setReplyText("");
    setReplyOpen(false);
    // The reply threads under this comment — show the thread so it is
    // visible without a reload.
    setVisibility("expanded");
  };

  return (
    <div
      className="watch-comment"
      style={depth > 0 ? { marginLeft: indent } : undefined}
    >
      <div
        className={`watch-comment-body${c.pinnedByCreator ? " watch-comment-body--pinned" : ""}`}
      >
        <div
          className={`studio-avatar${c.pinnedByCreator ? " watch-comment-avatar--pinned" : ""}`}
        >
          {c.pinnedByCreator
            ? "★"
            : (c.usercommented ?? "?").charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div className="watch-comment-meta">
            <strong>@{c.usercommented}</strong>
            {c.pinnedByCreator ? (
              <span className="watch-comment-pinned"> · Pinned by creator</span>
            ) : null}
            {time ? <span> · {time}</span> : null}
          </div>
          <p className="watch-comment-text">{c.commentbody}</p>
          <div className="watch-comment-actions">
            <button
              type="button"
              className={`watch-comment-reaction${c.userReaction === "like" ? " active" : ""}`}
              aria-label={`Like comment by ${c.usercommented ?? "unknown"}`}
              aria-pressed={c.userReaction === "like"}
              title={
                currentuser
                  ? "Like this comment"
                  : "Sign in to like this comment"
              }
              disabled={!currentuser || likeMutation.isPending}
              onClick={() => likeMutation.mutate(c._id)}
            >
              {c.userReaction === "like" ? (
                <AiFillLike size={16} />
              ) : (
                <AiOutlineLike size={16} />
              )}
              <span>{c.likes ?? 0}</span>
            </button>
            <button
              type="button"
              className={`watch-comment-reaction${c.userReaction === "dislike" ? " active" : ""}`}
              aria-label={`Dislike comment by ${c.usercommented ?? "unknown"}`}
              aria-pressed={c.userReaction === "dislike"}
              title={
                currentuser
                  ? "Dislike this comment"
                  : "Sign in to dislike this comment"
              }
              disabled={!currentuser || dislikeMutation.isPending}
              onClick={() => dislikeMutation.mutate(c._id)}
            >
              {c.userReaction === "dislike" ? (
                <AiFillDislike size={16} />
              ) : (
                <AiOutlineDislike size={16} />
              )}
            </button>
            {currentuser ? (
              <button
                type="button"
                className="watch-comment-text-action"
                onClick={() => setReplyOpen((v) => !v)}
              >
                Reply
              </button>
            ) : null}
            {totalReplies > 0 && visibility !== "expanded" ? (
              <button
                type="button"
                className="watch-comment-text-action watch-comment-replies-toggle"
                aria-expanded={visibility !== "collapsed"}
                onClick={toggleReplies}
              >
                {totalReplies} {totalReplies === 1 ? "reply" : "replies"} ↓
              </button>
            ) : null}
            {totalReplies > 0 && visibility === "partial" ? (
              <button
                type="button"
                className="watch-comment-text-action"
                onClick={toggleReplies}
              >
                Show more replies
              </button>
            ) : null}
            {totalReplies > 0 && visibility === "expanded" ? (
              <button
                type="button"
                className="watch-comment-text-action"
                onClick={toggleReplies}
              >
                Hide replies
              </button>
            ) : null}
            {isOwn ? (
              <button
                type="button"
                className="watch-comment-text-action watch-comment-delete"
                onClick={() => deleteMutation.mutate(c._id)}
              >
                Delete
              </button>
            ) : null}
            {isVideoOwner && !c.pinnedByCreator ? (
              <button
                type="button"
                className="watch-comment-text-action"
                onClick={() => pinMutation.mutate(c._id)}
              >
                Pin
              </button>
            ) : null}
          </div>
          {replyOpen ? (
            <form onSubmit={submitReply} style={{ marginTop: 8 }}>
              <input
                className="acube-input"
                aria-label="Write a reply"
                placeholder="Write a reply..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />{" "}
              <button
                type="submit"
                className="watch-comment-text-action watch-comment-submit"
              >
                Post reply
              </button>
            </form>
          ) : null}
        </div>
      </div>
      {visibleChildren.length > 0 ? (
        <div className="watch-replies">
          {visibleChildren.map((child) => (
            <CommentNode
              key={child.comment._id}
              node={child}
              depth={depth + 1}
              videoid={videoid}
              isVideoOwner={isVideoOwner}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function NestedComments({
  videoid,
  videoOwnerId,
}: {
  videoid: string | undefined;
  /** User id of the video's owner — only they see the Pin button. */
  videoOwnerId?: string;
}) {
  const currentuser = useAppSelector((s) => s.auth.session);
  const commentlist = useCommentsForVideo(videoid);
  const postMutation = usePostComment();
  const [text, setText] = useState("");
  // Inline guard message — the old alert()s are gone.
  const [error, setError] = useState<string | null>(null);
  // Sort: Top (most-liked first) is the preview default; Newest is
  // newest-first. Both sort from the real filtered list. The control
  // is a TEXT button opening a small menu, not a boxed dropdown.
  const [sort, setSort] = useState<CommentSort>("top");
  const [sortOpen, setSortOpen] = useState(false);
  const isVideoOwner =
    Boolean(currentuser?.result._id) &&
    currentuser?.result._id === videoOwnerId;
  const tree = useMemo(
    () => sortRoots(buildTree(commentlist ?? []), sort),
    [commentlist, sort],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      setError("Please type your comment first.");
      return;
    }
    if (!currentuser) {
      setError("Please sign in to comment.");
      return;
    }
    setError(null);
    // Top-level post: parentId is OMITTED (never null) — see header.
    postMutation.mutate({
      videoid,
      userid: currentuser.result._id,
      commentbody: text.trim(),
      usercommented: currentuser.result.name,
    });
    setText("");
  };

  const pickSort = (next: CommentSort) => {
    setSort(next);
    setSortOpen(false);
  };

  return (
    <div className="watch-comments">
      <div className="watch-comments-header">
        <h2>Comments · {commentlist ? commentlist.length : ""}</h2>
        <div className="watch-comments-sort-wrap">
          <button
            type="button"
            className="watch-comments-sort"
            aria-label="Sort comments"
            aria-haspopup="menu"
            aria-expanded={sortOpen}
            onClick={() => setSortOpen((v) => !v)}
          >
            Sort: {sort === "top" ? "Top" : "Newest"} ▾
          </button>
          {sortOpen ? (
            <>
              <span
                className="watch-menu-overlay"
                aria-hidden="true"
                onClick={() => setSortOpen(false)}
              />
              <div
                className="acube-card watch-comments-sort-menu"
                role="menu"
                aria-label="Sort comments"
              >
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={sort === "top"}
                  className="watch-comments-sort-item"
                  onClick={() => pickSort("top")}
                >
                  {sort === "top" ? "✓ Top" : "Top"}
                </button>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={sort === "newest"}
                  className="watch-comments-sort-item"
                  onClick={() => pickSort("newest")}
                >
                  {sort === "newest" ? "✓ Newest" : "Newest"}
                </button>
              </div>
            </>
          ) : null}
        </div>
        <span className="watch-comments-note">
          Nested replies — reply to any level
        </span>
      </div>
      <form onSubmit={handleSubmit} className="watch-add-comment">
        <span className="studio-avatar">
          {(currentuser?.result.name ?? "?").charAt(0).toUpperCase()}
        </span>
        <div className="watch-add-comment-main">
          <label
            htmlFor="watch-add-comment-input"
            className="watch-add-comment-label"
          >
            ADD A COMMENT...
          </label>
          <textarea
            id="watch-add-comment-input"
            className="watch-add-comment-input"
            aria-label="Add a comment"
            placeholder="Be specific — what part helped?"
            rows={2}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              // Enter submits (Shift+Enter is a newline).
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className="watch-add-comment-footer">
            {error ? (
              <span className="watch-add-comment-error" role="alert">
                {error}
              </span>
            ) : (
              <span />
            )}
            <button
              type="submit"
              className="watch-comment-text-action watch-add-comment-submit"
            >
              Comment
            </button>
          </div>
        </div>
      </form>
      {tree.length === 0 ? (
        <p className="watch-comment-text" style={{ color: "var(--text-2)" }}>
          No comments yet. Be the first to comment.
        </p>
      ) : (
        tree.map((node) => (
          <CommentNode
            key={node.comment._id}
            node={node}
            depth={0}
            videoid={videoid}
            isVideoOwner={isVideoOwner}
          />
        ))
      )}
    </div>
  );
}
