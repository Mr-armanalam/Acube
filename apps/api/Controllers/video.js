import { uploadOnCloudinary } from "../cloudinary.js";
import videofile from "../Models/videofile.js";
import User from "../Models/Auth.js";
import History from "../Models/history.js";
import Likedvideo from "../Models/likevideo.js";
import Watchlater from "../Models/watchlater.js";
import Comment from "../Models/comment.js";
import ViewEvent from "../Models/ViewEvent.js";
import LibraryEntry from "../Models/LibraryEntry.js";
import Playlist from "../Models/Playlist.js";
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
//  * the filepath is Cloudinary's secure_url, and duration/thumbnail are
//    stored when Cloudinary returns them.
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
      const video = await uploadOnCloudinary(videoLocalPath);
      //console.log(video);
      if (!video) {
        res
          .status(400)
          .json({ message: "Failed to upload video to cloudinary" });
        return;
      }
      const file = new videofile({
        videotitle: req.body.title,
        filename: req.file.filename,
        filepath: video.secure_url ?? video.url,
        filetype: req.file.mimetype,
        filesize: req.file.size,
        videochanel: req.body.chanel,
        uploader: uploader.username ?? uploader.name ?? uploader.email,
        duration: video.duration ?? null,
        thumbnail: video.thumbnail_url ?? null,
      });
      // console.log(file)
      await file.save();
      // Phase 5: a new upload changes the creator's Studio totals.
      invalidateChannelCache(String(req.body.chanel));
      res.status(200).send("File uploaded successfully");
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
const PUBLIC_FEED_FILTER = {
  $or: [{ visibility: "public" }, { visibility: { $exists: false } }],
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
export const getVideoById = async (req, res, next) => {
  try {
    const video = await videofile.findById(req.params.id).lean();
    if (!video) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Video not found" },
      });
    }
    const visibility = video.visibility ?? "public";
    const isOwner =
      req.userid != null &&
      String(video.videochanel) === String(req.userid);
    if (visibility === "private" && !isOwner) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Video not found" },
      });
    }
    return res.status(200).json(video);
  } catch (error) {
    return next(error);
  }
};

// Phase 5: edit own video — title (1–100 chars) and/or visibility
// only (updateVideoSchema is strict: any other field is 400).
// Non-owner → 403; missing video → 404.
export const updateVideo = async (req, res, next) => {
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
          message: "You can only edit your own videos",
        },
      });
    }
    const updates = {};
    if (req.body.title !== undefined) updates.videotitle = req.body.title;
    if (req.body.visibility !== undefined) {
      updates.visibility = req.body.visibility;
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

// Phase 5: delete own video + its per-video rows (history, liked,
// watch-later, comments, view events, library entries) and pull it out
// of every playlist. ChannelDailyStat rows are KEPT as historical
// aggregates — deleting them would rewrite the channel's past
// analytics — and PointsAward rows are kept as the points audit trail.
// Non-owner → 403; missing video → 404.
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
    const vid = String(video._id);
    await Promise.all([
      videofile.findByIdAndDelete(req.params.id),
      History.deleteMany({ videoid: vid }),
      Likedvideo.deleteMany({ videoid: vid }),
      Watchlater.deleteMany({ videoid: vid }),
      Comment.deleteMany({ videoid: vid }),
      ViewEvent.deleteMany({ videoid: vid }),
      LibraryEntry.deleteMany({ videoid: vid }),
      Playlist.updateMany(
        { videoIds: vid },
        { $pull: { videoIds: vid } },
      ),
    ]);
    invalidateChannelCache(String(req.userid));
    return res.status(200).json({ message: "Video deleted" });
  } catch (error) {
    return next(error);
  }
};
