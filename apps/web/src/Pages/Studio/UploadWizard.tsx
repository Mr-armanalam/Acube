// Upload-wizard fix — Studio Upload wizard at /studio/upload, now a
// genuine 3 steps (the old wizard claimed "Step {n} of 3" with only 2
// steps and published from the Details screen):
//   Step 1 File    — YouTube-Studio-style modal (reference image-16):
//                    drag-and-drop + "Select files", mp4 only, max
//                    10 MiB (the server limit), with a real <video>
//                    preview once a file is picked.
//   Step 2 Details — title (required) / description / tags /
//                    thumbnail (three ways, in precedence order:
//                    a local JPG/PNG file ≤ 5 MB wins; else a pasted
//                    image URL; else one of 3 auto-generated frames
//                    extracted client-side from the picked video at
//                    5%/50%/90% of its duration; else nothing — the
//                    server generates a thumbnail after upload) /
//                    visibility. The thumbnail area shows the
//                    effective choice (file preview, URL, chosen
//                    frame, or a frame of the picked video), or the
//                    shared VideoThumb placeholder — never a broken
//                    image, never a fake frame.
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
import {
  SUGGESTED_FRAME_INDEX,
  dataUrlToFile,
  describeThumbnailChoice,
  extractVideoFrames,
  resolveThumbnailChoice,
  validateImageFile,
  type ThumbnailChoice,
} from "../../utils/thumbnail";
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
  // Local thumbnail image (JPG/PNG ≤ 5 MB) — wins over the pasted URL.
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailFilePreviewUrl, setThumbnailFilePreviewUrl] = useState<
    string | null
  >(null);
  const [thumbnailFileError, setThumbnailFileError] = useState<string | null>(
    null,
  );
  // Auto-generated frames, extracted client-side from the picked video
  // (5%/50%/90% of duration). null selection = "auto" — the server
  // generates the thumbnail after upload; the middle frame is only
  // badged "Suggested", never silently treated as chosen.
  const [frames, setFrames] = useState<string[]>([]);
  const [framesStatus, setFramesStatus] = useState<
    "idle" | "loading" | "ready" | "failed"
  >("idle");
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number | null>(
    null,
  );
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

  // Live preview of the chosen thumbnail image — same revoke pattern.
  useEffect(() => {
    if (!thumbnailFile) {
      setThumbnailFilePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(thumbnailFile);
    setThumbnailFilePreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [thumbnailFile]);

  // Auto frames: extracted once the wizard reaches Step 2 (the video
  // file is picked in Step 1, so nothing exists to sample before).
  // A failure is silent-by-design here — the note below the picker
  // says the server will generate the thumbnail; no fake frames are
  // ever shown.
  useEffect(() => {
    if (step !== 2 || !file) return;
    let cancelled = false;
    setFrames([]);
    setSelectedFrameIndex(null);
    setFramesStatus("loading");
    void extractVideoFrames(file)
      .then((extracted) => {
        if (cancelled) return;
        setFrames(extracted);
        setFramesStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setFrames([]);
        setFramesStatus("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [step, file]);

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

  const pickThumbnailFile = (picked: File | undefined) => {
    setThumbnailFileError(null);
    if (!picked) return;
    const problem = validateImageFile(picked);
    if (problem) {
      setThumbnailFileError(problem);
      return;
    }
    setThumbnailFile(picked);
  };

  // Effective thumbnail, in precedence order (utils/thumbnail.ts):
  // file > URL > clicked auto frame > server-generated.
  const thumbnailChoice: ThumbnailChoice = resolveThumbnailChoice({
    file: thumbnailFile,
    url: thumbnailUrl,
    frameDataUrls: frames,
    selectedFrameIndex,
  });

  const closeModal = () => navigate("/studio/content");

  const canNextFromFile = file !== null;
  const canPublish = title.trim().length > 0 && file !== null;

  const thumbnailValid = (): boolean => {
    // A chosen file wins over the URL, so a (possibly invalid) URL
    // alongside a file never blocks the wizard — it is simply ignored.
    if (thumbnailFile) {
      setThumbnailError(null);
      return true;
    }
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
    // Thumbnail, in precedence order. A file part is sent ONLY for an
    // explicit choice (picked image, or a clicked auto frame converted
    // to a JPEG file) — the default "auto" state sends nothing extra.
    // Field name "thumbnail" is the landed backend contract
    // (upload.fields() in Routes/video.js); a pasted URL is appended
    // only when no file part was sent.
    if (thumbnailChoice.kind === "file") {
      filedata.append("thumbnail", thumbnailChoice.file);
    } else if (thumbnailChoice.kind === "frame") {
      const frameFile = dataUrlToFile(
        thumbnailChoice.dataUrl,
        "thumbnail.jpg",
      );
      if (frameFile) {
        // The frame IMAGE is the choice — the backend stores the
        // uploaded file as the thumbnail, so no frame index needs to
        // be sent (the backend does not consume one; its own
        // candidates use the same 5%/50%/90% fractions).
        filedata.append("thumbnail", frameFile);
      }
    } else if (thumbnailChoice.kind === "url") {
      filedata.append("thumbnailUrl", thumbnailChoice.url);
    }
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
    // to the new video (Watch), not just to Content. It also carries
    // the thumbnail the server stored (thumbnailUrl, else the first
    // auto-generated candidate) — show that, never the pre-publish
    // guess: if the server stored nothing, show no thumbnail at all.
    const uploadedId = uploadMutation.data?.video?.id;
    const uploadedThumbnail =
      uploadMutation.data?.video?.thumbnailUrl ??
      uploadMutation.data?.video?.autoThumbnails?.[0] ??
      null;
    return (
      <StudioShell>
        <h1>Upload video</h1>
        <div className="acube-empty" role="status">
          <p style={{ fontWeight: 700, color: "var(--text)" }}>
            Your video was uploaded.
          </p>
          <p>{title}</p>
          {uploadedThumbnail ? (
            <div style={{ maxWidth: 320, margin: "0 auto 12px" }}>
              <VideoThumb
                src={uploadedThumbnail}
                style={{ width: "100%", aspectRatio: "16 / 9" }}
              />
            </div>
          ) : null}
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
              <div>
                <label htmlFor="thumbnail-file-input">
                  Or upload a thumbnail image (JPG/PNG, max 5 MB)
                </label>
                <input
                  id="thumbnail-file-input"
                  type="file"
                  accept="image/jpeg,image/png"
                  aria-label="Upload thumbnail image"
                  onChange={(e) => {
                    pickThumbnailFile(e.target.files?.[0]);
                    // Allow picking the same file again after an error.
                    e.target.value = "";
                  }}
                />
                {thumbnailFile ? (
                  <p style={{ margin: "4px 0 0" }}>
                    {thumbnailFile.name} ·{" "}
                    <button
                      type="button"
                      className="acube-btn-secondary"
                      onClick={() => setThumbnailFile(null)}
                    >
                      Remove image
                    </button>
                  </p>
                ) : null}
                {thumbnailFileError ? (
                  <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>
                    {thumbnailFileError}
                  </p>
                ) : null}
              </div>
              <p style={{ color: "var(--text-2)", margin: 0 }}>
                A chosen image wins over the pasted URL; the URL wins over
                an auto-generated frame. With nothing chosen, the server
                generates a thumbnail after upload.
              </p>
              <fieldset
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <legend>Auto-generated thumbnails</legend>
                {framesStatus === "loading" ? (
                  <p role="status" style={{ margin: 0 }}>
                    Extracting thumbnails from your video…
                  </p>
                ) : framesStatus === "failed" ? (
                  <p style={{ margin: 0 }}>
                    Could not extract thumbnails from this video — the
                    server will generate one after upload.
                  </p>
                ) : frames.length > 0 ? (
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    {frames.map((frame, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-pressed={selectedFrameIndex === i}
                        aria-label={`Use auto-generated frame ${i + 1}`}
                        onClick={() =>
                          setSelectedFrameIndex(
                            selectedFrameIndex === i ? null : i,
                          )
                        }
                        style={{
                          padding: 0,
                          border:
                            selectedFrameIndex === i
                              ? "2px solid var(--accent)"
                              : "2px solid transparent",
                          borderRadius: 8,
                          cursor: "pointer",
                          background: "none",
                          position: "relative",
                        }}
                      >
                        <img
                          src={frame}
                          alt={`Auto-generated thumbnail frame ${i + 1}`}
                          style={{
                            display: "block",
                            width: 120,
                            aspectRatio: "16 / 9",
                            objectFit: "cover",
                            borderRadius: 6,
                          }}
                        />
                        {i === SUGGESTED_FRAME_INDEX ? (
                          <span
                            style={{
                              position: "absolute",
                              top: 4,
                              left: 4,
                              background: "rgba(0,0,0,0.8)",
                              color: "#fff",
                              fontSize: 11,
                              padding: "1px 6px",
                              borderRadius: 6,
                            }}
                          >
                            Suggested
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
                {selectedFrameIndex !== null ? (
                  <button
                    type="button"
                    className="acube-btn-secondary"
                    style={{ marginTop: 8 }}
                    onClick={() => setSelectedFrameIndex(null)}
                  >
                    Use auto-generated thumbnail instead
                  </button>
                ) : null}
              </fieldset>
            </div>
            <div>
              <div className="studio-thumb-preview" aria-label="Thumbnail preview">
                {thumbnailChoice.kind === "file" && thumbnailFilePreviewUrl ? (
                  <img
                    src={thumbnailFilePreviewUrl}
                    alt="Preview of the chosen thumbnail image"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : thumbnailChoice.kind === "url" ? (
                  <VideoThumb
                    src={thumbnailChoice.url}
                    style={{ width: "100%", height: "100%", aspectRatio: "16 / 9" }}
                  />
                ) : thumbnailChoice.kind === "frame" ? (
                  <img
                    src={thumbnailChoice.dataUrl}
                    alt={`Preview of auto-generated thumbnail frame ${thumbnailChoice.frameIndex + 1}`}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
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
                <dt>Thumbnail</dt>
                <dd>{describeThumbnailChoice(thumbnailChoice)}</dd>
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
