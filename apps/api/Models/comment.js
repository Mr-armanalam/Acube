import mongoose from "mongoose";

const commentschema = mongoose.Schema({
    videoid: String,
    userid: String,
    commentbody: String,
    usercommented: String,
    commentedon: { type: Date, default: Date.now },
    // Phase 5: nested comments. parentId is the _id of the parent
    // comment, or null for a top-level comment. A deleted parent is
    // soft-deleted (see Controllers/Comment.js): deleted=true and the
    // body replaced with "[deleted]" — the row stays so its replies
    // keep their anchor, but the subtree is hidden from non-owners.
    parentId: { type: String, default: null },
    deleted: { type: Boolean, default: false },
    // Phase 5 fix: the user id of the creator who pinned this comment,
    // or null when not pinned. One pinned comment per video: pinning
    // unpins every other comment on the same video (see
    // Controllers/Comment.js pincomment). A string id (not a boolean)
    // so the client can tell WHO pinned it; null is falsy for "pinned".
    pinnedByCreator: { type: String, default: null },
    // Phase 5 fix: demo seed marker (see Models/Auth.js).
    demo: { type: Boolean, default: false },
})

// Phase 3b: comment lists are filtered by video.
commentschema.index({ videoid: 1, commentedon: -1 });
// Phase 5: fetching one thread's replies (?parentId=...) and walking a
// deleted parent's subtree.
commentschema.index({ videoid: 1, parentId: 1, createdAt: 1 });
// Phase 5 fix: the pinned comment lookup (one pinned per video).
commentschema.index({ videoid: 1, pinnedByCreator: 1 });
export default mongoose.model("Comments", commentschema)