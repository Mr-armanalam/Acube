// Upload-wizard fix — Studio Upload wizard at /studio/upload, now a
// genuine 3 steps (the old wizard claimed "Step {n} of 3" with only 2
// steps and published from the Details screen):
//   Step 1 File    — YouTube-Studio-style modal (reference image-16):
//                    drag-and-drop + "Select files", mp4 only, max
//                    10 MiB (the server limit), with a real <video>
//                    preview once a file is picked.
//   Step 2 Details — title (required) / description / tags /
//                    thumbnail URL (validated client-side) / visibility.
//                    The thumbnail area shows a frame of the picked
//                    video, or the pasted thumbnail URL, or the shared
//                    VideoThumb placeholder — never a broken image.
//   Step 3 Review  — the video preview + entered details summary,
//                    then Publish / Save as draft.
//
// What this wizard does NOT claim any more: the old copy about a
// "resumable upload" / "upload continues in background" was false —
// nothing uploads until Publish / Save as draft in Step 3, one single
// POST /video/uploadvideo (apps/web/src/Api/index.ts). The step
// numbering is honest everywhere. Errors show the SERVER's message
// (see utils/apiError.ts), not axios's generic status text. The
// upload succeeds without Cloudinary credentials configured — the API
// stores the file locally then (see apps/api/Controllers/video.js).
import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import StudioShell from "./Studio";
import VideoThumb from "../../Component/VideoThumb";
import { useAppSelector } from "../../store";
import { useUploadVideo } from "../../query/hooks";
import {
  MAX_VIDEO_BYTES,
  isMp4File,
  isValidThumbnailUrl,
} from "../../utils/uploadLimits";
import { extractApiErrorMessage } from "../../utils/apiError";
import type { VideoVisibility } from "../../types";

function formatBytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

const STEP_LABELS = ["File", "Details", "Review & publish"] as const;

export default function UploadWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<VideoVisibility>("public");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentuser = useAppSelector((s) => s.auth.session);
  const progress = useAppSelector((s) => s.upload.progress);
  const uploadStatus = useAppSelector((s) => s.upload.status);
  const uploadError = useAppSelector((s) => s.upload.error);
  const uploadMutation = useUploadVideo();

  // Real video preview: one object URL per picked file, revoked when
  // the file changes or the wizard unmounts — never while displayed.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Step 1 modal: Escape closes it (same as the X and the backdrop).
  useEffect(() => {
    if (step !== 1) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") navigate("/studio/content");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step, navigate]);

  const pickFile = (picked: File | undefined) => {
    setError(null);
    if (!picked) return;
    if (!isMp4File(picked)) {
      setError("Only mp4 video files are supported");
      return;
    }
    if (picked.size > MAX_VIDEO_BYTES) {
      setError("Please attach a video file less than 10 MB");
      return;
    }
    setFile(picked);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const closeModal = () => navigate("/studio/content");

  const canNextFromFile = file !== null;
  const canPublish = title.trim().length > 0 && file !== null;

  const thumbnailValid = (): boolean => {
    if (!isValidThumbnailUrl(thumbnailUrl)) {
      setThumbnailError("Enter a valid thumbnail URL starting with https://");
      return false;
    }
    setThumbnailError(null);
    return true;
  };

  const goToReview = () => {
    if (title.trim().length === 0) {
      setError("A title is required.");
      return;
    }
    if (!thumbnailValid()) return;
    setError(null);
    setStep(3);
  };

  const submit = (asDraft: boolean) => {
    if (!canPublish || !file) {
      setError("A title and a video file are required.");
      return;
    }
    if (!thumbnailValid()) {
      setStep(2);
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
        // The server's message (e.g. "Failed to upload video to
        // cloudinary" or the VALIDATION_ERROR field details), not
        // axios's generic "Request failed with status code 400".
        onError: (err) => setError(extractApiErrorMessage(err)),
      },
    );
  };

  if (done) {
    // The upload response carries the created video id — link straight
    // to the new video (Watch), not just to Content.
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
        Step {step} of 3 — {STEP_LABELS[step - 1]} · mp4, max 10 MB
      </p>

      {step === 1 ? (
        <div
          className="upload-modal-overlay"
          role="presentation"
          onClick={closeModal}
        >
          <div
            className="upload-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Upload videos"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="upload-modal-header">
              <h2>Upload videos</h2>
              <button
                type="button"
                className="upload-modal-close"
                aria-label="Close upload"
                onClick={closeModal}
              >
                ✕
              </button>
            </div>
            {!file ? (
              <div
                className={`upload-dropzone${dragOver ? " upload-dropzone-active" : ""}`}
                data-testid="upload-dropzone"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="upload-drop-circle" aria-hidden="true">
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 16V4m0 0 5 5m-5-5L7 9"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M4 20h16"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <p>Drag and drop video files to upload</p>
                <button
                  type="button"
                  className="upload-select-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  Select files
                </button>
                <p className="upload-modal-hint">MP4 only · max 10 MB</p>
              </div>
            ) : (
              <div className="upload-picked">
                {previewUrl ? (
                  <video
                    className="upload-preview-video"
                    src={previewUrl}
                    controls
                    aria-label={`Preview of ${file.name}`}
                  />
                ) : null}
                <p>
                  {file.name} · {formatBytes(file.size)}
                </p>
                <div className="upload-picked-actions">
                  <button
                    type="button"
                    className="acube-btn-secondary"
                    onClick={() => {
                      setFile(null);
                      setError(null);
                    }}
                  >
                    Choose a different file
                  </button>
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
            )}
            {error ? (
              <p role="alert" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4"
              aria-label="Choose video file"
              className="upload-file-input"
              onChange={(e) => {
                pickFile(e.target.files?.[0]);
                // Allow picking the same file again after an error.
                e.target.value = "";
              }}
            />
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div>
          <div className="studio-file-card" style={{ marginBottom: 16 }}>
            <strong>{file?.name}</strong>
            <p>{file ? formatBytes(file.size) : ""} · mp4 · max 10 MB</p>
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
                    setThumbnailError(null);
                  }}
                  placeholder="https://…"
                />
              </label>
              {thumbnailError ? (
                <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>
                  {thumbnailError}
                </p>
              ) : null}
            </div>
            <div>
              <div className="studio-thumb-preview" aria-label="Thumbnail preview">
                {thumbnailUrl && isValidThumbnailUrl(thumbnailUrl) ? (
                  <VideoThumb
                    src={thumbnailUrl}
                    style={{ width: "100%", height: "100%", aspectRatio: "16 / 9" }}
                  />
                ) : previewUrl ? (
                  <video
                    src={previewUrl}
                    muted
                    preload="metadata"
                    aria-label="Preview of the picked video"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <VideoThumb
                    src={undefined}
                    style={{ width: "100%", height: "100%", aspectRatio: "16 / 9" }}
                  />
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
          {error ? (
            <p role="alert" style={{ color: "var(--danger)" }}>
              {error}
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
              disabled={title.trim().length === 0}
              onClick={goToReview}
            >
              Continue to review
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div>
          <div className="studio-upload-layout">
            <div>
              {previewUrl ? (
                <video
                  className="upload-preview-video"
                  src={previewUrl}
                  controls
                  aria-label={`Preview of ${file?.name ?? "the picked video"}`}
                />
              ) : null}
              {uploadStatus === "uploading" ? (
                <div style={{ marginTop: 12 }}>
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
                  <p style={{ color: "var(--text-2)" }}>{progress}% uploading…</p>
                </div>
              ) : null}
            </div>
            <dl className="upload-review">
              <div>
                <dt>Title</dt>
                <dd>{title}</dd>
              </div>
              <div>
                <dt>File</dt>
                <dd>
                  {file?.name} · {file ? formatBytes(file.size) : ""}
                </dd>
              </div>
              <div>
                <dt>Description</dt>
                <dd>{description.trim() ? description : "—"}</dd>
              </div>
              <div>
                <dt>Tags</dt>
                <dd>
                  {tags
                    .split(",")
                    .map((t) => t.trim())
                    .filter((t) => t.length > 0)
                    .join(", ") || "—"}
                </dd>
              </div>
              <div>
                <dt>Visibility</dt>
                <dd>{visibility.charAt(0).toUpperCase() + visibility.slice(1)}</dd>
              </div>
              <div>
                <dt>Thumbnail URL</dt>
                <dd>{thumbnailUrl.trim() ? thumbnailUrl.trim() : "—"}</dd>
              </div>
            </dl>
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
              onClick={() => setStep(2)}
            >
              Back to details
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
