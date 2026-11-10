import mongoose from "mongoose";

const commentschema = mongoose.Schema({
    videoid: String,
    userid: String,
    commentbody: String,
    usercommented: String,
    commentedon: { type: Date, default: Date.now }
})

// Phase 3b: comment lists are filtered by video.
commentschema.index({ videoid: 1, commentedon: -1 });
export default mongoose.model("Comments", commentschema)