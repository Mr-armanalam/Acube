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
        const page = await paginate(
            comment.find(filter).sort({ commentedon: 1, _id: 1 }),
            paginationOf(req),
        );
        res.status(200).send(page)
    } catch (error) {
        res.status(400).json(error.message)
        return
    }
}

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
