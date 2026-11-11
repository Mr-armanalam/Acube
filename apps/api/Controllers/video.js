import { uploadOnCloudinary, isCloudinaryConfigured } from "../cloudinary.js";
import videofile from "../Models/videofile.js";
import User from "../Models/Auth.js";
import Likedvideo from "../Models/likevideo.js";
import ViewEvent from "../Models/ViewEvent.js";
import { MAX_UPLOAD_BYTES, SUPPORTED_VIDEO_MIMETYPES } from "@acube/shared";
import { paginate, paginationOf } from "../utils/pagination.js";
import { invalidateChannelCache } from "../utils/studioCache.js";

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
export const uploadvideo = async (req, res) => {
  if (req.file === undefined) {
    res.status(404).json({ message: "plz upload a mp.4 video file only" });
  } else {
    try {
      if (!SUPPORTED_VIDEO_MIMETYPES.includes(req.file.mimetype)) {
        res.status(400).json({ message: "Only mp4 video files are supported" });
        return;
      }
      if (req.file.size > MAX_UPLOAD_BYTES) {
        res.status(400).json({ message: "File must be less than 10 MB" });
        return;
      }
      const uploader = await User.findById(req.userid).lean();
      if (!uploader) {
        res.status(404).json({ message: "Uploader not found" });
        return;
      }
      //  console.log(req.file);
      const videoLocalPath = req.file?.path;
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
      } else {
        console.warn(
          "[upload] Cloudinary is not configured — storing video locally " +
            "under uploads/ (set CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET " +
            "to use Cloudinary instead).",
        );
        filepath = `/uploads/${req.file.filename}`;
      }
      const file = new videofile({
        videotitle: req.body.title,
        filename: req.file.filename,
        filepath,
        filetype: req.file.mimetype,
        filesize: req.file.size,
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
        thumbnailUrl: req.body.thumbnailUrl ?? null,
        durationSec: duration,
      });
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
    return res.status(200).json(video);
  } catch (error) {
    return next(error);
  }
};

// Phase 5: edit own video — title / visibility / description / tags /
// thumbnailUrl / durationSec (updateVideoSchema is strict: any other
// field is 400). Non-owner → 403; missing video → 404; a soft-deleted
// video is 404 until restored.
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
