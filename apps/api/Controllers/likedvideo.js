import likedvideo from "../Models/likevideo.js"
import { paginate, paginationOf } from "../utils/pagination.js";

// Phase 3b: the viewer is ALWAYS req.userid (a body `viewer` is
// ignored), lists are scoped to the caller, and adds are upserts — the
// unique (videoid, viewer) index makes a re-add a no-op instead of a
// duplicate row.
export const likedvideocontroller = async (req, res) => {
    const { videoid } = req.body;
    const viewer = String(req.userid);
    try {
        await likedvideo.findOneAndUpdate(
            { videoid, viewer },
            { videoid, viewer },
            { upsert: true, returnDocument: "after" },
        )
        res.status(200).json("added to likedvideo")
    } catch (error) {
        res.status(400).json(error.message)
        return
    }
}
export const getalllikedvideo= async (req, res) => {
    try {
        // Phase 3b: authed + scoped to the caller + paginated + lean.
        const page = await paginate(
            likedvideo.find({ viewer: String(req.userid) }).sort({ likedon: 1, _id: 1 }),
            paginationOf(req),
        );
        res.status(200).send(page)
    } catch (error) {
        res.status(400).json(error.message)
        return
    }
}
export const deletelikedvideo = async (req, res) => {
    const { videoid: videoid, viewer: viewer } = req.params;
    // Phase 3b: a user may only remove their OWN liked rows.
    if (String(viewer) !== String(req.userid)) {
        return res.status(403).json({ error: { code: "FORBIDDEN", message: "You can only remove your own liked videos" } })
    }
    try {
        await likedvideo.findOneAndDelete({
            videoid:videoid,viewer:viewer,
        })
        res.status(200).json({message:"removed from liked video"})
    } catch (error) {
        res.status(400).json(error.message)
        return
    }

}
