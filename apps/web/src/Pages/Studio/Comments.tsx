// Phase 5 match-preview — Studio Comments (preview image 13):
// a TABLE — Comment / Video / When / Actions — with Reply · ♥ ·
// Delete, Unreplied filter, timestamps, sort + pagination. A pinned
// comment shows a "Pinned" badge when the backend provides
// pinnedByCreator. NOTE: there is no backend endpoint for liking a
// comment, so the heart is a session-local mark (aria-pressed) until
// the backend adds one — it is labelled honestly below the table and
// is never persisted or counted server-side.
//
// Actions are plain TEXT links on one row ("Reply · ♡ · Delete") — no
// pill backgrounds, no red outline. Replies thread under their parent
// (depth-first, within the loaded page); a reply whose parent is not
// on this page renders as its own row. Soft-deleted comments
// (deleted:true — a deleted parent kept as an anchor for its replies)
// are hidden from this inbox: deleting a comment removes its row.
import React, { useEffect, useMemo, useState } from "react";
import StudioShell from "./Studio";
import {
  StudioEmptyState,
  StudioErrorState,
  StudioSkeleton,
} from "./components";
import {
  useDeleteComment,
  usePostComment,
  useStudioComments,
} from "../../query/hooks";
import { useAppSelector } from "../../store";
import { extractApiErrorMessage } from "../../utils/apiError";
import { formatDistanceToNow } from "date-fns/formatDistanceToNow";
import type { CommentItem } from "../../types";

/** The studio list carries the server's soft-delete flag; the shared
 * CommentItem type does not declare it. */
type StudioCommentRow = CommentItem & { deleted?: boolean };

/** Plain text action — no pill background, no outline, no border. */
const textActionStyle: React.CSSProperties = {
  background: "transparent",
  border: 0,
  padding: 0,
  margin: 0,
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: 2,
};

export default function Comments() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const comments = useStudioComments(page, {
    filter: filter || undefined,
    sort,
    limit: 10,
  });
  const deleteMutation = useDeleteComment();
  const postMutation = usePostComment();
  const currentuser = useAppSelector((s) => s.auth.session);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [hearted, setHearted] = useState<Set<string>>(new Set());

  const totalPages = comments.data?.totalPages ?? 1;
  const total = comments.data?.total ?? 0;

  // Visible rows: hide soft-deleted comments, then thread replies
  // under their parent (depth-first, within this page). A reply whose
  // parent is not on this page renders as its own row.
  const rows = useMemo(() => {
    const items = (comments.data?.items ?? []).filter(
      (c) => !(c as StudioCommentRow).deleted,
    );
    const byId = new Map(items.map((c) => [c._id, c]));
    const children = new Map<string, CommentItem[]>();
    const roots: CommentItem[] = [];
    for (const c of items) {
      if (c.parentId && byId.has(c.parentId)) {
        const list = children.get(c.parentId) ?? [];
        list.push(c);
        children.set(c.parentId, list);
      } else {
        roots.push(c);
      }
    }
    const flat: { comment: CommentItem; depth: number }[] = [];
    const walk = (c: CommentItem, depth: number) => {
      flat.push({ comment: c, depth });
      for (const child of children.get(c._id) ?? []) {
        walk(child, Math.min(depth + 1, 3));
      }
    };
    for (const r of roots) walk(r, 0);
    return flat;
  }, [comments.data]);

  // Never leave an empty page while rows remain: if the last row of a
  // page is deleted the server total (and totalPages) shrink, so fall
  // back a page; if the page's rows are all soft-deleted (hidden) the
  // server total does not shrink, so step back on visible emptiness.
  useEffect(() => {
    if (comments.isLoading || !comments.data) return;
    if (page > totalPages) setPage(totalPages);
    else if (rows.length === 0 && page > 1 && total > 0) {
      setPage(page - 1);
    }
  }, [comments.isLoading, comments.data, page, totalPages, rows.length, total]);

  const submitReply = (e: React.FormEvent, c: { _id: string; videoid?: string }) => {
    e.preventDefault();
    if (!replyText.trim() || !currentuser) return;
    setReplyError(null);
    postMutation.mutate(
      {
        videoid: c.videoid,
        userid: currentuser.result._id,
        commentbody: replyText.trim(),
        usercommented: currentuser.result.name,
        parentId: c._id,
      },
      {
        // Close the composer only once the reply is saved — on failure
        // it stays open with the text intact and the server's message.
        onSuccess: () => {
          setReplyText("");
          setReplyingId(null);
        },
        onError: (err) => {
          setReplyError(extractApiErrorMessage(err));
        },
      },
    );
  };

  const deleteComment = (c: CommentItem) => {
    setActionError(null);
    deleteMutation.mutate(c._id, {
      onError: (err) => {
        setActionError(extractApiErrorMessage(err));
      },
    });
  };

  return (
    <StudioShell>
      <h1>Comments</h1>
      <p style={{ color: "var(--text-2)", margin: "0 0 16px" }}>
        Every comment on your videos, in one inbox · filter:{" "}
        {filter === "unreplied" ? "Unreplied" : "All comments"}
      </p>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <select
          className="acube-select"
          aria-label="Filter comments"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All comments</option>
          <option value="unreplied">Unreplied</option>
        </select>
        <select
          className="acube-select"
          aria-label="Sort comments"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as "newest" | "oldest");
            setPage(1);
          }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>
      {comments.isLoading ? (
        <StudioSkeleton label="Loading comments" />
      ) : comments.isError || !comments.data ? (
        <StudioErrorState
          message="Could not load comments on your videos."
          onRetry={() => void comments.refetch()}
        />
      ) : comments.data.items.length === 0 && total === 0 ? (
        <StudioEmptyState
          title="No comments yet"
          body="When viewers comment on your videos, their comments will appear here."
        />
      ) : (
        <>
          {actionError ? (
            <p role="alert" className="studio-field-error">
              {actionError}
            </p>
          ) : null}
          <div className="studio-table-wrap">
            <table className="studio-table">
              <thead>
                <tr>
                  <th>Comment</th>
                  <th>Video</th>
                  <th>When</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ comment: c, depth }) => (
                  <React.Fragment key={c._id}>
                    <tr>
                      <td
                        style={
                          depth > 0 ? { paddingLeft: 12 + depth * 16 } : undefined
                        }
                      >
                        <strong>
                          {depth > 0 ? "↳ " : ""}
                          {c.commentbody}
                        </strong>
                        {c.pinnedByCreator ? (
                          <>
                            {" "}
                            <span className="acube-badge acube-badge-public">
                              📌 Pinned
                            </span>
                          </>
                        ) : null}
                        <br />
                        <span style={{ color: "var(--text-2)" }}>
                          {c.usercommented ?? "Viewer"}
                        </span>
                      </td>
                      <td>{c.videotitle ?? "—"}</td>
                      <td>
                        {c.createdAt || c.commentedon
                          ? formatDistanceToNow(
                              new Date(c.createdAt ?? c.commentedon ?? Date.now()),
                              { addSuffix: true },
                            )
                          : "—"}
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                            flexWrap: "nowrap",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <button
                            type="button"
                            style={textActionStyle}
                            onClick={() =>
                              setReplyingId(replyingId === c._id ? null : c._id)
                            }
                          >
                            Reply
                          </button>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            style={textActionStyle}
                            aria-pressed={hearted.has(c._id)}
                            aria-label={`Heart comment by ${c.usercommented ?? "viewer"}`}
                            onClick={() => {
                              setHearted((prev) => {
                                const next = new Set(prev);
                                if (next.has(c._id)) next.delete(c._id);
                                else next.add(c._id);
                                return next;
                              });
                            }}
                          >
                            {hearted.has(c._id) ? "♥" : "♡"}
                          </button>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            style={textActionStyle}
                            onClick={() => deleteComment(c)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    {replyingId === c._id ? (
                      <tr>
                        <td colSpan={4}>
                          <form
                            onSubmit={(e) => submitReply(e, c)}
                            style={{ display: "flex", gap: 8 }}
                          >
                            <input
                              className="acube-input"
                              aria-label="Write a reply"
                              placeholder="Write a reply..."
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              style={{ flex: 1 }}
                            />
                            <button type="submit" className="acube-btn">
                              Reply
                            </button>
                          </form>
                          {replyError ? (
                            <p role="alert" className="studio-field-error">
                              {replyError}
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="studio-note">
            Moderation rule: a creator can delete comments{" "}
            <strong>only on their own videos</strong> — enforced in the API,
            not just hidden in the UI. Hearts are session-only for now (no
            comment-like endpoint yet) and are not saved.
          </p>
          <nav
            aria-label="Comments pages"
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginTop: 16,
            }}
          >
            <button
              type="button"
              className="acube-btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span aria-current="page">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="acube-btn-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </StudioShell>
  );
}
