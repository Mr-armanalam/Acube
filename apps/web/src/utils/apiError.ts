// Extract the SERVER's error message from a failed request, so the UI
// shows what actually went wrong instead of axios's generic
// "Request failed with status code 400".
//
// Shapes handled (in order):
//  * { response: { data: { error: { message, details?: [{path, message}] } } } }
//    — the API's stable error shape (Zod validation, central handler).
//  * { response: { data: { message } } } — the upload controller's
//    plain { message } 400s ("Failed to upload video to cloudinary").
//  * { message } — any other Error.
// Anything else falls back to "Upload failed".
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function detailText(detail: unknown): string | null {
  if (!isRecord(detail)) return null;
  const path = typeof detail.path === "string" ? detail.path : "";
  const message = typeof detail.message === "string" ? detail.message : "";
  if (!message) return null;
  return path ? `${path}: ${message}` : message;
}

export function extractApiErrorMessage(error: unknown): string {
  if (isRecord(error)) {
    const response = error.response;
    if (isRecord(response)) {
      const data = response.data;
      if (isRecord(data)) {
        const apiError = data.error;
        if (isRecord(apiError)) {
          const message =
            typeof apiError.message === "string" ? apiError.message : "";
          const details = Array.isArray(apiError.details)
            ? apiError.details
                .map(detailText)
                .filter((t): t is string => t !== null)
            : [];
          if (message && details.length > 0) {
            return `${message} — ${details.join("; ")}`;
          }
          if (message) return message;
        }
        if (typeof data.message === "string" && data.message) {
          return data.message;
        }
      }
    }
    if (error instanceof Error && error.message) return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Upload failed";
}
