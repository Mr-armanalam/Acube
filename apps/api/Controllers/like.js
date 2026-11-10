import videofile from "../Models/videofile.js";
import mongoose from "mongoose";

// Phase 3b: likes are a TOGGLE, not an absolute count. The old code did
// `$set: { Like }` with a client-supplied number, so any caller could
// set a video's like count to anything. Now the body carries only
// { action: "like" | "unlike" } (validated by likeVideoSchema — a body
// like { Like: 5 } is 400) and the counter moves by $inc +1 / -1,
// floored at 0 via a pipeline update so concurrent toggles cannot drive
// it negative or lose increments.
export const likevideocontroller = async (req, res, next) => {

    const {id:_id}=req.params;
    const {action}=req.body;
    if(!mongoose.Types.ObjectId.isValid(_id)){
        return res.status(404).send("video unavailable..")
    }
    try {
        const delta = action === "like" ? 1 : -1;
        const updatelike=await videofile.findByIdAndUpdate(
            _id,
            [
                {
                    $set: {
                        Like: {
                            $max: [
                                0,
                                { $add: [{ $ifNull: ["$Like", 0] }, delta] },
                            ],
                        },
                    },
                },
            ],
            // Mongoose 9 requires this flag for pipeline updates.
            { returnDocument: "after", updatePipeline: true },
        )
        if (!updatelike) {
            return res.status(404).send("video unavailable..")
        }
        res.status(200).json(updatelike)
    } catch (error) {
        // Phase 1: Express 5 removed the two-arg res.json(body, status)
        // form (the second arg was silently dropped) — forward async errors
        // to the central error handler instead.
        next(error)
    }

}
