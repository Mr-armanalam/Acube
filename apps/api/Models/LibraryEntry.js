// Phase 5: one row per (user, video, library tab) — the single store
// the Library tabs read. Kinds: watchlater / saved / liked. The legacy
// Watchlater and Likedvideo collections are kept as the stores their
// existing endpoints use, and both sides dual-write each other (see
// Controllers/watchlater.js, Controllers/likedvideo.js and
// Controllers/studio.js), so a video added through either route shows
// up in the Library. "saved" exists only here (no legacy collection).
import mongoose from "mongoose";

const libraryEntrySchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    videoid: { type: String, required: true },
    kind: {
      type: String,
      enum: ["watchlater", "saved", "liked"],
      required: true,
    },
    addedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

libraryEntrySchema.index({ userId: 1, videoid: 1, kind: 1 }, { unique: true });
libraryEntrySchema.index({ userId: 1, kind: 1, addedAt: -1 });

export default mongoose.model("LibraryEntry", libraryEntrySchema);
