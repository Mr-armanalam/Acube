import comment from "../Models/comment.js";
import mongoose from "mongoose";
import { paginate, paginationOf } from "../utils/pagination.js";

// Phase 3b: no more `new comment(req.body)` — the DTO is explicit and
// the author is always req.userid, never a body `userid` (a caller
// could otherwise post, edit, or delete as someone else).
export const postcomment = async (req, res) => {
    const { videoid, commentbody, usercommented } = req.body
    const postcomment = new comment({
        videoid,
        userid: String(req.userid),
        commentbody,
        usercommented,
    })
    try {
        await postcomment.save()
        res.status(200).json("posted the comment")
    } catch (error) {
        res.status(400).json(error.message)
        return
    }
}

export const getcomment = async (req, res) => {
    try {
        // Phase 3b: paginated + lean, shape { items, page, limit, total,
        // totalPages }. PUBLIC READ BY DESIGN: the comment list is shown
        // on a video page to logged-out visitors, so this route stays
        // unauthenticated (recorded decision — see PHASE3B_NOTES.md).
        // Optional ?videoid= filter so clients need not fetch everything.
        const filter = req.pagination?.videoid
            ? { videoid: req.pagination.videoid }
            : {};
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

export const deletecomment = async (req, res) => {
    const { id: _id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res.status(400).send("Comments unavailable..")
    }
    try {
        // Phase 3b: owner check (403 for another user's comment).
        if (!(await ownedCommentOrError(req, res, _id))) return;
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
        if (!(await ownedCommentOrError(req, res, _id))) return;
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
