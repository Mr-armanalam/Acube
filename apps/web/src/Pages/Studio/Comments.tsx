// Phase 5 match-preview — Studio Comments (preview image 13):
// a TABLE — Comment / Video / When / Actions — with Reply · ♥ ·
// Delete, Unreplied filter, timestamps, sort + pagination. A pinned
// comment shows a "Pinned" badge when the backend provides
// pinnedByCreator. NOTE: there is no backend endpoint for liking a
// comment, so the heart is a session-local mark (aria-pressed) until
// the backend adds one — it is labelled honestly below the table and
// is never persisted or counted server-side.
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
      ) : comments.data.items.length === 0 ? (
        <StudioEmptyState
          title="No comments yet"
          body="When viewers comment on your videos, their comments will appear here."
        />
      ) : (
        <>
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
                {comments.data.items.map((c) => (
                  <React.Fragment key={c._id}>
                    <tr>
                      <td>
                        <strong>{c.commentbody}</strong>
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
                            gap: 8,
                            alignItems: "center",
                            flexWrap: "wrap",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <button
                            type="button"
                            className="acube-btn-secondary"
                            onClick={() =>
                              setReplyingId(replyingId === c._id ? null : c._id)
                            }
                          >
                            Reply
                          </button>
                          <span aria-hidden="true">·</span>
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
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            className="acube-btn-danger"
                            onClick={() => deleteMutation.mutate(c._id)}
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
