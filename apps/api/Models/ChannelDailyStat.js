// Phase 5: one row per (channel, UTC day) with atomic $inc aggregates
// — the source of truth for Studio analytics. Written ONLY by the
// server (see utils/analytics.js): view / like-toggle / completed-watch
// handlers. Never written from client input, and never backfilled with
// invented history: a channel with no event rows shows 0 for days
// before Phase 5, and lifetime totals in the Dashboard come from the
// per-video counters (labelled "all time" in the response).
import mongoose from "mongoose";

const channelDailyStatSchema = new mongoose.Schema(
  {
    videochanel: { type: String, required: true },
    // UTC date "YYYY-MM-DD".
    day: { type: String, required: true },
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    watchMinutes: { type: Number, default: 0 },
    // A completed watch adds 1 here; watchMinutes is capped by duration
    // (min(durationSeconds, 600) / 60 per completion).
    completions: { type: Number, default: 0 },
    // Phase 5 fix: demo seed marker (see Models/Auth.js).
    demo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

channelDailyStatSchema.index({ videochanel: 1, day: 1 }, { unique: true });

export default mongoose.model("ChannelDailyStat", channelDailyStatSchema);
