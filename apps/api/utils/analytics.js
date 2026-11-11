// Phase 5: server-side analytics writers. ONLY these functions write
// ViewEvent / ChannelDailyStat rows — never client input, never a
// client-supplied count. All three writers are best-effort: a failure
// here must not fail the view / like / watch-complete that triggered
// it, so errors are logged and swallowed (the caller's request already
// succeeded; the counters on Videofiles are the fallback source).
import ViewEvent from "../Models/ViewEvent.js";
import ChannelDailyStat from "../Models/ChannelDailyStat.js";
import logger from "./logger.js";

/** UTC date "YYYY-MM-DD" for a Date (defaults to now). */
export function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

const EMPTY_STAT = { views: 0, likes: 0, watchMinutes: 0, completions: 0 };

/** Atomic $inc upsert of one day's row for a channel. */
async function incDailyStat(videochanel, day, inc) {
  // $setOnInsert fills the fields this $inc does not touch, so an
  // upserted row is complete (a $setOnInsert on an $inc'd field would
  // race the increment — never set the same field twice).
  const setOnInsert = { ...EMPTY_STAT };
  for (const key of Object.keys(inc)) delete setOnInsert[key];
  await ChannelDailyStat.updateOne(
    { videochanel, day },
    { $inc: inc, $setOnInsert: setOnInsert },
    { upsert: true },
  );
}

/**
 * Record a view. The ViewEvent upsert key is (viewer, videoid, day):
 * the first view by a viewer of a video on a UTC day inserts the event
 * and increments the channel's daily views; a repeat view the same day
 * matches the existing event row (upsertedCount 0) and does NOT
 * double-count the daily stat. The per-video `views` counter on
 * Videofiles still increments on every call (Phase 3b behaviour, pinned
 * by tests) — the daily stat is the deduped count, the video counter
 * is the raw hit count.
 * @returns {Promise<boolean>} true when this view counted toward the daily stat.
 */
export async function recordView({ viewer, video }) {
  const day = utcDay();
  try {
    const result = await ViewEvent.updateOne(
      { viewer: String(viewer), videoid: String(video._id), day },
      {
        $setOnInsert: {
          viewer: String(viewer),
          videoid: String(video._id),
          videochanel: String(video.videochanel),
          day,
          watchSeconds: 0,
          completed: false,
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount === 1) {
      await incDailyStat(String(video.videochanel), day, { views: 1 });
      return true;
    }
    return false;
  } catch (error) {
    logger.warn({ err: error }, "recordView failed — view counted on the video, not in daily stats");
    return false;
  }
}

/**
 * Record a like-toggle delta on the channel's daily likes, clamped at
 * 0 (a pipeline update, same shape as the Videofiles like toggle).
 * Note: this counts toggle events, not distinct likers — the toggle
 * endpoint carries no per-user like state, so a client that sends
 * "like" twice without an "unlike" in between inflates the daily
 * stat by 1 (the video counter has the same property). The web client
 * alternates like/unlike, so in practice the two stay in step.
 */
export async function recordLikeDelta({ video, delta }) {
  const day = utcDay();
  const videochanel = String(video.videochanel);
  try {
    await ChannelDailyStat.findOneAndUpdate(
      { videochanel, day },
      [
        {
          $set: {
            videochanel,
            day,
            views: { $ifNull: ["$views", 0] },
            likes: {
              $max: [0, { $add: [{ $ifNull: ["$likes", 0] }, delta] }],
            },
            watchMinutes: { $ifNull: ["$watchMinutes", 0] },
            completions: { $ifNull: ["$completions", 0] },
          },
        },
      ],
      // Mongoose 9 requires this flag for pipeline updates.
      { upsert: true, updatePipeline: true },
    );
  } catch (error) {
    logger.warn({ err: error }, "recordLikeDelta failed — like counted on the video, not in daily stats");
  }
}

/**
 * Record a completed watch: completions +1 and watchMinutes +=
 * min(durationSeconds, 600) / 60 — a single completion can add at most
 * 10 minutes, so a forged loop cannot inflate watch time without
 * limit. Also marks today's ViewEvent for this viewer/video completed
 * (audit trail only; a completion with no earlier view creates no
 * event row). Called on every watch-complete, including when the
 * points cap is already reached — the watch still happened.
 */
export async function recordWatchComplete({ viewer, video }) {
  const day = utcDay();
  const minutes = Math.min(video.duration ?? 0, 600) / 60;
  try {
    await incDailyStat(String(video.videochanel), day, {
      completions: 1,
      watchMinutes: minutes,
    });
    await ViewEvent.updateOne(
      { viewer: String(viewer), videoid: String(video._id), day },
      { $set: { completed: true } },
    );
  } catch (error) {
    logger.warn({ err: error }, "recordWatchComplete failed — points still awarded, daily stats not updated");
  }
}

/** All-time summed daily stats for one channel (0s when no events yet). */
export async function getChannelTotals(videochanel) {
  const rows = await ChannelDailyStat.aggregate([
    { $match: { videochanel: String(videochanel) } },
    {
      $group: {
        _id: null,
        views: { $sum: "$views" },
        likes: { $sum: "$likes" },
        watchMinutes: { $sum: "$watchMinutes" },
        completions: { $sum: "$completions" },
      },
    },
  ]);
  const totals = rows[0];
  if (!totals) return { ...EMPTY_STAT };
  return {
    views: totals.views ?? 0,
    likes: totals.likes ?? 0,
    watchMinutes: totals.watchMinutes ?? 0,
    completions: totals.completions ?? 0,
  };
}
