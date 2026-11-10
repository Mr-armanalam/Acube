// Phase 3b: audit rows for server-awarded watch points. One row per
// completed watch that earned points. The points rule (5 per completion,
// max 10 per video per day) is enforced by summing these rows for
// (userId, videoid, day) before awarding — see Controllers/Auth.js
// watchComplete. Rows are never written from client input.
import mongoose from "mongoose";

const pointsAwardSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    videoid: { type: String, required: true },
    // UTC date "YYYY-MM-DD" the points were awarded on.
    day: { type: String, required: true },
    points: { type: Number, required: true },
  },
  { timestamps: true },
);

pointsAwardSchema.index({ userId: 1, videoid: 1, day: 1 });

export default mongoose.model("PointsAward", pointsAwardSchema);
