// Phase 5 fix — Save menu on the Watch page: save the video to the
// Library "Saved" shelf (POST /studio/library, kind "saved") and add
// it to / remove it from any of the viewer's playlists, or create a
// new playlist. This is how kind:"saved" rows become creatable in the
// UI (previously only a direct API call could create one).
import React, { useState } from "react";
import {
  useAddLibraryEntry,
  useCreatePlaylist,
  useRemoveLibraryEntry,
  useStudioPlaylists,
  useUpdatePlaylist,
} from "../../query/hooks";
import { useAppSelector } from "../../store";

export default function SaveMenu({ videoid }: { videoid: string }) {
  const currentuser = useAppSelector((s) => s.auth.session);
  const playlists = useStudioPlaylists();
  const addLibrary = useAddLibraryEntry();
  const removeLibrary = useRemoveLibraryEntry();
  const updatePlaylist = useUpdatePlaylist();
  const createPlaylist = useCreatePlaylist();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  if (!currentuser) return null;

  const toggleSaved = () => {
    if (saved) {
      removeLibrary.mutate({ videoid, kind: "saved" });
      setSaved(false);
    } else {
      addLibrary.mutate({ videoid, kind: "saved" });
      setSaved(true);
    }
  };

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className="acube-btn-secondary"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Save
      </button>
      {open ? (
        <div
          className="acube-card"
          style={{
            position: "absolute",
            zIndex: 10,
            minWidth: 260,
            padding: 12,
            marginTop: 8,
          }}
          role="menu"
          aria-label="Save to"
        >
          <button
            type="button"
            className="acube-btn-secondary"
            onClick={toggleSaved}
          >
            {saved ? "✓ Saved to library" : "Save to library"}
          </button>
          <p style={{ margin: "12px 0 4px", fontWeight: 700 }}>
            Save to playlist
          </p>
          {playlists.isLoading ? (
            <p>Loading playlists…</p>
          ) : (playlists.data?.length ?? 0) === 0 ? (
            <p style={{ color: "var(--text-2)" }}>No playlists yet.</p>
          ) : (
            playlists.data?.map((p) => {
              const inPlaylist = p.videoIds.includes(videoid);
              return (
                <label
                  key={p._id}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    padding: "4px 0",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={inPlaylist}
                    onChange={() => {
                      if (inPlaylist) {
                        updatePlaylist.mutate({
                          id: p._id,
                          removeVideoIds: [videoid],
                        });
                      } else {
                        updatePlaylist.mutate({
                          id: p._id,
                          addVideoIds: [videoid],
                        });
                      }
                    }}
                  />
                  {p.title}
                </label>
              );
            })
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newTitle.trim()) return;
              createPlaylist.mutate(
                { title: newTitle.trim(), visibility: "private" },
                {
                  onSuccess: (created) => {
                    updatePlaylist.mutate({
                      id: created._id,
                      addVideoIds: [videoid],
                    });
                    setNewTitle("");
                  },
                },
              );
            }}
            style={{ display: "flex", gap: 8, marginTop: 8 }}
          >
            <input
              className="acube-input"
              aria-label="New playlist title"
              placeholder="New playlist"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <button type="submit" className="acube-btn">
              Create
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
