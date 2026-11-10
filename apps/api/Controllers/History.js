import history from "../Models/history.js";
import { paginate, paginationOf } from "../utils/pagination.js";

// Phase 3b: the viewer is ALWAYS req.userid (a body `viewer` is
// ignored), lists are scoped to the caller, and adds are upserts — the
// unique (videoid, viewer) index makes a re-add a no-op instead of a
// duplicate row.
export const historycontroller=async(req,res)=>{
    const { videoid } = req.body;
    const viewer = String(req.userid);
    try {
        await history.findOneAndUpdate(
            { videoid, viewer },
            { videoid, viewer },
            { upsert: true, returnDocument: "after" },
        )
        res.status(200).json("added to history")
    } catch (error) {
        res.status(400).json(error.message)
        return
    }
}

export const getallhistorycontroller=async(req,res)=>{
    try {
        // Phase 3b: authed + scoped to the caller + paginated + lean.
        const page = await paginate(
            history.find({ viewer: String(req.userid) }).sort({ likedon: 1, _id: 1 }),
            paginationOf(req),
        );
        res.status(200).send(page)
    } catch (error) {
        res.status(400).json(error.message)
        return
    }
}

export const deletehistory =async(req,res)=>{
    const{userid:userid}=req.params;
    // Phase 3b: a user may only clear their OWN history.
    if (String(userid) !== String(req.userid)) {
        return res.status(403).json({ error: { code: "FORBIDDEN", message: "You can only clear your own history" } })
    }
    try {
        await history.deleteMany({
            viewer:userid
        })
        res.status(200).json({message:"removed from history"})
    } catch (error) {
        res.status(400).json(error.message)
        return
    }
}

// Phase 5: delete ONE history row — the viewer (req.userid) is the only
// owner; a :viewer that is not the caller is 403, never a silent no-op.
export const deletehistoryitem = async (req, res) => {
    const { videoid, viewer } = req.params;
    if (String(viewer) !== String(req.userid)) {
        return res.status(403).json({ error: { code: "FORBIDDEN", message: "You can only remove your own history" } });
    }
    try {
        const removed = await history.deleteOne({ videoid, viewer });
        if (removed.deletedCount === 0) {
            return res.status(404).json({ error: { code: "NOT_FOUND", message: "History entry not found" } });
        }
        res.status(200).json({ message: "removed from history" });
    } catch (error) {
        res.status(400).json(error.message);
    }
}
