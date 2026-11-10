// Phase 5: creator playlists. A playlist belongs to one user (owner =
// their user id, which is also their channel id). videoIds are video
// _id strings, in the creator's order. Visibility follows the video
// rules: a public playlist is readable by anyone, unlisted by direct
// id, private by its owner only (other viewers get 404).
import mongoose from "mongoose";

const playlistSchema = new mongoose.Schema(
  {
    owner: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    visibility: {
      type: String,
      enum: ["public", "unlisted", "private"],
      default: "public",
    },
    videoIds: { type: [String], default: [] },
  },
  { timestamps: true },
);

playlistSchema.index({ owner: 1, createdAt: -1 });

export default mongoose.model("Playlist", playlistSchema);
