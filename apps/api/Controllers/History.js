import mongoose from "mongoose";
import history from "../Models/history.js";
import User from "../Models/Auth.js";
import Videofile from "../Models/videofile.js";
import { paginate, paginationOf } from "../utils/pagination.js";

// Phase 3b: the viewer is ALWAYS req.userid (a body `viewer` is
// ignored), lists are scoped to the caller, and adds are upserts — the
// unique (videoid, viewer) index makes a re-add a no-op instead of a
// duplicate row.
// Phase 5 fix: when the caller's historyPaused flag is set, an add is
// a no-op (200, recorded:false) — nothing is written. The flag itself
// is read/changed via GET/PATCH /user/history-paused.
export const historycontroller=async(req,res)=>{
    const { videoid } = req.body;
    const viewer = String(req.userid);
    try {
        const user = await User.findById(viewer).select("historyPaused").lean();
        if (user?.historyPaused) {
            return res.status(200).json({
                message: "History is paused — not recorded",
                recorded: false,
            });
        }
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

// Phase 5 fix: resume position for one (viewer, video) pair.
// PATCH /video/history/:videoid/progress { progressSec } — the viewer
// is req.userid, so the row is the caller's own by construction (no
// other viewer's row is reachable). The value is clamped server-side
// to 0..durationSec (durationSec ?? duration; no upper clamp when the
// video has no known duration). A missing history row is created by
// the upsert — watching IS history. A paused history does not record:
// 200 with recorded:false and no row written. A missing video, a
// soft-deleted video, or another creator's private/draft video is 404.
export const updateHistoryProgress = async (req, res) => {
    const { videoid } = req.params;
    const viewer = String(req.userid);
    const { progressSec } = req.body;
    try {
        const user = await User.findById(viewer).select("historyPaused").lean();
        if (user?.historyPaused) {
            return res.status(200).json({
                message: "History is paused — progress not recorded",
                recorded: false,
                progressSec: null,
            });
        }
        const video = await Videofile.findById(videoid).lean();
        if (!video || video.deletedAt != null) {
            return res.status(404).json({
                error: { code: "NOT_FOUND", message: "Video not found" },
            });
        }
        const visibility = video.visibility ?? "public";
        const isOwner = String(video.videochanel) === viewer;
        if ((visibility === "private" || visibility === "draft") && !isOwner) {
            return res.status(404).json({
                error: { code: "NOT_FOUND", message: "Video not found" },
            });
        }
        const duration = video.durationSec ?? video.duration ?? null;
        const clamped =
            duration != null
                ? Math.min(Math.max(progressSec, 0), duration)
                : Math.max(progressSec, 0);
        const row = await history.findOneAndUpdate(
            { videoid, viewer },
            { $set: { progressSec: clamped, likedon: new Date() } },
            { upsert: true, returnDocument: "after" },
        );
        return res.status(200).json({
            message: "Progress saved",
            recorded: true,
            videoid,
            viewer,
            progressSec: row.progressSec,
            durationSec: duration,
        });
    } catch (error) {
        res.status(400).json(error.message);
        return;
    }
}

export const getallhistorycontroller=async(req,res)=>{
    try {
        // Phase 3b: authed + scoped to the caller + paginated + lean.
        // Phase 5 fix: each row also carries durationSec (the video's
        // durationSec ?? duration) so the client can render progress
        // as a fraction; progressSec is stored on the row itself.
        // Phase 5 fix: newest first — the History page groups by day
        // with Today on top (preview screen I: "newest first"). The
        // list used to sort oldest-first, so Yesterday rendered above
        // Today.
        const page = await paginate(
            history.find({ viewer: String(req.userid) }).sort({ likedon: -1, _id: -1 }),
            paginationOf(req),
        );
        // Legacy history rows can hold non-ObjectId videoids ("vid-1"
        // in the old tests) — only valid ids go into the lookup.
        const ids = page.items
            .map((h) => h.videoid)
            .filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
        const videos = ids.length
            ? await Videofile.find({ _id: { $in: ids } })
                .select("durationSec duration")
                .lean()
            : [];
        const durations = new Map(
            videos.map((v) => [
                String(v._id),
                v.durationSec ?? v.duration ?? null,
            ]),
        );
        res.status(200).send({
            ...page,
            items: page.items.map((h) => ({
                ...h,
                progressSec: h.progressSec ?? 0,
                durationSec: durations.get(String(h.videoid)) ?? null,
            })),
        })
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
