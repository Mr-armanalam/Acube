import path from "node:path";
import {
  extractEagerThumbnailUrls,
  uploadOnCloudinary,
  isCloudinaryConfigured,
} from "../cloudinary.js";
import {
  extractLocalThumbnails,
  validateThumbnailUrl,
} from "../Helper/thumbnails.js";
import videofile from "../Models/videofile.js";
import User from "../Models/Auth.js";
import Likedvideo from "../Models/likevideo.js";
import ViewEvent from "../Models/ViewEvent.js";
import {
  AUTO_THUMBNAIL_DEFAULT_INDEX,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_UPLOAD_BYTES,
  SUPPORTED_IMAGE_MIMETYPES,
  SUPPORTED_VIDEO_MIMETYPES,
} from "@acube/shared";
import { paginate, paginationOf } from "../utils/pagination.js";
import { checkReachableImageUrl } from "../utils/validateImageUrl.js";
import { invalidateChannelCache } from "../utils/studioCache.js";
import {
  isSubscribed,
  subscriberCountFor,
} from "./subscriptions.js";

// Phase 3b upload hardening:
//  * MIME + size are re-checked here (multer's filter/limit are the
//    first line, this is defence in depth — never trust the client);
//  * the uploader is req.userid's display name, NEVER req.body.uploader
//    (a body value could impersonate another channel);
//  * the stored filename is multer's sanitised name (see
//    Helper/filehelper.js), never the raw originalname;
//  * the filepath is Cloudinary's secure_url when Cloudinary is
//    configured; otherwise the file is stored locally under uploads/
//    and served at /uploads/<filename> (see the local-fallback block
//    below) — duration/thumbnail are stored when Cloudinary returns
//    them, and left null when it does not (never invented).
//  * the channel owner is ALWAYS req.userid — a client-supplied
//    `chanel` is ignored, so a request can never file a video under
//    someone else's channel (owner checks elsewhere compare
//    videochanel === req.userid).
//  * auto-thumbnails (see Helper/thumbnails.js + cloudinary.js):
//    thumbnailUrl precedence is FILE > URL > AUTO > LEGACY:
//      1. an uploaded thumbnail file part ("thumbnail", JPG/PNG,
//         5 MB — same rule as banner/avatar) wins. When a file is
//         present a pasted thumbnailUrl is ignored entirely — not
//         even validated — and if storing the file fails the upload
//         falls back to the auto candidates, never to the
//         unvalidated URL.
//      2. a pasted thumbnailUrl, validated server-side (reachable
//         http(s) URL answering image/* — anything else is 400
//         VALIDATION_ERROR, so the wizard can show the message
//         verbatim). The Zod format check is only the floor.
//      3. the middle auto-generated frame (5% / 50% / 90%): the
//         Cloudinary eager stills on the Cloudinary path, or three
//         ffmpeg frames under /uploads/ on the local fallback path.
//         autoThumbnails stores all three candidates, in order.
//      4. the legacy Cloudinary thumbnail_url when no eager stills
//         came back; else null (never invented).
//    Thumbnail generation NEVER fails the upload: an eager failure
//    retries the Cloudinary upload without eager, a failed local
//    ffmpeg extraction logs a warning and continues with no frames,
//    and a failed thumbnail-file upload falls back to the auto
//    candidates (never to an unvalidated pasted URL).
export const uploadvideo = async (req, res) => {
  // The route uses upload.fields() (see Helper/filehelper.js):
  // req.files.file[0] is the video, req.files.thumbnail[0] is the
  // optional thumbnail image. req.file (upload.single) is accepted
  // too, so direct controller callers keep working.
  const videoFile = req.file ?? req.files?.file?.[0];
  const thumbnailFile = req.files?.thumbnail?.[0] ?? null;
  if (videoFile === undefined) {
    res.status(404).json({ message: "plz upload a mp.4 video file only" });
  } else {
    try {
      if (!SUPPORTED_VIDEO_MIMETYPES.includes(videoFile.mimetype)) {
        res.status(400).json({ message: "Only mp4 video files are supported" });
        return;
      }
      if (videoFile.size > MAX_UPLOAD_BYTES) {
        res.status(400).json({ message: "File must be less than 10 MB" });
        return;
      }
      // Thumbnail file: same JPG/PNG + 5 MB rule as banner/avatar
      // (multer's filter/limit are the first line, this is defence
      // in depth — never trust the client).
      if (thumbnailFile) {
        if (!SUPPORTED_IMAGE_MIMETYPES.includes(thumbnailFile.mimetype)) {
          res.status(400).json({
            error: {
              code: "VALIDATION_ERROR",
              message: "Only JPG and PNG images are supported",
            },
          });
          return;
        }
        if (thumbnailFile.size > MAX_IMAGE_UPLOAD_BYTES) {
          res.status(400).json({
            error: {
              code: "VALIDATION_ERROR",
              message: "File must be less than 5 MB",
            },
          });
          return;
        }
      }
      const uploader = await User.findById(req.userid).lean();
      if (!uploader) {
        res.status(404).json({ message: "Uploader not found" });
        return;
      }
      // console.log(req.file);
      const videoLocalPath = videoFile?.path;
      // A pasted thumbnailUrl is validated BEFORE the video upload
      // (fail fast — no point uploading a video for a request that
      // will 400), and only when no thumbnail file was supplied: a
      // file wins over a URL, so the URL is ignored entirely then.
      let urlThumbnailUrl = null;
      if (!thumbnailFile && req.body.thumbnailUrl) {
        const check = await validateThumbnailUrl(req.body.thumbnailUrl);
        if (!check.ok) {
          res.status(400).json({
            error: { code: "VALIDATION_ERROR", message: check.message },
          });
          return;
        }
        urlThumbnailUrl = req.body.thumbnailUrl;
      }
      // Upload-wizard fix (400 root cause): uploadOnCloudinary returns
      // null when Cloudinary is not configured (the SDK throws "Must
      // supply api_key"), and the old code turned that into a 400 for
      // every upload — including perfectly valid ones. The upload must
      // succeed WITHOUT Cloudinary credentials configured, so when no
      // credentials are present the multer file is kept on disk under
      // uploads/ and served by the existing /uploads static route
      // (app.js). This is an explicit, logged fallback, never silent:
      // it warns on every fallback upload, and the stored filepath is
      // a local /uploads/... URL (not a Cloudinary URL), so the two
      // modes are distinguishable in the DB. When Cloudinary IS
      // configured the original path below runs unchanged.
      let filepath;
      let duration = null;
      let thumbnail = null;
      let autoThumbnails = [];
      let fileThumbnailUrl = null;
      if (isCloudinaryConfigured()) {
        const video = await uploadOnCloudinary(videoLocalPath);
        //console.log(video);
        if (!video) {
          res
            .status(400)
            .json({ message: "Failed to upload video to cloudinary" });
          return;
        }
        filepath = video.secure_url ?? video.url;
        duration = video.duration ?? null;
        thumbnail = video.thumbnail_url ?? null;
        // Eager stills come back on the upload response (see
        // cloudinary.js extractEagerThumbnailUrls); an upload whose
        // eager step failed (retried without eager) simply has none.
        autoThumbnails = extractEagerThumbnailUrls(video);
        if (thumbnailFile) {
          // A failed thumbnail-image upload must NOT fail the video
          // upload — it falls back to the auto candidates below.
          // (uploadOnCloudinary returns null on failure, it does not
          // throw; the try/catch is defence in depth only.)
          try {
            const uploadedThumb = await uploadOnCloudinary(
              thumbnailFile.path,
              "image",
            );
            fileThumbnailUrl =
              uploadedThumb?.secure_url ?? uploadedThumb?.url ?? null;
            if (!fileThumbnailUrl) {
              console.warn(
                "[upload] Thumbnail image upload to Cloudinary failed " +
                  "— falling back to auto thumbnail.",
              );
            }
          } catch (error) {
            console.warn(
              "[upload] Thumbnail image upload to Cloudinary failed " +
                `(${error.message}) — falling back to auto thumbnail.`,
            );
            fileThumbnailUrl = null;
          }
        }
      } else {
        console.warn(
          "[upload] Cloudinary is not configured — storing video locally " +
            "under uploads/ (set CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET " +
            "to use Cloudinary instead).",
        );
        filepath = `/uploads/${videoFile.filename}`;
        if (thumbnailFile) {
          // Multer already wrote the image under uploads/.
          fileThumbnailUrl = `/uploads/${thumbnailFile.filename}`;
        }
      }
      const file = new videofile({
        videotitle: req.body.title,
        filename: videoFile.filename,
        filepath,
        filetype: videoFile.mimetype,
        filesize: videoFile.size,
        videochanel: req.userid,
        uploader: uploader.username ?? uploader.name ?? uploader.email,
        duration,
        thumbnail,
        // Phase 5 fix: persist the wizard's details on the created
        // video. These arrive validated by uploadVideoBodySchema
        // (validateBody runs before this controller); before this fix
        // they were stripped there and silently dropped, so a "Save as
        // draft" upload became a public video with no description/tags.
        // durationSec mirrors the Cloudinary duration under the
        // contract field name (duration keeps the legacy name).
        description: req.body.description ?? "",
        tags: req.body.tags ?? [],
        visibility: req.body.visibility ?? "public",
        thumbnailUrl: null,
        autoThumbnails,
        durationSec: duration,
        // Watch page: chapters validated by uploadVideoBodySchema
        // (chaptersSchema); absent means no chapters, never invented.
        chapters: req.body.chapters ?? [],
      });
      // Local fallback only, and only when nothing was supplied:
      // extract three ffmpeg frames from the stored file. (On the
      // Cloudinary path the eager stills above already ran inside
      // the upload, so there is nothing to extract; with a file or
      // URL override there is nothing to fall back to.) A failure
      // here logs a warning and the upload still succeeds — with
      // the probed duration stored when extraction DID succeed.
      if (
        !isCloudinaryConfigured() &&
        !thumbnailFile &&
        !urlThumbnailUrl
      ) {
        try {
          const extracted = await extractLocalThumbnails({
            videoPath: videoLocalPath,
            videoId: String(file._id),
            uploadsDir: path.dirname(videoLocalPath),
          });
          file.autoThumbnails = extracted.urls;
          file.duration = extracted.durationSeconds;
          file.durationSec = extracted.durationSeconds;
        } catch (error) {
          console.warn(
            "[upload] Local thumbnail extraction failed " +
              `(${error.message}) — continuing without thumbnails.`,
          );
        }
      }
      // Precedence: file > pasted URL > middle auto frame > first
      // auto frame > legacy Cloudinary thumbnail_url > null.
      file.thumbnailUrl =
        fileThumbnailUrl ??
        urlThumbnailUrl ??
        file.autoThumbnails[AUTO_THUMBNAIL_DEFAULT_INDEX] ??
        file.autoThumbnails[0] ??
        thumbnail ??
        null;
      // console.log(file)
      await file.save();
      // Phase 5: a new upload changes the creator's Studio totals.
      invalidateChannelCache(String(req.userid));
      // Phase 5 fix: return the created video id (JSON, not bare text)
      // so the upload wizard can link to the new video and PATCH it.
      res.status(200).json({
        message: "File uploaded successfully",
        video: {
          id: String(file._id),
          videotitle: file.videotitle,
          visibility: file.visibility,
          description: file.description,
          tags: file.tags,
          thumbnailUrl: file.thumbnailUrl,
          autoThumbnails: file.autoThumbnails,
          chapters: file.chapters ?? [],
        },
      });
    } catch (error) {
      res.status(404).json(error.message);
      return;
    }
  }
};

// Phase 5: the public feed shows public videos only. Rows created
// before Phase 5 have no `visibility` field and are treated as public
// (the backfill in the plan); unlisted and private videos never appear
// here. There is no server-side search endpoint — the web client
// searches over this feed, so the same filter covers search.
// Phase 5 fix: drafts never appear here either, and soft-deleted
// videos (deletedAt set) are excluded from every public list.
const PUBLIC_FEED_FILTER = {
  $or: [{ visibility: "public" }, { visibility: { $exists: false } }],
  deletedAt: null,
};

export const getallvideos = async (req, res) => {
  // console.log("get all videos");
  try {
    // Phase 3b: paginated + lean. Response shape is now
    // { items, page, limit, total, totalPages } (see PHASE3B_NOTES.md);
    // items are in upload order (createdAt ascending), as before.
    const page = await paginate(
      videofile.find(PUBLIC_FEED_FILTER).sort({ createdAt: 1, _id: 1 }),
      paginationOf(req),
    );
    res.status(200).send(page);
  } catch (error) {
    res.status(404).json(error.message);
    return;
  }
};

// Phase 5: single-video read (public). Visibility rules, matching the
// plan: public for everyone; unlisted by direct id; private 404s for
// non-owners (not 403, so private ids are not enumerable). The owner
// always sees their own video. `optionalAuth` on the route sets
// req.userid when a valid token is present; anonymous otherwise.
// Phase 5 fix: drafts behave like private (owner only), and a
// soft-deleted video is 404 for EVERYONE, owner included — restore it
// via POST /video/:id/restore first.
// Watch page: the DTO also carries `subscriberCount` (honest derived
// count for the video's channel, 0 when none) and `subscribed` for
// the requesting user (false when anonymous).
export const getVideoById = async (req, res, next) => {
  try {
    const video = await videofile.findById(req.params.id).lean();
    if (!video || video.deletedAt != null) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Video not found" },
      });
    }
    const visibility = video.visibility ?? "public";
    const isOwner =
      req.userid != null &&
      String(video.videochanel) === String(req.userid);
    if ((visibility === "private" || visibility === "draft") && !isOwner) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Video not found" },
      });
    }
    const [subscriberCount, subscribed] = await Promise.all([
      subscriberCountFor(String(video.videochanel)),
      isSubscribed(String(video.videochanel), req.userid ?? null),
    ]);
    return res.status(200).json({ ...video, subscriberCount, subscribed });
  } catch (error) {
    return next(error);
  }
};

// Phase 5: edit own video — title / visibility / description / tags /
// thumbnailUrl / durationSec / chapters (updateVideoSchema is strict:
// any other field is 400). Non-owner → 403; missing video → 404; a
// soft-deleted video is 404 until restored.
export const updateVideo = async (req, res, next) => {
  try {
    const video = await videofile.findById(req.params.id);
    if (!video || video.deletedAt != null) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Video not found" },
      });
    }
    if (String(video.videochanel) !== String(req.userid)) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "You can only edit your own videos",
        },
      });
    }
    // Auto-thumbnails: a pasted thumbnailUrl is validated server-side
    // exactly as on upload (reachable image, else 400) — clearing it
    // (null) needs no validation. Skipped entirely when a thumbnail
    // file is attached: the file wins and the pasted URL is ignored,
    // not even validated (same precedence as upload).
    if (
      !req.file &&
      req.body.thumbnailUrl !== undefined &&
      req.body.thumbnailUrl !== null
    ) {
      const check = await validateThumbnailUrl(req.body.thumbnailUrl);
      if (!check.ok) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: check.message },
        });
      }
    }
    const updates = {};
    if (req.body.title !== undefined) updates.videotitle = req.body.title;
    if (req.body.visibility !== undefined) {
      updates.visibility = req.body.visibility;
    }
    if (req.body.description !== undefined) {
      updates.description = req.body.description;
    }
    if (req.body.tags !== undefined) updates.tags = req.body.tags;
    if (req.body.thumbnailUrl !== undefined) {
      updates.thumbnailUrl = req.body.thumbnailUrl;
    }
    if (req.body.durationSec !== undefined) {
      updates.durationSec = req.body.durationSec;
    }
    // Watch page: chapters replace wholesale (the Edit-details modal
    // sends the full edited list). An empty array clears them.
    if (req.body.chapters !== undefined) {
      updates.chapters = req.body.chapters;
    }
    // Multipart edit (Studio Content modal): a local thumbnail file
    // wins over a pasted thumbnailUrl in the same request. A
    // multipart call with NO usable file part is 400 — multer
    // silently drops files its filter rejects, so "no file" here can
    // mean "a non-JPG/PNG file was attached", which must never
    // silently succeed as a no-op edit. (JSON PATCH callers are
    // unaffected: req.file is undefined and the request is not
    // multipart, so this branch never runs for them.)
    if (req.file) {
      const uploaded = await thumbnailUrlFromFile(req);
      if (uploaded.error) {
        return res.status(uploaded.error.status).json(uploaded.error.body);
      }
      updates.thumbnailUrl = uploaded.url;
    } else if (req.is("multipart/form-data")) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message:
            "An image file (JPG or PNG, max 5 MB) is required for a multipart edit",
        },
      });
    }
    const updated = await videofile.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { returnDocument: "after" },
    );
    invalidateChannelCache(String(req.userid));
    return res.status(200).json(updated);
  } catch (error) {
    return next(error);
  }
};

// Shared by PATCH /video/:id (multipart) and POST /video/:id/thumbnail:
// turn an attached "thumbnail" file (req.file, via
// Helper/imageFilehelper.js) into a stored URL. Returns { url } on
// success, { url: null } when no file was attached, or
// { error: { status, body } } when the file is unusable (wrong MIME,
// oversize, Cloudinary failure). Storage mirrors the video upload:
// Cloudinary with resource_type "image" when configured, otherwise
// the multer file is kept under uploads/ and served at /uploads/<file>.
async function thumbnailUrlFromFile(req) {
  if (!req.file) return { url: null };
  // Defence in depth — multer's filter/limit are the first line.
  if (!SUPPORTED_IMAGE_MIMETYPES.includes(req.file.mimetype)) {
    return {
      error: {
        status: 400,
        body: {
          error: {
            code: "VALIDATION_ERROR",
            message: "Only JPG and PNG images are supported",
          },
        },
      },
    };
  }
  if (req.file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return {
      error: {
        status: 400,
        body: {
          error: {
            code: "VALIDATION_ERROR",
            message: "File must be less than 5 MB",
          },
        },
      },
    };
  }
  if (isCloudinaryConfigured()) {
    const uploaded = await uploadOnCloudinary(req.file.path, "image");
    if (!uploaded) {
      return {
        error: {
          status: 400,
          body: {
            error: {
              code: "VALIDATION_ERROR",
              message: "Failed to upload image to cloudinary",
            },
          },
        },
      };
    }
    return { url: uploaded.secure_url ?? uploaded.url };
  }
  console.warn(
    "[upload] Cloudinary is not configured — storing video thumbnail " +
      "locally under uploads/ (set CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET " +
      "to use Cloudinary instead).",
  );
  return { url: `/uploads/${req.file.filename}` };
}

// Studio Content edit modal: set a video's thumbnail from a local
// image upload OR a pasted URL — POST /video/:id/thumbnail.
// A separate endpoint (not multipart PATCH /:id) on purpose: PATCH
// is JSON-only under a strict Zod schema (tags is an array, which
// cannot arrive via FormData), and JSON PATCH callers must keep
// working exactly as before.
//
// Precedence: local file > pasted URL > existing thumbnail.
//   * File part "thumbnail" (multer, Helper/imageFilehelper.js —
//     JPG/PNG, 5 MB cap, same as banner/avatar): Cloudinary with
//     resource_type "image" when configured, otherwise the multer
//     file is kept under uploads/ and served at /uploads/<file>.
//   * Else a pasted thumbnailUrl (JSON body, or multipart text field):
//     validated server-side as a reachable image (HEAD, ranged-GET
//     fallback — see utils/validateImageUrl.js); unreachable or
//     non-image URLs are 400 VALIDATION_ERROR, surfaced verbatim.
//   * Else neither: a JSON call keeps the existing thumbnail (200
//     no-op, same video back); a multipart call with no usable file
//     part is 400, because multer silently drops files its filter
//     rejects — a wrong-MIME attachment must never silently succeed.
// Owner only (403 otherwise); missing or soft-deleted video is 404.
// Response: the updated video, same shape as PATCH /video/:id.
export const updateVideoThumbnail = async (req, res, next) => {
  try {
    const video = await videofile.findById(req.params.id);
    if (!video || video.deletedAt != null) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Video not found" },
      });
    }
    if (String(video.videochanel) !== String(req.userid)) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "You can only edit your own videos",
        },
      });
    }
    const pastedUrl =
      typeof req.body?.thumbnailUrl === "string"
        ? req.body.thumbnailUrl.trim()
        : "";
    let url = null;
    if (req.file) {
      const uploaded = await thumbnailUrlFromFile(req);
      if (uploaded.error) {
        return res.status(uploaded.error.status).json(uploaded.error.body);
      }
      url = uploaded.url;
    } else if (pastedUrl) {
      const check = await checkReachableImageUrl(pastedUrl);
      if (!check.ok) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: check.reason },
        });
      }
      url = pastedUrl;
    } else if (req.is("multipart/form-data")) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message:
            "An image file (JPG or PNG, max 5 MB) or thumbnail URL is required",
        },
      });
    } else {
      // Neither a file nor a URL: keep the existing thumbnail.
      return res.status(200).json(video);
    }
    const updated = await videofile.findByIdAndUpdate(
      req.params.id,
      { $set: { thumbnailUrl: url } },
      { returnDocument: "after" },
    );
    invalidateChannelCache(String(req.userid));
    return res.status(200).json(updated);
  } catch (error) {
    return next(error);
  }
};

// Phase 5 fix: DELETE is now a SOFT delete — it sets deletedAt and
// keeps every per-video row (history, liked, watch-later, comments,
// view events, library entries, playlist membership) so
// POST /video/:id/restore brings the video back exactly as it was.
// ChannelDailyStat rows were already kept as historical aggregates.
// Non-owner → 403; missing video → 404; deleting an already-deleted
// video is a 200 no-op. Nothing is hard-deleted any more.
export const deleteVideo = async (req, res, next) => {
  try {
    const video = await videofile.findById(req.params.id);
    if (!video) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Video not found" },
      });
    }
    if (String(video.videochanel) !== String(req.userid)) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "You can only delete your own videos",
        },
      });
    }
    if (video.deletedAt != null) {
      return res
        .status(200)
        .json({ message: "Video already deleted", deletedAt: video.deletedAt });
    }
    const deletedAt = new Date();
    await videofile.findByIdAndUpdate(req.params.id, {
      $set: { deletedAt },
    });
    invalidateChannelCache(String(req.userid));
    return res.status(200).json({ message: "Video deleted", deletedAt });
  } catch (error) {
    return next(error);
  }
};

// Phase 5 fix: restore a soft-deleted video (owner only). A video
// that was never deleted is 400 — there is nothing to restore.
export const restoreVideo = async (req, res, next) => {
  try {
    const video = await videofile.findById(req.params.id);
    if (!video) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Video not found" },
      });
    }
    if (String(video.videochanel) !== String(req.userid)) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "You can only restore your own videos",
        },
      });
    }
    if (video.deletedAt == null) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Video is not deleted",
        },
      });
    }
    const restored = await videofile.findByIdAndUpdate(
      req.params.id,
      { $set: { deletedAt: null } },
      { returnDocument: "after" },
    );
    invalidateChannelCache(String(req.userid));
    return res.status(200).json(restored);
  } catch (error) {
    return next(error);
  }
};

// Phase 5 fix: ranked "Up next" suggestions for the watch page
// (GET /watch/:id/suggestions — mounted at /watch, see Routes/watch.js).
// Works for unlisted videos by link: the SOURCE may be unlisted, but
// candidates are public videos only (plus the owner's own videos when
// the owner is watching), never another creator's unlisted/private/
// draft or soft-deleted video. Rank: same channel first, then same
// tags, then co-watched (videos sharing likers/viewers with the
// source), then closest duration. Cap 12. Each item is
// { video, reason } with reason one of "Same channel" / "Same topic" /
// "Viewers also watched" / "Similar length" — "Similar length" is the
// closest-duration remainder, so the label is relative, never faked.
export const getSuggestions = async (req, res, next) => {
  try {
    const video = await videofile.findById(req.params.id).lean();
    if (!video || video.deletedAt != null) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Video not found" },
      });
    }
    const viewerId = req.userid != null ? String(req.userid) : null;
    const isOwner =
      viewerId != null && String(video.videochanel) === viewerId;
    const visibility = video.visibility ?? "public";
    if ((visibility === "private" || visibility === "draft") && !isOwner) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Video not found" },
      });
    }
    const sourceId = String(video._id);
    const candidateFilter = {
      _id: { $ne: video._id },
      deletedAt: null,
    };
    if (isOwner) {
      candidateFilter.$or = [
        { visibility: "public" },
        { visibility: "unlisted" },
        { visibility: { $exists: false } },
        { videochanel: viewerId },
      ];
    } else {
      candidateFilter.$or = [
        { visibility: "public" },
        { visibility: { $exists: false } },
      ];
    }
    const candidates = await videofile
      .find(candidateFilter)
      .sort({ views: -1, createdAt: -1 })
      .limit(100)
      .lean();
    if (candidates.length === 0) {
      return res.status(200).json({
        items: [],
        page: 1,
        limit: 12,
        total: 0,
        totalPages: 1,
      });
    }
    // Co-watched: the source video's audience (viewers + likers), then
    // every other video that audience viewed or liked.
    const [sourceViewers, sourceLikers] = await Promise.all([
      ViewEvent.distinct("viewer", { videoid: sourceId }),
      Likedvideo.distinct("viewer", { videoid: sourceId }),
    ]);
    const audience = [
      ...new Set(
        [...sourceViewers, ...sourceLikers].map((v) => String(v)),
      ),
    ];
    let coWatchedIds = new Set();
    if (audience.length > 0) {
      const [coViewed, coLiked] = await Promise.all([
        ViewEvent.distinct("videoid", {
          viewer: { $in: audience },
          videoid: { $ne: sourceId },
        }),
        Likedvideo.distinct("videoid", {
          viewer: { $in: audience },
          videoid: { $ne: sourceId },
        }),
      ]);
      coWatchedIds = new Set(
        [...coViewed, ...coLiked].map((id) => String(id)),
      );
    }
    const sourceTags = new Set(
      (video.tags ?? []).map((t) => String(t).toLowerCase()),
    );
    const sourceDuration = video.durationSec ?? video.duration ?? null;
    const scored = candidates.map((candidate) => {
      const tags = (candidate.tags ?? []).map((t) =>
        String(t).toLowerCase(),
      );
      const sharedTags = tags.filter((t) => sourceTags.has(t));
      const duration = candidate.durationSec ?? candidate.duration ?? null;
      let reason;
      let score;
      if (String(candidate.videochanel) === String(video.videochanel)) {
        reason = "Same channel";
        score = 300;
      } else if (sharedTags.length > 0) {
        reason = "Same topic";
        score = 200 + sharedTags.length;
      } else if (coWatchedIds.has(String(candidate._id))) {
        reason = "Viewers also watched";
        score = 100;
      } else {
        reason = "Similar length";
        const diff =
          sourceDuration != null && duration != null
            ? Math.abs(sourceDuration - duration)
            : 86400;
        score = -diff;
      }
      return { video: candidate, reason, score, views: candidate.views ?? 0 };
    });
    scored.sort((a, b) => b.score - a.score || b.views - a.views);
    const items = scored
      .slice(0, 12)
      .map(({ video: itemVideo, reason }) => ({ video: itemVideo, reason }));
    return res.status(200).json({
      items,
      page: 1,
      limit: 12,
      total: items.length,
      totalPages: 1,
    });
  } catch (error) {
    return next(error);
  }
};
