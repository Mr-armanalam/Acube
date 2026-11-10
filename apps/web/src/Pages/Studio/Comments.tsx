// Phase 5 — Studio Comments: comments on the creator's own videos,
// newest first, with delete (reuses DELETE /comment/delete/:id).
import React from "react";
import StudioShell from "./Studio";
import {
  StudioEmptyState,
  StudioErrorState,
  StudioSkeleton,
} from "./components";
import { useDeleteComment, useStudioComments } from "../../query/hooks";

export default function Comments() {
  const comments = useStudioComments(1);
  const deleteMutation = useDeleteComment();

  return (
    <StudioShell>
      <h1>Comments</h1>
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
                <p style={{ margin: "4px 0" }}>{c.commentbody}</p>
                <button
                  type="button"
                  className="acube-btn-danger"
                  onClick={() => deleteMutation.mutate(c._id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </StudioShell>
  );
}
