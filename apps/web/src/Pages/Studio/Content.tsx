// Phase 5 fix — Studio Content (preview screen C): own videos table
// with search, visibility filter, bulk-select + bulk soft-delete,
// thumbnails, description/tags/thumbnail edit, per-row View analytics
// link, WORKING pagination (page state + pager), soft-delete with a
// restore affordance, and Draft in the visibility select. Deletes are
// soft server-side (POST /video/:id/restore restores); the row stays
// visible as "Deleted" with Restore until the list refreshes.
import React, { useMemo, useState } from "react";
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
  useRestoreVideo,
  useStudioVideos,
  useUpdateVideo,
} from "../../query/hooks";
import type { Video, VideoVisibility } from "../../types";

const formatDate = (v: Video): string => {
  return (v.createdAt ?? v.createdat ?? "").slice(0, 10) || "—";
}

export default function Content() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState("");
  const [limit] = useState(10);
  const videos = useStudioVideos(page, {
    q: search || undefined,
    visibility: visibility || undefined,
    limit,
  });
  const updateMutation = useUpdateVideo();
  const deleteMutation = useDeleteVideo();
  const restoreMutation = useRestoreVideo();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editThumbnailUrl, setEditThumbnailUrl] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);

  const items = useMemo(
    () => videos.data?.items ?? [],
    [videos.data],
  );
  const totalPages = videos.data?.totalPages ?? 1;
  const allSelected = items.length > 0 && items.every((v) => selected.has(v._id));
  const selectedCount = useMemo(
    () => items.filter((v) => selected.has(v._id)).length,
    [items, selected],
  );

  const startEdit = (v: Video) => {
    setEditingId(v._id);
    setEditTitle(v.videotitle);
    setEditDescription(v.description ?? "");
    setEditTags((v.tags ?? []).join(", "));
    setEditThumbnailUrl(v.thumbnailUrl ?? v.thumbnail ?? "");
  };
  const saveEdit = (id: string) => {
    if (!editTitle.trim()) return;
    updateMutation.mutate({
      id,
      title: editTitle.trim(),
      description: editDescription.trim() || undefined,
      tags: editTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      thumbnailUrl: editThumbnailUrl.trim() || undefined,
    });
    setEditingId(null);
  };

  const softDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        setDeletedIds((prev) => new Set(prev).add(id));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      },
    });
    setConfirmDeleteId(null);
  };

  const bulkDelete = () => {
    for (const id of selected) softDelete(id);
    setBulkConfirm(false);
  };

  const restore = (id: string) => {
    restoreMutation.mutate(id, {
      onSuccess: () => {
        setDeletedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        void videos.refetch();
      },
    });
  };

  return (
    <StudioShell>
      <h1>Channel content</h1>
      <p style={{ color: "var(--text-2)" }}>
        {videos.data ? `${videos.data.total} videos · ` : ""}
        Search, filter by visibility, bulk-select. Deletes are soft —
        deleted videos can be restored.
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
        <input
          className="acube-input"
          type="search"
          aria-label="Search your videos"
          placeholder="Search your videos"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="acube-select"
          aria-label="Filter by visibility"
          value={visibility}
          onChange={(e) => {
            setVisibility(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All visibilities</option>
          <option value="public">Public</option>
          <option value="unlisted">Unlisted</option>
          <option value="private">Private</option>
          <option value="draft">Draft</option>
        </select>
        {selectedCount > 0 ? (
          bulkConfirm ? (
            <span>
              <button
                type="button"
                className="acube-btn-danger"
                onClick={bulkDelete}
              >
                Confirm delete {selectedCount} selected
              </button>{" "}
              <button
                type="button"
                className="acube-btn-secondary"
                onClick={() => setBulkConfirm(false)}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="acube-btn-danger"
              onClick={() => setBulkConfirm(true)}
            >
              Delete {selectedCount} selected
            </button>
          )
        ) : null}
      </div>
      {videos.isLoading ? (
        <StudioSkeleton label="Loading your videos" />
      ) : videos.isError || !videos.data ? (
        <StudioErrorState
          message="Could not load your videos."
          onRetry={() => void videos.refetch()}
        />
      ) : items.length === 0 ? (
        <StudioEmptyState
          title="No videos yet"
          body="Upload your first video and it will appear here, ready to manage."
        />
      ) : (
        <>
          <table className="studio-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select all videos on this page"
                    checked={allSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelected(new Set(items.map((v) => v._id)));
                      } else {
                        setSelected(new Set());
                      }
                    }}
                  />
                </th>
                <th>Video</th>
                <th>Visibility</th>
                <th>Views</th>
                <th>Likes</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((v) => {
                const isDeleted = deletedIds.has(v._id);
                return (
                  <tr key={v._id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${v.videotitle}`}
                        checked={selected.has(v._id)}
                        onChange={(e) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(v._id);
                            else next.delete(v._id);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td>
                      {v.thumbnailUrl || v.thumbnail ? (
                        <img
                          className="studio-row-thumb"
                          src={v.thumbnailUrl ?? v.thumbnail ?? ""}
                          alt=""
                          style={{ marginBottom: 4 }}
                        />
                      ) : null}
                      {editingId === v._id ? (
                        <span
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            minWidth: 220,
                          }}
                        >
                          <input
                            className="acube-input"
                            aria-label="Video title"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                          />
                          <textarea
                            className="acube-input"
                            aria-label="Video description"
                            rows={2}
                            value={editDescription}
                            onChange={(e) =>
                              setEditDescription(e.target.value)
                            }
                          />
                          <input
                            className="acube-input"
                            aria-label="Video tags"
                            placeholder="Tags, comma separated"
                            value={editTags}
                            onChange={(e) => setEditTags(e.target.value)}
                          />
                          <input
                            className="acube-input"
                            aria-label="Thumbnail URL"
                            placeholder="Thumbnail URL"
                            value={editThumbnailUrl}
                            onChange={(e) =>
                              setEditThumbnailUrl(e.target.value)
                            }
                          />
                          <span>
                            <button
                              type="button"
                              className="acube-btn"
                              onClick={() => saveEdit(v._id)}
                            >
                              Save
                            </button>{" "}
                            <button
                              type="button"
                              className="acube-btn-secondary"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </button>
                          </span>
                        </span>
                      ) : (
                        <span>
                          <Link to={`/watch/${v._id}`}>{v.videotitle}</Link>{" "}
                          {isDeleted ? (
                            <span className="acube-badge acube-badge-private">
                              Deleted
                            </span>
                          ) : null}
                          <br />
                          <button
                            type="button"
                            className="acube-btn-secondary"
                            onClick={() => startEdit(v)}
                          >
                            Edit details
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
                        <option value="draft">Draft</option>
                      </select>
                    </td>
                    <td>{v.views ?? 0}</td>
                    <td>{v.Like ?? 0}</td>
                    <td>{formatDate(v)}</td>
                    <td>
                      <Link to="/studio/analytics">View analytics</Link>
                      <br />
                      {isDeleted ? (
                        <button
                          type="button"
                          className="acube-btn"
                          onClick={() => restore(v._id)}
                        >
                          Restore
                        </button>
                      ) : confirmDeleteId === v._id ? (
                        <span>
                          <button
                            type="button"
                            className="acube-btn-danger"
                            onClick={() => softDelete(v._id)}
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
                );
              })}
            </tbody>
          </table>
          <nav
            aria-label="Content pages"
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
