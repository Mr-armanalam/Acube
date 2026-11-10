// Phase 5: one row per view event — the audit trail behind the
// ChannelDailyStat aggregates. Written ONLY by the server (see
// utils/analytics.js recordView): a signed-in viewer watching a video.
// Dedup key is (viewer, videoid, day): a repeat view by the same viewer
// of the same video on the same UTC day is a second event row attempt
// that upserts onto the existing row, so the daily stat counts it once
// (see recordView). Logged-out views are not counted (Phase 3b).
import mongoose from "mongoose";

const viewEventSchema = new mongoose.Schema(
  {
    videoid: { type: String, required: true },
    videochanel: { type: String, required: true },
    viewer: { type: String, required: true },
    // UTC date "YYYY-MM-DD" the view happened on.
    day: { type: String, required: true },
    watchSeconds: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// One counted view per (viewer, video, day) — the upsert key.
viewEventSchema.index({ viewer: 1, videoid: 1, day: 1 }, { unique: true });
viewEventSchema.index({ videoid: 1, day: 1 });
viewEventSchema.index({ videochanel: 1, day: 1 });

export default mongoose.model("ViewEvent", viewEventSchema);
