// Server-side reachable-image check for pasted thumbnail URLs
// (Studio Content edit modal: POST /video/:id/thumbnail).
//
// A URL is usable as a thumbnail only when it actually serves an
// image: HEAD first (5s timeout); when HEAD is not 2xx or carries no
// image/* content-type — some hosts reject HEAD or omit the type on
// it — fall back to a ranged GET (bytes=0-0, same timeout) and judge
// that instead. Anything else (non-2xx, non-image content-type,
// network/timeout error) is not a usable thumbnail image, and the
// caller gets the reason back verbatim in the 400 VALIDATION_ERROR.
const TIMEOUT_MS = 5000;

async function probe(url, init) {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
  } catch {
    return null;
  }
}

function isImageResponse(res) {
  if (!res) return false;
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  return contentType.startsWith("image/");
}

/**
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export async function checkReachableImageUrl(raw) {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "Thumbnail URL must be a valid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      reason: "Thumbnail URL must start with http:// or https://",
    };
  }

  const head = await probe(url, { method: "HEAD" });
  if (head?.ok && isImageResponse(head)) return { ok: true };

  // HEAD was rejected, non-2xx, or typeless — ranged GET fallback.
  const get = await probe(url, {
    method: "GET",
    headers: { Range: "bytes=0-0" },
  });
  try {
    if (get && (get.ok || get.status === 206) && isImageResponse(get)) {
      return { ok: true };
    }
  } finally {
    // Only headers were needed — never download the image body.
    await get?.body?.cancel().catch(() => {});
  }
  if (get && (get.ok || get.status === 206)) {
    const contentType = get.headers.get("content-type") ?? "unknown";
    return {
      ok: false,
      reason: `Thumbnail URL is not an image (content-type: ${contentType})`,
    };
  }
  const status = get?.status ?? head?.status;
  return {
    ok: false,
    reason: status
      ? `Thumbnail URL is not reachable (HTTP ${status})`
      : "Thumbnail URL could not be reached",
  };
}
