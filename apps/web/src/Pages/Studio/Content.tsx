// Content cleanup — Studio Content (preview image 20): a clean table
// (Video thumbnail + title / Visibility pill / Date / Views / Likes /
// pencil + "⋯" icon buttons only). All row actions live in a popup
// menu — Edit details opens a modal, Change visibility opens a
// chooser, View analytics navigates to the per-video page
// (/studio/analytics?video=<id>), Delete soft-deletes; restore is
// indefinite — the API enforces no 30-day expiry. No per-row buttons,
// no per-row visibility dropdown, no inline row editing. Draft rows
// show "—" for date/views/likes.
// Bulk-select is a slim hover checkbox column with a bulk bar that
// appears only while a selection exists.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import StudioShell from "./Studio";
import VideoThumb, { deterministicThumbGradient } from "../../Component/VideoThumb";
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
import { isValidThumbnailUrl } from "../../utils/uploadLimits";
import type { Video, VideoVisibility } from "../../types";

const VISIBILITIES: VideoVisibility[] = [
  "public",
  "unlisted",
  "private",
  "draft",
];

const formatDate = (v: Video): string => {
  // Drafts are unpublished: the preview shows "—", not a date.
  if ((v.visibility ?? "public") === "draft") return "—";
  const raw = v.createdAt ?? v.createdat ?? "";
  const d = new Date(raw);
  if (!raw || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

const formatCount = (v: Video, value: number | undefined): string =>
  (v.visibility ?? "public") === "draft" ? "—" : String(value ?? 0);

type MenuView = "actions" | "visibility" | "delete";

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
  // Row menu: which video's popup is open, and which view it shows.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuView, setMenuView] = useState<MenuView>("actions");
  // Edit-details modal state (never inline row editing).
  const [editing, setEditing] = useState<Video | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editThumbnailUrl, setEditThumbnailUrl] = useState("");
  const [editThumbnailError, setEditThumbnailError] = useState<string | null>(
    null,
  );
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

  const closeMenu = () => {
    setMenuFor(null);
    setMenuView("actions");
    setMenuAnchor(null);
    setMenuTop(null);
  };
  // The menu is fixed-positioned at the component root (see below), NOT
  // inside the row: the table wrapper's overflow-x: auto clips any
  // absolutely-positioned descendant, so a menu inside the row was cut
  // to a sliver whenever the row sat near the wrapper's bottom edge
  // (always, with a single video). The anchor is the clicked button's
  // viewport rect; the menu flips upward when it would run off the
  // bottom of the viewport (measured, not guessed).
  const [menuAnchor, setMenuAnchor] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const [menuTop, setMenuTop] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuVideo = useMemo(
    () => items.find((item) => item._id === menuFor) ?? null,
    [items, menuFor],
  );
  const openMenu = (id: string, e: React.MouseEvent<HTMLButtonElement>) => {
    if (menuFor === id) {
      closeMenu();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    menuButtonRef.current = e.currentTarget;
    setMenuAnchor({
      top: rect.bottom + 4,
      right: Math.max(0, window.innerWidth - rect.right),
    });
    setMenuTop(null);
    setMenuFor(id);
    setMenuView("actions");
  };
  useLayoutEffect(() => {
    if (!menuFor || !menuAnchor) return;
    const el = menuRef.current;
    if (!el) return;
    const height = el.getBoundingClientRect().height;
    const top = Math.min(
      menuAnchor.top,
      Math.max(8, window.innerHeight - 8 - height),
    );
    setMenuTop((prev) => (prev === top ? prev : top));
  }, [menuFor, menuView, menuAnchor]);
  // A fixed menu detaches from its row on scroll/resize — re-anchor
  // it to the button instead (it follows the row). Scroll events are
  // delivered asynchronously, so the scroll-into-view that precedes a
  // click can arrive AFTER the menu opens: closing on scroll would
  // kill the menu on every mobile open (the button starts off-screen
  // in the scrollable table). Re-anchoring is immune to that race —
  // the stale event just recomputes the same position.
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!menuFor) return;
    let raf = 0;
    const reanchor = () => {
      const btn = menuButtonRef.current;
      if (!btn || !btn.isConnected) {
        closeMenu();
        return;
      }
      const rect = btn.getBoundingClientRect();
      setMenuAnchor({
        top: rect.bottom + 4,
        right: Math.max(0, window.innerWidth - rect.right),
      });
      setMenuTop(null);
    };
    const onMove = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        reanchor();
      });
    };
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [menuFor]);

  // Escape closes the menu and the modal; a backdrop click closes them too.
  useEffect(() => {
    if (!menuFor && !editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenu();
        setEditing(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuFor, editing]);

  const openEdit = (v: Video) => {
    closeMenu();
    setEditing(v);
    setEditTitle(v.videotitle);
    setEditDescription(v.description ?? "");
    setEditTags((v.tags ?? []).join(", "));
    setEditThumbnailUrl(v.thumbnailUrl ?? v.thumbnail ?? "");
  };
  const saveEdit = () => {
    if (!editing || !editTitle.trim()) return;
    // Same URL rule as the upload wizard: an invalid URL is an inline
    // error, never a request (the server's strict update schema would
    // 400 it). A thumbnail FILE upload is not offered here yet — PATCH
    // /video/:id is JSON-only, so a file part needs a backend change
    // first (follow-up, not a half-wired input).
    if (!isValidThumbnailUrl(editThumbnailUrl)) {
      setEditThumbnailError(
        "Enter a valid thumbnail URL starting with https://",
      );
      return;
    }
    setEditThumbnailError(null);
    updateMutation.mutate({
      id: editing._id,
      title: editTitle.trim(),
      description: editDescription.trim() || undefined,
      tags: editTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      thumbnailUrl: editThumbnailUrl.trim() || undefined,
    });
    setEditing(null);
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
    closeMenu();
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
    closeMenu();
  };

  return (
    <StudioShell>
      <h1>Channel content</h1>
      <p style={{ color: "var(--text-2)" }}>
        {videos.data ? `${videos.data.total} videos · ` : ""}
        search, filter by visibility, bulk-select
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
      </div>
      {/* Bulk action bar: only while a selection exists. */}
      {selectedCount > 0 ? (
        <div className="studio-bulk-bar" role="status">
          <span>
            <strong>{selectedCount}</strong> selected
          </span>
          {bulkConfirm ? (
            <>
              <button
                type="button"
                className="acube-btn-danger"
                onClick={bulkDelete}
              >
                Confirm delete {selectedCount} selected
              </button>
              <button
                type="button"
                className="acube-btn-secondary"
                onClick={() => setBulkConfirm(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="acube-btn-danger"
              onClick={() => setBulkConfirm(true)}
            >
              Delete {selectedCount} selected
            </button>
          )}
          <button
            type="button"
            className="acube-btn-secondary"
            onClick={() => setSelected(new Set())}
          >
            Clear selection
          </button>
        </div>
      ) : null}
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
          <div className="studio-table-wrap">
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
                <th>Date</th>
                <th>Views</th>
                <th>Likes</th>
                <th aria-label="Row actions" />
              </tr>
            </thead>
            <tbody>
              {items.map((v) => {
                // A row is deleted when the SERVER says so (deletedAt
                // set) — not only when this session deleted it.
                const isDeleted =
                  v.deletedAt != null || deletedIds.has(v._id);
                const menuOpen = menuFor === v._id;
                return (
                  <tr key={v._id}>
                    <td>
                      <input
                        className="studio-row-select"
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
                      <div className="studio-video-cell">
                        <VideoThumb
                          className="studio-row-thumb"
                          src={v.thumbnailUrl ?? v.thumbnail ?? ""}
                          fallbackBackground={deterministicThumbGradient(
                            v._id,
                          )}
                        />
                        <span className="studio-video-title">
                          <Link to={`/watch/${v._id}`}>{v.videotitle}</Link>{" "}
                          {isDeleted ? (
                            <span className="acube-badge acube-badge-private">
                              Deleted
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </td>
                    <td>
                      <VisibilityBadge visibility={v.visibility} />
                    </td>
                    <td>{formatDate(v)}</td>
                    <td>{formatCount(v, v.views)}</td>
                    <td>{formatCount(v, v.Like)}</td>
                    <td>
                      <div className="studio-row-actions">
                        <button
                          type="button"
                          className="studio-icon-btn"
                          aria-label={`Row actions for ${v.videotitle}`}
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          onClick={(e) => openMenu(v._id, e)}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="studio-icon-btn"
                          aria-label={`More actions for ${v.videotitle}`}
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          onClick={(e) => openMenu(v._id, e)}
                        >
                          ⋯
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <p className="studio-note">
            Row actions: use the ✎ or ⋯ button on a row —{" "}
            <strong>Edit details</strong> ·{" "}
            <strong>Change visibility</strong> ·{" "}
            <strong>View analytics</strong> · <strong>Delete</strong>{" "}
            (soft-delete, restorable). Every action is ownership-checked
            server-side.
          </p>
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
      {/* Menu backdrop: a click anywhere outside the open menu closes it. */}
      {menuFor ? (
        <div
          className="studio-menu-backdrop"
          aria-hidden="true"
          onClick={closeMenu}
        />
      ) : null}
      {/* Row menu, fixed-positioned at the root (see openMenu): it must
          never live inside the table, whose scroll wrapper clips it. */}
      {menuFor && menuVideo && menuAnchor ? (
        <div
          ref={menuRef}
          className="studio-menu"
          role="menu"
          aria-label={`Actions for ${menuVideo.videotitle}`}
          style={{
            top: menuTop ?? menuAnchor.top,
            right: menuAnchor.right,
          }}
        >
          {menuView === "actions" ? (
            <>
              <button
                type="button"
                className="studio-menu-item"
                role="menuitem"
                onClick={() => openEdit(menuVideo)}
              >
                Edit details
              </button>
              <button
                type="button"
                className="studio-menu-item"
                role="menuitem"
                onClick={() => setMenuView("visibility")}
              >
                Change visibility
              </button>
              <Link
                to={`/studio/analytics?video=${menuVideo._id}`}
                className="studio-menu-item"
                role="menuitem"
                onClick={closeMenu}
              >
                View analytics
              </Link>
              {menuVideo.deletedAt != null ||
              deletedIds.has(menuVideo._id) ? (
                <button
                  type="button"
                  className="studio-menu-item"
                  role="menuitem"
                  onClick={() => restore(menuVideo._id)}
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  className="studio-menu-item studio-menu-item-danger"
                  role="menuitem"
                  onClick={() => setMenuView("delete")}
                >
                  Delete
                </button>
              )}
            </>
          ) : menuView === "visibility" ? (
            <>
              <p className="studio-menu-title">Change visibility</p>
              {VISIBILITIES.map((vis) => (
                <button
                  key={vis}
                  type="button"
                  className="studio-menu-item"
                  role="menuitemradio"
                  aria-checked={
                    (menuVideo.visibility ?? "public") === vis
                  }
                  onClick={() => {
                    updateMutation.mutate({
                      id: menuVideo._id,
                      visibility: vis,
                    });
                    closeMenu();
                  }}
                >
                  {vis.charAt(0).toUpperCase() + vis.slice(1)}
                  {(menuVideo.visibility ?? "public") === vis ? (
                    <span className="studio-menu-check" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                </button>
              ))}
              <button
                type="button"
                className="studio-menu-item"
                role="menuitem"
                onClick={() => setMenuView("actions")}
              >
                ← Back
              </button>
            </>
          ) : (
            <>
              <p className="studio-menu-title">Delete this video?</p>
              <p className="studio-menu-note">
                Soft-delete — restorable any time from this menu.
              </p>
              <button
                type="button"
                className="studio-menu-item studio-menu-item-danger"
                role="menuitem"
                onClick={() => softDelete(menuVideo._id)}
              >
                Confirm delete
              </button>
              <button
                type="button"
                className="studio-menu-item"
                role="menuitem"
                onClick={closeMenu}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      ) : null}
      {/* Edit details modal — never inline row editing. */}
      {editing ? (
        <div
          className="studio-modal-overlay"
          role="presentation"
          onClick={() => setEditing(null)}
        >
          <div
            className="studio-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Edit details for ${editing.videotitle}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="studio-modal-header">
              <h2>Edit details</h2>
              <button
                type="button"
                className="studio-modal-close"
                aria-label="Close edit details"
                onClick={() => setEditing(null)}
              >
                ✕
              </button>
            </div>
            <div className="studio-modal-form">
              <label className="studio-field-label">
                Video title
                <input
                  className="acube-input"
                  aria-label="Video title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </label>
              <label className="studio-field-label">
                Video description
                <textarea
                  className="acube-input"
                  aria-label="Video description"
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
              </label>
              <label className="studio-field-label">
                Video tags
                <input
                  className="acube-input"
                  aria-label="Video tags"
                  placeholder="Tags, comma separated"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                />
              </label>
              <label className="studio-field-label">
                Thumbnail URL
                <input
                  className="acube-input"
                  aria-label="Thumbnail URL"
                  placeholder="Thumbnail URL"
                  value={editThumbnailUrl}
                  onChange={(e) => {
                    setEditThumbnailUrl(e.target.value);
                    setEditThumbnailError(null);
                  }}
                />
              </label>
              {editThumbnailError ? (
                <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>
                  {editThumbnailError}
                </p>
              ) : null}
              <div className="studio-modal-actions">
                <button
                  type="button"
                  className="acube-btn"
                  onClick={saveEdit}
                  disabled={!editTitle.trim()}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="acube-btn-secondary"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </StudioShell>
  );
}
