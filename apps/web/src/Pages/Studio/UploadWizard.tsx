// Phase 5 fix — Upload wizard (preview screen E) at /studio/upload:
// 3 steps (file → details → publish), reusing the Phase 3 upload
// hardening (same POST /video/uploadvideo endpoint, same 10 MB / mp4
// validation via the shared upload flow), with resumable progress
// display from the upload slice, Title (required) / Description /
// Tags, thumbnail preview, visibility Public/Private/Draft, Publish +
// Save as draft. NOTE: description/tags/visibility are sent with the
// upload form; persisting them is the backend worker's part of the
// contract (Videofile gains description/tags) — the wizard sends them
// and never invents a success the server did not return.
import React, { useState } from "react";
import { Link } from "react-router";
import StudioShell from "./Studio";
import { useAppSelector } from "../../store";
import { useUploadVideo } from "../../query/hooks";
import { MAX_VIDEO_BYTES } from "../Videoupload/Videoupload";
import type { VideoVisibility } from "../../types";

function formatBytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export default function UploadWizard() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [visibility, setVisibility] = useState<VideoVisibility>("public");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
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
    return (
      <StudioShell>
        <h1>Upload video</h1>
        <div className="acube-empty" role="status">
          <p style={{ fontWeight: 700, color: "var(--text)" }}>
            Your video was uploaded.
          </p>
          <p>{title}</p>
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
        {step === 1 ? "File" : step === 2 ? "Details" : "Publish"} ·
        resumable upload, server-validated
      </p>

      {step === 1 ? (
        <div className="studio-form">
          <label>
            Video file · mp4, less than 10 MB
            <input
              type="file"
              accept="video/mp4,video/*"
              aria-label="Choose video file"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </label>
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
        <div className="studio-form">
          <label>
            Title (required)
            <input
              className="acube-input"
              aria-label="Title"
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
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
              onChange={(e) => setThumbnailUrl(e.target.value)}
              placeholder="https://…"
            />
          </label>
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt="Thumbnail preview"
              style={{ width: 240, aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 12 }}
            />
          ) : null}
          <div style={{ display: "flex", gap: 8 }}>
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
              disabled={!title.trim()}
              onClick={() => setStep(3)}
            >
              Continue to publish
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="studio-form">
          <p>
            <strong>{file?.name}</strong> ·{" "}
            {file ? formatBytes(file.size) : ""} · Title: {title || "—"}
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
              <p>{progress}% uploaded — upload continues in background</p>
            </div>
          ) : null}
          <fieldset style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
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
          {error || uploadError ? (
            <p role="alert" style={{ color: "var(--danger)" }}>
              {error ?? uploadError}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="acube-btn-secondary"
              onClick={() => setStep(2)}
            >
              Back
            </button>
            <button
              type="button"
              className="acube-btn-secondary"
              disabled={!canPublish || uploadMutation.isPending}
              onClick={() => submit(true)}
            >
              Save as draft
            </button>
            <button
              type="button"
              className="acube-btn"
              disabled={!canPublish || uploadMutation.isPending}
              onClick={() => submit(false)}
            >
              Publish
            </button>
          </div>
        </div>
      ) : null}
    </StudioShell>
  );
}
