// Thumbnail helpers shared by the UploadWizard (Step 2), the Studio
// Content edit modal and Studio Settings.
//
// Precedence (file > URL > auto-generated frame > server default):
// a chosen local image file wins over a pasted URL; the URL wins over
// an auto-generated frame; with nothing chosen the server generates
// the thumbnail after upload (Cloudinary eager frames / ffmpeg
// fallback — the backend worker's part). Never invent a thumbnail URL.
//
// Contract with the backend (landed on this branch — see
// apps/api/Controllers/video.js + Routes/video.js): the upload
// endpoint accepts a second multipart file part named "thumbnail"
// (jpg/png, ≤ 5 MB) alongside the video "file" part, and the upload
// response carries `thumbnailUrl` (chosen frame) + `autoThumbnails`
// (candidate frame URLs, possibly empty). Server precedence is the
// same as the client's: FILE > URL > AUTO (middle frame, index 1) >
// legacy Cloudinary thumbnail; server frames use the same 5%/50%/90%
// fractions. The client sends the `thumbnail` part ONLY when the user

/** Thumbnail image limit (server contract): 5 MB, jpg/png only. */
export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

/** Fractions of the video duration the auto frame picker samples. */
export const THUMBNAIL_FRAME_FRACTIONS = [0.05, 0.5, 0.9] as const;

/** The suggested frame — the middle (50%) sample. */
export const SUGGESTED_FRAME_INDEX = 1;

/** How long frame extraction may wait for metadata / a seek. */
export const FRAME_EXTRACTION_TIMEOUT_MS = 5000;

/**
 * Client-side image gate (same limits as the server): jpg/png,
 * ≤ 5 MB. Rejects before any upload is attempted, with an inline
 * error. Moved here from Studio Settings so the wizard reuses the
 * exact same rule.
 */
export function validateImageFile(file: File): string | null {
  if (file.type) {
    if (file.type !== "image/jpeg" && file.type !== "image/png") {
      return "Choose a JPG or PNG image.";
    }
  } else if (!/\.(jpe?g|png)$/i.test(file.name)) {
    return "Choose a JPG or PNG image.";
  }
  if (file.size > MAX_THUMBNAIL_BYTES) {
    return "Image must be 5 MB or smaller.";
  }
  return null;
}

/**
 * Extract candidate thumbnail frames from a picked video file:
 * one JPEG data URL per fraction of the duration (5% / 50% / 90%),
 * drawn from a hidden <video> + canvas. Rejects (never resolves with
 * fake frames) when the file cannot be read, has no usable duration,
 * or a seek times out — the caller falls back to the plain video-frame
 * preview and lets the server generate the thumbnail after upload.
 */
export function extractVideoFrames(
  file: File,
  fractions: readonly number[] = THUMBNAIL_FRAME_FRACTIONS,
  timeoutMs: number = FRAME_EXTRACTION_TIMEOUT_MS,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    // jsdom (and very old browsers) have no URL.createObjectURL —
    // reject with the same message as a real read failure.
    if (typeof URL.createObjectURL !== "function") {
      reject(new Error("Could not read frames from this video."));
      return;
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext("2d");
    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };
    const withTimeout = <T>(promise: Promise<T>, message: string): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_resolve, rejectTimeout) => {
          window.setTimeout(() => rejectTimeout(new Error(message)), timeoutMs);
        }),
      ]);
    const once = (event: "loadedmetadata" | "seeked" | "error"): Promise<void> =>
      new Promise((resolveEvent) => {
        const handler = () => {
          video.removeEventListener(event, handler);
          resolveEvent();
        };
        video.addEventListener(event, handler);
      });
    video.addEventListener("error", () => {
      fail("Could not read frames from this video.");
    });
    video.src = url;
    void withTimeout(
      once("loadedmetadata"),
      "Could not read frames from this video.",
    )
      .then(async () => {
        if (!ctx) throw new Error("Could not read frames from this video.");
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0) {
          throw new Error("Could not read frames from this video.");
        }
        const frames: string[] = [];
        for (const fraction of fractions) {
          video.currentTime = Math.min(
            Math.max(duration * fraction, 0),
            Math.max(duration - 0.05, 0),
          );
          await withTimeout(
            once("seeked"),
            "Could not read frames from this video.",
          );
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL("image/jpeg", 0.82));
        }
        if (settled) return;
        settled = true;
        cleanup();
        resolve(frames);
      })
      .catch((err: unknown) => {
        fail(
          err instanceof Error
            ? err.message
            : "Could not read frames from this video.",
        );
      });
  });
}

/** Turn a `data:image/jpeg;base64,…` URL (from extractVideoFrames) into a File. */
export function dataUrlToFile(dataUrl: string, filename: string): File | null {
  const match = /^data:(image\/[a-z]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: match[1] });
}

export type ThumbnailChoice =
  | { kind: "file"; file: File }
  | { kind: "url"; url: string }
  | { kind: "frame"; frameIndex: number; dataUrl: string }
  | { kind: "auto" };

/**
 * Pure precedence rule for the wizard's thumbnail: a chosen file wins
 * over a pasted URL; the URL wins over a clicked auto frame; with
 * nothing chosen the thumbnail is "auto" (server-generated).
 */
export function resolveThumbnailChoice(input: {
  file: File | null;
  url: string;
  frameDataUrls: string[];
  selectedFrameIndex: number | null;
}): ThumbnailChoice {
  if (input.file) return { kind: "file", file: input.file };
  const trimmedUrl = input.url.trim();
  if (trimmedUrl) return { kind: "url", url: trimmedUrl };
  if (
    input.selectedFrameIndex !== null &&
    input.frameDataUrls[input.selectedFrameIndex] !== undefined
  ) {
    return {
      kind: "frame",
      frameIndex: input.selectedFrameIndex,
      dataUrl: input.frameDataUrls[input.selectedFrameIndex],
    };
  }
  return { kind: "auto" };
}

/** Human-readable summary of the effective thumbnail choice (review step). */
export function describeThumbnailChoice(choice: ThumbnailChoice): string {
  switch (choice.kind) {
    case "file":
      return `Image file: ${choice.file.name}`;
    case "url":
      return choice.url;
    case "frame":
      return `Auto-generated frame ${choice.frameIndex + 1} of 3`;
    case "auto":
      return "Auto-generated by the server";
  }
}
