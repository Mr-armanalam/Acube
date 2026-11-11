import comment from "../Models/comment.js";
import videofile from "../Models/videofile.js";
import mongoose from "mongoose";
import { paginate, paginationOf } from "../utils/pagination.js";

// Phase 3b: no more `new comment(req.body)` — the DTO is explicit and
// the author is always req.userid, never a body `userid` (a caller
// could otherwise post, edit, or delete as someone else).
export const postcomment = async (req, res) => {
    const { videoid, commentbody, usercommented, parentId } = req.body
    // Phase 5: a reply's parent must be a live comment on the SAME
    // video — a missing parent, a parent on another video, or a deleted
    // parent is 400 (a malformed parentId is already 400 from Zod).
    if (parentId) {
        const parent = await comment.findById(parentId);
        if (
            !parent ||
            String(parent.videoid) !== String(videoid) ||
            parent.deleted
        ) {
            return res.status(400).json({
                error: {
                    code: "VALIDATION_ERROR",
                    message: "parentId must reference a live comment on the same video",
                },
            });
        }
    }
    const postcomment = new comment({
        videoid,
        userid: String(req.userid),
        commentbody,
        usercommented,
        parentId: parentId ?? null,
    })
    try {
        await postcomment.save()
        res.status(200).json("posted the comment")
    } catch (error) {
        res.status(400).json(error.message)
        return
    }
}

// Phase 5: collect the ids of every descendant of the given comment
// ids (breadth-first over parentId, capped at depth 10 / 1000 rows) so
// a deleted parent's subtree can be hidden from the list query.
async function collectDescendantIds(rootIds) {
    const hidden = new Set();
    let frontier = rootIds;
    for (let depth = 0; depth < 10 && frontier.length > 0; depth += 1) {
        const children = await comment
            .find({ parentId: { $in: frontier } })
            .select("_id")
            .lean();
        frontier = [];
        for (const child of children) {
            const id = String(child._id);
            if (!hidden.has(id)) {
                hidden.add(id);
                frontier.push(id);
            }
        }
        if (hidden.size > 1000) break;
    }
    return hidden;
}

export const getcomment = async (req, res) => {
    try {
        // Phase 3b: paginated + lean, shape { items, page, limit, total,
        // totalPages }. PUBLIC READ BY DESIGN: the comment list is shown
        // on a video page to logged-out visitors, so this route stays
        // unauthenticated (recorded decision — see PHASE3B_NOTES.md).
        // Optional ?videoid= filter so clients need not fetch everything.
        // Phase 5: ?parentId=<id> fetches one thread's direct replies;
        // every item carries parentId (null = top-level), so clients can
        // thread the flat list themselves. Deleted comments are returned
        // with body "[deleted]"; their SUBTREE is hidden from everyone
        // except the video's owner (moderation view) — but only when the
        // list is scoped to one video (?videoid=), which is the
        // video-page case the hiding exists for.
        const filter = req.pagination?.videoid
            ? { videoid: req.pagination.videoid }
            : {};
        if (req.pagination?.parentId) {
            filter.parentId = req.pagination.parentId;
        }
        if (req.pagination?.videoid) {
            const deletedRoots = await comment
                .find({ videoid: req.pagination.videoid, deleted: true })
                .select("_id")
                .lean();
            if (deletedRoots.length > 0) {
                let isVideoOwner = false;
                if (req.userid) {
                    try {
                        const video = await videofile
                            .findById(req.pagination.videoid)
                            .select("videochanel")
                            .lean();
                        isVideoOwner =
                            !!video &&
                            String(video.videochanel) === String(req.userid);
                    } catch {
                        isVideoOwner = false;
                    }
                }
                if (!isVideoOwner) {
                    const hidden = await collectDescendantIds(
                        deletedRoots.map((d) => String(d._id)),
                    );
                    if (hidden.size > 0) filter._id = { $nin: [...hidden] };
                }
            }
        }
        // Watch page: ?sort=newest flips the order (newest first) so
        // the newest comments are on page 1; the default stays
        // oldest-first (Studio never sends sort).
        const newestFirst = req.pagination?.sort === "newest";
        const page = await paginate(
            comment
                .find(filter)
                .sort(
                    newestFirst
                        ? { commentedon: -1, _id: -1 }
                        : { commentedon: 1, _id: 1 },
                ),
            paginationOf(req),
        );
        // Phase 5 fix: hasReply — true when at least one reply names
        // this comment as its parent (drives the Studio "Unreplied"
        // filter client-side too).
        const itemIds = page.items.map((c) => String(c._id));
        const repliedParentIds =
            itemIds.length > 0
                ? await comment
                    .distinct("parentId", { parentId: { $in: itemIds } })
                    .catch(() => [])
                : [];
        const replied = new Set(repliedParentIds.map((id) => String(id)));
        res.status(200).send({
            ...page,
            items: page.items.map((c) => ({
                ...c,
                hasReply: replied.has(String(c._id)),
                // Watch page: server-owned reaction counts + the
                // requesting user's reaction (null when anonymous).
                ...reactionFields(c, req.userid),
            })),
        })
    } catch (error) {
        res.status(400).json(error.message)
        return
    }
}

// Watch page: server-owned per-user like/dislike reactions on a
// comment (POST /comment/:id/like, POST /comment/:id/dislike).
// `reactionFields` derives the public shape from a comment doc (lean
// or Mongoose): counts are the array lengths, never stored counters,
// and userReaction is the requesting user's reaction — "like" /
// "dislike" / null (null when anonymous, or when they reacted
// neither way). Old rows without the arrays read as zero reactions.
// Shared with Controllers/studio.js (Studio Comments list) so both
// comment lists report the same shape.
export function reactionFields(doc, userId) {
    const likedBy = Array.isArray(doc.likedBy)
        ? doc.likedBy.map(String)
        : [];
    const dislikedBy = Array.isArray(doc.dislikedBy)
        ? doc.dislikedBy.map(String)
        : [];
    const uid = userId != null ? String(userId) : null;
    const userReaction =
        uid == null
            ? null
            : likedBy.includes(uid)
              ? "like"
              : dislikedBy.includes(uid)
                ? "dislike"
                : null;
    return { likes: likedBy.length, dislikes: dislikedBy.length, userReaction };
}

// Toggle one reaction. Liking removes a dislike and vice versa;
// toggling the same reaction again removes it. A user id is in at
// most one array at any time (the update $pulls the other side in
// the same write). Auth required (route); unknown or malformed id
// is 404 NOT_FOUND (not 400 — the contract for these two endpoints).
async function toggleCommentReaction(req, res, reaction) {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(404).json({
            error: { code: "NOT_FOUND", message: "Comment not found" },
        });
    }
    try {
        const found = await comment.findById(id);
        if (!found) {
            return res.status(404).json({
                error: { code: "NOT_FOUND", message: "Comment not found" },
            });
        }
        const uid = String(req.userid);
        const ownField = reaction === "like" ? "likedBy" : "dislikedBy";
        const otherField = reaction === "like" ? "dislikedBy" : "likedBy";
        const already = (found[ownField] ?? []).map(String).includes(uid);
        const update = already
            ? { $pull: { [ownField]: uid } }
            : {
                  $addToSet: { [ownField]: uid },
                  $pull: { [otherField]: uid },
              };
        const updated = await comment
            .findByIdAndUpdate(id, update, { returnDocument: "after" })
            .lean();
        return res.status(200).json(reactionFields(updated, uid));
    } catch (error) {
        res.status(400).json(error.message);
        return;
    }
}

export const likecomment = (req, res) =>
    toggleCommentReaction(req, res, "like");

export const dislikecomment = (req, res) =>
    toggleCommentReaction(req, res, "dislike");

async function ownedCommentOrError(req, res, _id) {
    const found = await comment.findById(_id);
    if (!found) {
        res.status(404).send("Comments unavailable..");
        return null;
    }
    if (String(found.userid) !== String(req.userid)) {
        res.status(403).json({ error: { code: "FORBIDDEN", message: "You can only change your own comments" } });
        return null;
    }
    return found;
}

// Phase 5: who may delete a comment — its author, OR the owner of the
// video it is on (Studio moderation: a creator deletes spam on their
// own video). The video lookup is guarded: comments on videos that no
// longer exist (or non-ObjectId videoids from old data) are
// author-only.
async function canDeleteComment(req, found) {
    if (String(found.userid) === String(req.userid)) return true;
    if (!mongoose.Types.ObjectId.isValid(String(found.videoid))) return false;
    try {
        const video = await videofile
            .findById(found.videoid)
            .select("videochanel")
            .lean();
        return !!video && String(video.videochanel) === String(req.userid);
    } catch {
        return false;
    }
}

export const deletecomment = async (req, res) => {
    const { id: _id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res.status(400).send("Comments unavailable..")
    }
    try {
        const found = await comment.findById(_id);
        if (!found) {
            res.status(404).send("Comments unavailable..");
            return;
        }
        // Phase 3b: owner check (403 for another user's comment);
        // Phase 5: extended to the video's owner (see canDeleteComment).
        if (!(await canDeleteComment(req, found))) {
            res.status(403).json({ error: { code: "FORBIDDEN", message: "You can only delete your own comments or comments on your videos" } });
            return;
        }
        // Phase 5: deleting a PARENT soft-deletes it (deleted:true,
        // body "[deleted]") so its replies keep their anchor and the
        // subtree can be hidden from non-owners (see getcomment). A
        // leaf comment is hard-deleted, as before — the existing test
        // pins that a deleted leaf row is gone.
        const hasChildren = await comment.exists({ parentId: String(found._id) });
        if (hasChildren) {
            await comment.findByIdAndUpdate(_id, {
                $set: { deleted: true, commentbody: "[deleted]" },
            });
            res.status(200).json({ message: "deleted comment", deleted: true });
            return;
        }
        await comment.findByIdAndDelete(_id);
        res.status(200).json({ message: "deleted comment" })
    } catch (error) {
        res.status(400).json(error.message)
        return
    }
}

export const editcomment = async (req, res) => {
    const { id: _id } = req.params;
    const { commentbody } = req.body;
    if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res.status(400).send("Comments unavailable..")
    }
    try {
        // Phase 3b: owner check (403 for another user's comment).
        const found = await ownedCommentOrError(req, res, _id);
        if (!found) return;
        // Phase 5: a soft-deleted comment cannot be edited back to life.
        if (found.deleted) {
            res.status(400).json({
                error: {
                    code: "VALIDATION_ERROR",
                    message: "A deleted comment cannot be edited",
                },
            });
            return;
        }
        const updatecomment = await comment.findByIdAndUpdate(
            _id,
            { $set: { "commentbody": commentbody } },
            { returnDocument: "after" },
        )
        res.status(200).json(updatecomment)
    } catch (error) {
        res.status(400).json(error.message)
        return
    }
}

// Phase 5 fix: pin a comment (POST /comment/:id/pin). ONLY the creator
// of the video the comment is on may pin — the comment's author, any
// other viewer, and a stranger all get 403. Pinning unpins every other
// comment on the same video, so there is exactly one pinned comment
// per video. pinnedByCreator holds the pinning creator's user id (or
// null when not pinned) — a string id, not a boolean, so the client
// can tell WHO pinned it. Pinning an already-pinned comment is a 200
// no-op; a soft-deleted comment cannot be pinned (400).
export const pincomment = async (req, res) => {
    const { id: _id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res.status(400).send("Comments unavailable..")
    }
    try {
        const found = await comment.findById(_id);
        if (!found) {
            return res.status(404).send("Comments unavailable..");
        }
        if (found.deleted) {
            return res.status(400).json({
                error: {
                    code: "VALIDATION_ERROR",
                    message: "A deleted comment cannot be pinned",
                },
            });
        }
        if (!mongoose.Types.ObjectId.isValid(String(found.videoid))) {
            return res.status(404).send("Comments unavailable..");
        }
        const video = await videofile
            .findById(found.videoid)
            .select("videochanel")
            .lean();
        if (!video || String(video.videochanel) !== String(req.userid)) {
            return res.status(403).json({
                error: {
                    code: "FORBIDDEN",
                    message: "Only the creator of the video can pin a comment",
                },
            });
        }
        await comment.updateMany(
            { videoid: found.videoid, _id: { $ne: found._id } },
            { $set: { pinnedByCreator: null } },
        );
        const updated = await comment.findByIdAndUpdate(
            _id,
            { $set: { pinnedByCreator: String(req.userid) } },
            { returnDocument: "after" },
        );
        return res.status(200).json(updated);
    } catch (error) {
        res.status(400).json(error.message)
        return
    }
}
