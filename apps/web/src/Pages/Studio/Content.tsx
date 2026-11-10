// Phase 5 — Studio Content: own videos table with inline title edit,
// visibility select and delete (with confirm). Mutations are optimistic
// for title/visibility and invalidate only their own keys.
import React, { useState } from "react";
import { Link } from "react-router";
import StudioShell from "./Studio";
import {
  StudioEmptyState,
  StudioErrorState,
  StudioSkeleton,
  VisibilityBadge,
} from "./components";
import {
  useDeleteVideo,
  useStudioVideos,
  useUpdateVideo,
} from "../../query/hooks";
import type { VideoVisibility } from "../../types";

export default function Content() {
  const [page] = useState(1);
  const videos = useStudioVideos(page);
  const updateMutation = useUpdateVideo();
  const deleteMutation = useDeleteVideo();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const startEdit = (id: string, title: string) => {
    setEditingId(id);
    setEditTitle(title);
  };
  const saveEdit = (id: string) => {
    if (!editTitle.trim()) return;
    updateMutation.mutate({ id, title: editTitle.trim() });
    setEditingId(null);
  };

  return (
    <StudioShell>
      <h1>Content</h1>
      {videos.isLoading ? (
        <StudioSkeleton label="Loading your videos" />
      ) : videos.isError || !videos.data ? (
        <StudioErrorState
          message="Could not load your videos."
          onRetry={() => void videos.refetch()}
        />
      ) : videos.data.items.length === 0 ? (
        <StudioEmptyState
          title="No videos yet"
          body="Upload your first video and it will appear here, ready to manage."
        />
      ) : (
        <table className="studio-table">
          <thead>
            <tr>
              <th>Video</th>
              <th>Visibility</th>
              <th>Views</th>
              <th>Likes</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {videos.data.items.map((v) => (
              <tr key={v._id}>
                <td>
                  {editingId === v._id ? (
                    <span>
                      <input
                        className="acube-input"
                        aria-label="Video title"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                      />{" "}
                      <button
                        type="button"
                        className="acube-btn"
                        onClick={() => saveEdit(v._id)}
                      >
                        Save
                      </button>
                    </span>
                  ) : (
                    <span>
                      <Link to={`/watch/${v._id}`}>{v.videotitle}</Link>{" "}
                      <button
                        type="button"
                        className="acube-btn-secondary"
                        onClick={() => startEdit(v._id, v.videotitle)}
                      >
                        Edit title
                      </button>
                    </span>
                  )}
                </td>
                <td>
                  <VisibilityBadge visibility={v.visibility} />{" "}
                  <select
                    className="acube-select"
                    aria-label={`Visibility for ${v.videotitle}`}
                    value={v.visibility ?? "public"}
                    onChange={(e) =>
                      updateMutation.mutate({
                        id: v._id,
                        visibility: e.target.value as VideoVisibility,
                      })
                    }
                  >
                    <option value="public">Public</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="private">Private</option>
                  </select>
                </td>
                <td>{v.views ?? 0}</td>
                <td>{v.Like ?? 0}</td>
                <td>
                  {(v.createdAt ?? v.createdat ?? "").slice(0, 10) || "—"}
                </td>
                <td>
                  {confirmDeleteId === v._id ? (
                    <span>
                      <button
                        type="button"
                        className="acube-btn-danger"
                        onClick={() => {
                          deleteMutation.mutate(v._id);
                          setConfirmDeleteId(null);
                        }}
                      >
                        Confirm delete
                      </button>{" "}
                      <button
                        type="button"
                        className="acube-btn-secondary"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="acube-btn-danger"
                      onClick={() => setConfirmDeleteId(v._id)}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </StudioShell>
  );
}
