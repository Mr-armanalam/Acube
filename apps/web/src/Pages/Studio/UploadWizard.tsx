// Phase 5 match-preview — Upload wizard (preview image 12) at
// /studio/upload: step 1 picks the file, step 2 is Details — file
// card with progress, Title (required) / Description / Tags,
// thumbnail preview, Visibility Public/Private/Draft, Publish +
// Save as draft on the SAME screen, exactly as the preview shows.
// CORRECTION to the preview: its example file is 84 MB, but the
// enforced limit is 10 MB — the wizard rejects anything over 10 MB,
// states the 10 MB limit, and never presents an 84 MB file as
// acceptable. Same POST /video/uploadvideo endpoint and 10 MB / mp4
// validation as the Phase 3 upload hardening. Description/tags/
// visibility are sent with the upload form; the wizard never invents
// a success the server did not return.
import React, { useState } from "react";
import { Link } from "react-router";
import StudioShell from "./Studio";
import { useAppSelector } from "../../store";
import { useUploadVideo } from "../../query/hooks";
import { MAX_VIDEO_BYTES } from "../../utils/uploadLimits";
import type { VideoVisibility } from "../../types";

function formatBytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export default function UploadWizard() {
  const [step, setStep] = useState<1 | 2>(1);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [visibility, setVisibility] = useState<VideoVisibility>("public");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [thumbBroken, setThumbBroken] = useState(false);
  const currentuser = useAppSelector((s) => s.auth.session);
  const progress = useAppSelector((s) => s.upload.progress);
  const uploadStatus = useAppSelector((s) => s.upload.status);
  const uploadError = useAppSelector((s) => s.upload.error);
  const uploadMutation = useUploadVideo();

  const pickFile = (picked: File | undefined) => {
    setError(null);
    if (!picked) return;
    if (picked.size > MAX_VIDEO_BYTES) {
      setError("Please attach a video file less than 10 MB");
      return;
    }
    setFile(picked);
  };

  const canNextFromFile = file !== null;
  const canPublish = title.trim().length > 0 && file !== null;

  const submit = (asDraft: boolean) => {
    if (!canPublish || !file) {
      setError("A title and a video file are required.");
      return;
    }
    setError(null);
    const filedata = new FormData();
    filedata.append("file", file);
    filedata.append("title", title.trim());
    filedata.append("chanel", currentuser?.result?._id ?? "");
    filedata.append("uploader", currentuser?.result.name ?? "");
    filedata.append("description", description.trim());
    filedata.append("tags", tags);
    if (thumbnailUrl.trim()) filedata.append("thumbnailUrl", thumbnailUrl.trim());
    filedata.append("visibility", asDraft ? "draft" : visibility);
    uploadMutation.mutate(
      { filedata },
      {
        onSuccess: () => setDone(true),
        onError: (err) =>
          setError(err instanceof Error ? err.message : "Upload failed"),
      },
    );
  };

  if (done) {
    // Phase 5 fix: the upload response carries the created video id —
    // link straight to the new video (Watch), not just to Content.
    const uploadedId = uploadMutation.data?.video?.id;
    return (
      <StudioShell>
        <h1>Upload video</h1>
        <div className="acube-empty" role="status">
          <p style={{ fontWeight: 700, color: "var(--text)" }}>
            Your video was uploaded.
          </p>
          <p>{title}</p>
          {uploadedId ? (
            <Link to={`/watch/${uploadedId}`} className="acube-btn">
              Watch video
            </Link>
          ) : null}{" "}
          <Link to="/studio/content" className="acube-btn">
            View in Content
          </Link>
        </div>
      </StudioShell>
    );
  }

  return (
    <StudioShell>
      <h1>Upload video</h1>
      <p style={{ color: "var(--text-2)" }}>
        Step {step} of 3 —{" "}
        {step === 1 ? "File" : "Details"} · resumable upload,
        server-validated · max 10 MB
      </p>

      {step === 1 ? (
        <div className="studio-form">
          <label>
            Video file · mp4, max 10 MB
            <input
              type="file"
              accept="video/mp4,video/*"
              aria-label="Choose video file"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </label>
          <p style={{ color: "var(--text-2)", margin: 0 }}>
            Files over 10 MB are rejected — the upload limit is 10 MB.
          </p>
          {file ? (
            <p>
              {file.name} · {formatBytes(file.size)}
            </p>
          ) : null}
          {error ? (
            <p role="alert" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          ) : null}
          <div>
            <button
              type="button"
              className="acube-btn"
              disabled={!canNextFromFile}
              onClick={() => setStep(2)}
            >
              Continue to details
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div>
          <div className="studio-file-card" style={{ marginBottom: 16 }}>
            <strong>{file?.name}</strong>
            <p>
              {file ? formatBytes(file.size) : ""} · max 10 MB · upload
              continues in background
            </p>
            {uploadStatus === "uploading" ? (
              <div>
                <div
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Upload progress"
                  style={{ height: 8, borderRadius: 4, background: "var(--surface-2)" }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: "100%",
                      borderRadius: 4,
                      background: "var(--accent)",
                    }}
                  />
                </div>
                <p>
                  {progress}% · {file ? formatBytes(file.size) : ""} · upload
                  continues in background
                </p>
              </div>
            ) : (
              <div
                role="progressbar"
                aria-valuenow={0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Upload progress"
                style={{ height: 8, borderRadius: 4, background: "var(--surface-2)" }}
              >
                <div
                  style={{ width: "0%", height: "100%", borderRadius: 4, background: "var(--accent)" }}
                />
              </div>
            )}
          </div>
          <div className="studio-upload-layout">
            <div className="studio-form" style={{ maxWidth: "none" }}>
              <label>
                Title (required)
                <input
                  className="acube-input"
                  aria-label="Title"
                  value={title}
                  maxLength={100}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="How I plan my week in 20 minutes"
                />
              </label>
              <label>
                Description
                <textarea
                  className="acube-input"
                  aria-label="Description"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="My exact Sunday planning routine…"
                />
              </label>
              <label>
                Tags · comma separated
                <input
                  className="acube-input"
                  aria-label="Tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="planning, productivity, routine"
                />
              </label>
              <label>
                Thumbnail URL
                <input
                  className="acube-input"
                  aria-label="Thumbnail URL"
                  value={thumbnailUrl}
                  onChange={(e) => {
                    setThumbnailUrl(e.target.value);
                    setThumbBroken(false);
                  }}
                  placeholder="https://…"
                />
              </label>
            </div>
            <div>
              <div className="studio-thumb-preview" aria-label="Thumbnail preview">
                {thumbnailUrl && !thumbBroken ? (
                  <img
                    src={thumbnailUrl}
                    alt="Thumbnail preview"
                    onError={() => setThumbBroken(true)}
                  />
                ) : (
                  <span className="play" aria-hidden="true">▶</span>
                )}
                <span className="preview-badge">PREVIEW</span>
              </div>
              <fieldset
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 12,
                  marginTop: 12,
                }}
              >
                <legend>Visibility</legend>
                {(["public", "private", "draft"] as VideoVisibility[]).map((v) => (
                  <label
                    key={v}
                    style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                  >
                    <input
                      type="radio"
                      name="visibility"
                      value={v}
                      checked={visibility === v}
                      onChange={() => setVisibility(v)}
                    />
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </label>
                ))}
              </fieldset>
            </div>
          </div>
          {error || uploadError ? (
            <p role="alert" style={{ color: "var(--danger)" }}>
              {error ?? uploadError}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
            <button
              type="button"
              className="acube-btn-secondary"
              onClick={() => setStep(1)}
            >
              Back
            </button>
            <button
              type="button"
              className="acube-btn"
              disabled={!canPublish || uploadMutation.isPending}
              onClick={() => submit(false)}
            >
              Publish
            </button>
            <button
              type="button"
              className="acube-btn-secondary"
              disabled={!canPublish || uploadMutation.isPending}
              onClick={() => submit(true)}
            >
              Save as draft
            </button>
          </div>
        </div>
      ) : null}
    </StudioShell>
  );
}
