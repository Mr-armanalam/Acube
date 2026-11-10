// Phase 5: Creator Studio — every handler resolves the caller's
// channel first (their user id IS their channel id: uploads store
// `videochanel` = the uploader's user _id) and scopes every query to
// it. There is no endpoint here that lists another creator's data.
// Errors use the Phase 3 shape { error: { code, message } }.
import mongoose from "mongoose";
import User from "../Models/Auth.js";
import Videofile from "../Models/videofile.js";
import Comment from "../Models/comment.js";
import ChannelDailyStat from "../Models/ChannelDailyStat.js";
import Playlist from "../Models/Playlist.js";
import LibraryEntry from "../Models/LibraryEntry.js";
import Watchlater from "../Models/watchlater.js";
import Likedvideo from "../Models/likevideo.js";
import { paginate, paginationOf } from "../utils/pagination.js";
import { getCached, setCached, invalidateChannelCache } from "../utils/studioCache.js";
import { getChannelTotals } from "../utils/analytics.js";

const NOT_FOUND = (message) => ({ error: { code: "NOT_FOUND", message } });
const FORBIDDEN = (message) => ({ error: { code: "FORBIDDEN", message } });

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** A video doc is visible to `viewerId` (null = anonymous). */
function videoVisibleTo(video, viewerId) {
  const visibility = video.visibility ?? "public";
  if (visibility === "public" || visibility === "unlisted") return true;
  return viewerId != null && String(video.videochanel) === String(viewerId);
}

/** Own videos, newest first — used by the overview + comments tabs. */
async function ownVideoIds(channelId) {
  const ids = await Videofile.distinct("_id", { videochanel: channelId });
  return ids;
}

// ---------------------------------------------------------------- overview

export const getOverview = async (req, res, next) => {
  try {
    const channelId = String(req.userid);
    const cacheKey = `${channelId}:overview`;
    const cached = getCached(cacheKey);
    if (cached) return res.status(200).json(cached);

    const [user, totals, sums, topVideos, videoIds, earliestStat] =
      await Promise.all([
        User.findById(channelId).lean(),
        getChannelTotals(channelId),
        Videofile.aggregate([
          { $match: { videochanel: channelId } },
          {
            $group: {
              _id: null,
              views: { $sum: "$views" },
              likes: { $sum: "$Like" },
              count: { $sum: 1 },
            },
          },
        ]),
        Videofile.find({ videochanel: channelId })
          .sort({ views: -1, createdAt: -1 })
          .limit(5)
          .lean(),
        ownVideoIds(channelId),
        ChannelDailyStat.findOne({ videochanel: channelId })
          .sort({ day: 1 })
          .select("day")
          .lean(),
      ]);
    if (!user) {
      return res.status(404).json(NOT_FOUND("Channel not found"));
    }
    const idStrings = videoIds.map((id) => String(id));
    const [totalComments, latestComments] = await Promise.all([
      idStrings.length
        ? Comment.countDocuments({ videoid: { $in: idStrings } })
        : 0,
      idStrings.length
        ? Comment.find({ videoid: { $in: idStrings } })
            .sort({ commentedon: -1, _id: -1 })
            .limit(5)
            .lean()
        : [],
    ]);
    const titles = new Map(
      (
        await Videofile.find({ _id: { $in: videoIds } })
          .select("videotitle")
          .lean()
      ).map((v) => [String(v._id), v.videotitle]),
    );

    const body = {
      channel: {
        _id: user._id,
        name: user.name,
        email: user.email,
        desc: user.desc,
        picture: user.picture,
        username: user.username,
      },
      // Totals from the event log only — no invented history. A channel
      // with no event rows shows 0 here even if its videos have views
      // from before Phase 5; those live in `allTime` below.
      totals: {
        totalViews: totals.views,
        totalLikes: totals.likes,
        totalVideos: sums[0]?.count ?? 0,
        totalComments,
        watchMinutes: round2(totals.watchMinutes),
        completions: totals.completions,
      },
      // Fallback label: sums of the per-video counters on Videofiles
      // (raw hits / likes, including pre-Phase 5 traffic).
      allTime: {
        views: sums[0]?.views ?? 0,
        likes: sums[0]?.likes ?? 0,
        note: "Sums of the per-video counters, including traffic from before Phase 5 analytics; daily stats count one view per viewer per video per day.",
      },
      // First day with an event row, or null — the UI states
      // "Analytics start from <date>" so an empty chart is never a bug.
      statsSince: earliestStat?.day ?? null,
      topVideos: topVideos.map((v) => ({
        _id: v._id,
        videotitle: v.videotitle,
        views: v.views ?? 0,
        Like: v.Like ?? 0,
        visibility: v.visibility ?? "public",
        createdAt: v.createdAt,
      })),
      latestComments: latestComments.map((c) => ({
        _id: c._id,
        videoid: c.videoid,
        videotitle: titles.get(String(c.videoid)) ?? null,
        userid: c.userid,
        commentbody: c.commentbody,
        usercommented: c.usercommented,
        commentedon: c.commentedon,
        parentId: c.parentId ?? null,
        deleted: c.deleted ?? false,
      })),
    };
    setCached(cacheKey, body);
    return res.status(200).json(body);
  } catch (error) {
    return next(error);
  }
};

// --------------------------------------------------------------- analytics

export const getAnalytics = async (req, res, next) => {
  try {
    const channelId = String(req.userid);
    const range = Number(req.pagination.range);
    const cacheKey = `${channelId}:analytics:${range}`;
    const cached = getCached(cacheKey);
    if (cached) return res.status(200).json(cached);

    // UTC day strings, ending today, oldest first.
    const days = [];
    for (let i = range - 1; i >= 0; i -= 1) {
      days.push(
        new Date(Date.now() - i * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
      );
    }
    const rows = await ChannelDailyStat.find({
      videochanel: channelId,
      day: { $gte: days[0], $lte: days[days.length - 1] },
    }).lean();
    const byDay = new Map(rows.map((r) => [r.day, r]));
    const series = days.map((date) => {
      const row = byDay.get(date);
      return {
        date,
        views: row?.views ?? 0,
        watchMinutes: round2(row?.watchMinutes ?? 0),
        likes: row?.likes ?? 0,
      };
    });
    const totals = series.reduce(
      (acc, d) => ({
        views: acc.views + d.views,
        watchMinutes: round2(acc.watchMinutes + d.watchMinutes),
        likes: acc.likes + d.likes,
      }),
      { views: 0, watchMinutes: 0, likes: 0 },
    );
    totals.completions = rows.reduce((n, r) => n + (r.completions ?? 0), 0);
    const best = series.reduce(
      (bestSoFar, d) => (d.views > bestSoFar.views ? d : bestSoFar),
      { date: null, views: 0 },
    );
    const body = {
      range,
      days: series,
      totals,
      bestDay: best.views > 0 ? { date: best.date, views: best.views } : null,
    };
    setCached(cacheKey, body);
    return res.status(200).json(body);
  } catch (error) {
    return next(error);
  }
};

// ------------------------------------------------------------ videos list

export const getStudioVideos = async (req, res, next) => {
  try {
    const page = await paginate(
      Videofile.find({ videochanel: String(req.userid) }).sort({
        createdAt: -1,
        _id: -1,
      }),
      paginationOf(req),
    );
    return res.status(200).json(page);
  } catch (error) {
    return next(error);
  }
};

// ---------------------------------------------------------- comments list

export const getStudioComments = async (req, res, next) => {
  try {
    const channelId = String(req.userid);
    const videoIds = await ownVideoIds(channelId);
    const idStrings = videoIds.map((id) => String(id));
    const page = await paginate(
      Comment.find({ videoid: { $in: idStrings } }).sort({
        commentedon: -1,
        _id: -1,
      }),
      paginationOf(req),
    );
    const titles = new Map(
      (
        await Videofile.find({ _id: { $in: videoIds } })
          .select("videotitle")
          .lean()
      ).map((v) => [String(v._id), v.videotitle]),
    );
    return res.status(200).json({
      ...page,
      items: page.items.map((c) => ({
        ...c,
        videotitle: titles.get(String(c.videoid)) ?? null,
      })),
    });
  } catch (error) {
    return next(error);
  }
};

// ---------------------------------------------------------------- settings

export const getSettings = async (req, res, next) => {
  try {
    const user = await User.findById(req.userid).lean();
    if (!user) {
      return res.status(404).json(NOT_FOUND("Channel not found"));
    }
    return res.status(200).json({
      channel: {
        _id: user._id,
        name: user.name,
        email: user.email,
        desc: user.desc,
        picture: user.picture,
        username: user.username,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const updateSettings = async (req, res, next) => {
  try {
    const channelId = String(req.userid);
    const { name, desc } = req.body;
    // Same fields as the existing channel edit (PATCH /user/update/:id):
    // a name change also renames the uploader on the channel's videos.
    if (name !== undefined) {
      await Videofile.updateMany(
        { videochanel: channelId },
        { $set: { uploader: name } },
      );
    }
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (desc !== undefined) updates.desc = desc;
    const updated = await User.findByIdAndUpdate(
      channelId,
      { $set: updates },
      { returnDocument: "after" },
    );
    if (!updated) {
      return res.status(404).json(NOT_FOUND("Channel not found"));
    }
    invalidateChannelCache(channelId);
    return res.status(200).json(updated);
  } catch (error) {
    return next(error);
  }
};

// --------------------------------------------------------------- playlists

async function validatePlaylistVideos(videoIds, ownerId) {
  const deduped = [...new Set(videoIds)];
  if (deduped.length === 0) return { videoIds: deduped };
  const videos = await Videofile.find({ _id: { $in: deduped } })
    .select("videochanel visibility")
    .lean();
  if (videos.length !== deduped.length) {
    return { error: NOT_FOUND("One or more videos do not exist") };
  }
  const privateOfOther = videos.find(
    (v) =>
      (v.visibility ?? "public") === "private" &&
      String(v.videochanel) !== String(ownerId),
  );
  if (privateOfOther) {
    return {
      error: FORBIDDEN("Cannot add another creator's private video"),
    };
  }
  return { videoIds: deduped };
}

export const listPlaylists = async (req, res, next) => {
  try {
    const page = await paginate(
      Playlist.find({ owner: String(req.userid) }).sort({
        createdAt: -1,
        _id: -1,
      }),
      paginationOf(req),
    );
    return res.status(200).json({
      ...page,
      items: page.items.map((p) => ({
        ...p,
        videoCount: p.videoIds.length,
      })),
    });
  } catch (error) {
    return next(error);
  }
};

// Public read (with visibility rules) so the /playlist/:id watch page
// can render a public/unlisted playlist without signing in. Private
// playlists 404 for non-owners, exactly like private videos.
export const getPlaylist = async (req, res, next) => {
  try {
    const playlist = await Playlist.findById(req.params.id).lean();
    if (!playlist) {
      return res.status(404).json(NOT_FOUND("Playlist not found"));
    }
    const viewerId = req.userid ? String(req.userid) : null;
    const isOwner = viewerId !== null && String(playlist.owner) === viewerId;
    if (playlist.visibility === "private" && !isOwner) {
      return res.status(404).json(NOT_FOUND("Playlist not found"));
    }
    const videos = playlist.videoIds.length
      ? await Videofile.find({ _id: { $in: playlist.videoIds } }).lean()
      : [];
    const byId = new Map(videos.map((v) => [String(v._id), v]));
    const ordered = playlist.videoIds
      .map((id) => byId.get(String(id)))
      .filter((v) => v && videoVisibleTo(v, viewerId));
    return res.status(200).json({
      ...playlist,
      videoCount: playlist.videoIds.length,
      videos: ordered,
    });
  } catch (error) {
    return next(error);
  }
};

export const createPlaylist = async (req, res, next) => {
  try {
    const owner = String(req.userid);
    const { title, description = "", visibility = "public", videoIds = [] } =
      req.body;
    const checked = await validatePlaylistVideos(videoIds, owner);
    if (checked.error) {
      const status = checked.error.error.code === "FORBIDDEN" ? 403 : 404;
      return res.status(status).json(checked.error);
    }
    const playlist = await Playlist.create({
      owner,
      title,
      description,
      visibility,
      videoIds: checked.videoIds,
    });
    return res.status(201).json(playlist);
  } catch (error) {
    return next(error);
  }
};

async function ownedPlaylistOrError(req, res) {
  const playlist = await Playlist.findById(req.params.id);
  if (!playlist) {
    res.status(404).json(NOT_FOUND("Playlist not found"));
    return null;
  }
  if (String(playlist.owner) !== String(req.userid)) {
    res
      .status(403)
      .json(FORBIDDEN("You can only change your own playlists"));
    return null;
  }
  return playlist;
}

export const updatePlaylist = async (req, res, next) => {
  try {
    if (!(await ownedPlaylistOrError(req, res))) return;
    const owner = String(req.userid);
    const { title, description, visibility, addVideoIds, removeVideoIds } =
      req.body;
    const update = {};
    const set = {};
    if (title !== undefined) set.title = title;
    if (description !== undefined) set.description = description;
    if (visibility !== undefined) set.visibility = visibility;
    if (Object.keys(set).length > 0) update.$set = set;
    if (addVideoIds !== undefined) {
      const checked = await validatePlaylistVideos(addVideoIds, owner);
      if (checked.error) {
        const status = checked.error.error.code === "FORBIDDEN" ? 403 : 404;
        return res.status(status).json(checked.error);
      }
      if (checked.videoIds.length > 0) {
        update.$addToSet = { videoIds: { $each: checked.videoIds } };
      }
    }
    if (removeVideoIds !== undefined && removeVideoIds.length > 0) {
      update.$pull = { videoIds: { $in: removeVideoIds } };
    }
    const updated = await Playlist.findByIdAndUpdate(
      req.params.id,
      update,
      { returnDocument: "after" },
    );
    return res.status(200).json(updated);
  } catch (error) {
    return next(error);
  }
};

export const deletePlaylist = async (req, res, next) => {
  try {
    const playlist = await ownedPlaylistOrError(req, res);
    if (!playlist) return;
    await Playlist.deleteOne({ _id: playlist._id });
    return res.status(200).json({ message: "Playlist deleted" });
  } catch (error) {
    return next(error);
  }
};

// ----------------------------------------------------------------- library

// Library tabs read LibraryEntry rows, unioned with the legacy
// Watchlater / Likedvideo collections (rows created before Phase 5 have
// no LibraryEntry row — the union covers them without a migration).
// Videos that no longer exist, or are private videos of another
// creator, are dropped from the response.
export const getLibrary = async (req, res, next) => {
  try {
    const userId = String(req.userid);
    const [watchlaterRows, likedRows, entries, playlists] = await Promise.all([
      Watchlater.find({ viewer: userId }).lean(),
      Likedvideo.find({ viewer: userId }).lean(),
      LibraryEntry.find({ userId }).sort({ addedAt: -1 }).lean(),
      Playlist.find({ owner: userId }).sort({ createdAt: -1 }).lean(),
    ]);
    const byKind = {
      watchlater: new Set(watchlaterRows.map((r) => String(r.videoid))),
      liked: new Set(likedRows.map((r) => String(r.videoid))),
      saved: new Set(),
    };
    for (const entry of entries) {
      if (byKind[entry.kind]) byKind[entry.kind].add(String(entry.videoid));
    }
    const allIds = [
      ...new Set([
        ...byKind.watchlater,
        ...byKind.liked,
        ...byKind.saved,
      ]),
    ];
    const videos = allIds.length
      ? await Videofile.find({ _id: { $in: allIds } }).lean()
      : [];
    const byId = new Map(
      videos
        .filter((v) => videoVisibleTo(v, userId))
        .map((v) => [String(v._id), v]),
    );
    const pick = (set) =>
      [...set].map((id) => byId.get(id)).filter(Boolean);
    return res.status(200).json({
      watchlater: pick(byKind.watchlater),
      saved: pick(byKind.saved),
      liked: pick(byKind.liked),
      playlists: playlists.map((p) => ({
        ...p,
        videoCount: p.videoIds.length,
      })),
    });
  } catch (error) {
    return next(error);
  }
};

export const addLibraryEntry = async (req, res, next) => {
  try {
    const userId = String(req.userid);
    const { videoid, kind } = req.body;
    if (!mongoose.Types.ObjectId.isValid(videoid)) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid videoid" },
      });
    }
    const video = await Videofile.findById(videoid).lean();
    if (!video) {
      return res.status(404).json(NOT_FOUND("Video not found"));
    }
    if (!videoVisibleTo(video, userId)) {
      return res
        .status(403)
        .json(FORBIDDEN("Cannot save another creator's private video"));
    }
    const entry = await LibraryEntry.findOneAndUpdate(
      { userId, videoid: String(videoid), kind },
      { userId, videoid: String(videoid), kind, addedAt: new Date() },
      { upsert: true, returnDocument: "after" },
    );
    // Dual-write the legacy collections so the WHL pages (which read
    // them) stay in step with the Library.
    if (kind === "watchlater") {
      await Watchlater.findOneAndUpdate(
        { videoid: String(videoid), viewer: userId },
        { videoid: String(videoid), viewer: userId },
        { upsert: true },
      );
    } else if (kind === "liked") {
      await Likedvideo.findOneAndUpdate(
        { videoid: String(videoid), viewer: userId },
        { videoid: String(videoid), viewer: userId },
        { upsert: true },
      );
    }
    return res.status(200).json({ message: "Added to library", entry });
  } catch (error) {
    return next(error);
  }
};

export const removeLibraryEntry = async (req, res, next) => {
  try {
    const userId = String(req.userid);
    const { kind, videoid } = req.params;
    await LibraryEntry.deleteOne({ userId, videoid, kind });
    if (kind === "watchlater") {
      await Watchlater.deleteOne({ videoid, viewer: userId });
    } else if (kind === "liked") {
      await Likedvideo.deleteOne({ videoid, viewer: userId });
    }
    return res.status(200).json({ message: "Removed from library" });
  } catch (error) {
    return next(error);
  }
};
