import videofile from "../Models/videofile.js";
import mongoose from "mongoose";
export const viewscontroller = async (req, res, next) => {
    const { id: _id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res.status(404).send("video unavailable..")
    }
    try {
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
        res.status(200).json(updateview)
    } catch (error) {
        // Phase 1: Express 5 removed the two-arg res.json(body, status)
        // form (the second arg was silently dropped) — forward async errors
        // to the central error handler instead.
        next(error)
    }
}
