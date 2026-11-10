// Phase 5 fix — Studio Comments (preview screen F): comments on the
// creator's own videos with Reply (nested reply box), a heart toggle,
// Unreplied filter, timestamps, sort control and working pagination.
// NOTE: there is no backend endpoint for liking a comment, so the
// heart is a session-local mark (aria-pressed) until the backend adds
// one — it is never persisted or counted server-side.
import React, { useState } from "react";
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
import { formatDistanceToNow } from "date-fns";

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
  const [hearted, setHearted] = useState<Set<string>>(new Set());

  const totalPages = comments.data?.totalPages ?? 1;

  const submitReply = (e: React.FormEvent, c: { _id: string; videoid?: string }) => {
    e.preventDefault();
    if (!replyText.trim() || !currentuser) return;
    postMutation.mutate({
      videoid: c.videoid,
      userid: currentuser.result._id,
      commentbody: replyText.trim(),
      usercommented: currentuser.result.name,
      parentId: c._id,
    });
    setReplyText("");
    setReplyingId(null);
  };

  return (
    <StudioShell>
      <h1>Comments</h1>
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
      ) : comments.data.items.length === 0 ? (
        <StudioEmptyState
          title="No comments yet"
          body="When viewers comment on your videos, their comments will appear here."
        />
      ) : (
        <>
          <div>
            {comments.data.items.map((c) => (
              <div key={c._id} className="studio-list-row">
                <div className="studio-avatar">
                  {(c.usercommented ?? "?").charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <strong>{c.usercommented}</strong>
                  {c.videotitle ? (
                    <span style={{ color: "var(--text-2)" }}>
                      {" "}
                      on {c.videotitle}
                    </span>
                  ) : null}
                  {c.createdAt || c.commentedon ? (
                    <span style={{ color: "var(--text-2)" }}>
                      {" "}
                      ·{" "}
                      {formatDistanceToNow(
                        new Date(c.createdAt ?? c.commentedon ?? Date.now()),
                        { addSuffix: true },
                      )}
                    </span>
                  ) : null}
                  <p style={{ margin: "4px 0" }}>{c.commentbody}</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="acube-btn-secondary"
                      onClick={() =>
                        setReplyingId(replyingId === c._id ? null : c._id)
                      }
                    >
                      Reply
                    </button>
                    <button
                      type="button"
                      className="acube-btn-secondary"
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
                      {hearted.has(c._id) ? "♥ Hearted" : "♡ Heart"}
                    </button>
                    <button
                      type="button"
                      className="acube-btn-danger"
                      onClick={() => deleteMutation.mutate(c._id)}
                    >
                      Delete
                    </button>
                  </div>
                  {replyingId === c._id ? (
                    <form
                      onSubmit={(e) => submitReply(e, c)}
                      style={{ marginTop: 8 }}
                    >
                      <input
                        className="acube-input"
                        aria-label="Write a reply"
                        placeholder="Write a reply..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                      />{" "}
                      <button type="submit" className="acube-btn">
                        Reply
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
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
