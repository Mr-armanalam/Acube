import videofile from "../Models/videofile.js";
import mongoose from "mongoose";
import { recordView } from "../utils/analytics.js";
export const viewscontroller = async (req, res, next) => {
    const { id: _id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res.status(404).send("video unavailable..")
    }
    try {
        // Phase 5 fix: a soft-deleted video, or another creator's
        // private/draft video, is not viewable — and not countable.
        const existing = await videofile.findById(_id).select("videochanel visibility deletedAt").lean();
        if (!existing || existing.deletedAt != null) {
            return res.status(404).send("video unavailable..");
        }
        const visibility = existing.visibility ?? "public";
        if (
            (visibility === "private" || visibility === "draft") &&
            String(existing.videochanel) !== String(req.userid)
        ) {
            return res.status(404).send("video unavailable..");
        }
        // Phase 3b: atomic $inc — the old read-then-$set lost increments
        // under concurrent views. (Auth was also added to this route in
        // Phase 3b: view counts are now recorded for signed-in users
        // only; logged-out views are not counted. See PHASE3B_NOTES.md.)
        const updateview = await videofile.findByIdAndUpdate(
            _id,
            { $inc: { views: 1 } },
            { returnDocument: "after" },
        )
        if (!updateview) {
            return res.status(404).send("video unavailable..");
        }
        // Phase 5: record the view event + daily stat (deduped: one
        // counted view per viewer per video per UTC day — see
        // utils/analytics.js). The per-video counter above still
        // increments on every call (Phase 3b behaviour, pinned by
        // tests); the daily stat is the deduped count.
        await recordView({ viewer: req.userid, video: updateview });
        res.status(200).json(updateview)
    } catch (error) {
        // Phase 1: Express 5 removed the two-arg res.json(body, status)
        // form (the second arg was silently dropped) — forward async errors
        // to the central error handler instead.
        next(error)
    }
}
