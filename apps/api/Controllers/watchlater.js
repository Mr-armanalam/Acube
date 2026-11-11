import watchlater from "../Models/watchlater.js";
import LibraryEntry from "../Models/LibraryEntry.js";
import logger from "../utils/logger.js";
import { paginate, paginationOf } from "../utils/pagination.js";

// Phase 5: dual-write the LibraryEntry row for the same (user, video,
// kind) so the Library tabs (which read LibraryEntry rows, unioned
// with this collection) stay in step. A LibraryEntry failure must not
// fail the watch-later add itself, so it is logged and swallowed.
async function syncLibraryEntry(viewer, videoid) {
    try {
        await LibraryEntry.findOneAndUpdate(
            { userId: viewer, videoid, kind: "watchlater" },
            { userId: viewer, videoid, kind: "watchlater", addedAt: new Date() },
            { upsert: true },
        );
    } catch (error) {
        logger.warn({ err: error }, "watchlater LibraryEntry sync failed");
    }
}

async function removeLibraryEntry(viewer, videoid) {
    try {
        await LibraryEntry.deleteOne({ userId: viewer, videoid, kind: "watchlater" });
    } catch (error) {
        logger.warn({ err: error }, "watchlater LibraryEntry removal failed");
    }
}

// Phase 3b: the viewer is ALWAYS req.userid (a body `viewer` is
// ignored), lists are scoped to the caller, and adds are upserts — the
// unique (videoid, viewer) index makes a re-add a no-op instead of a
// duplicate row.
export const watchlatercontroller = async (req, res) => {
    const { videoid } = req.body;
    const viewer = String(req.userid);
    try {
        await watchlater.findOneAndUpdate(
            { videoid, viewer },
            { videoid, viewer },
            { upsert: true, returnDocument: "after" },
        )
        await syncLibraryEntry(viewer, videoid);
        res.status(200).json("added to watchlater")
    } catch (error) {
        res.status(400).json(error.message)
        return
    }
}
export const getallwatchlatervontroller = async (req, res) => {
    try {
        // Phase 3b: authed + scoped to the caller + paginated + lean.
        const page = await paginate(
            watchlater.find({ viewer: String(req.userid) }).sort({ likedon: 1, _id: 1 }),
            paginationOf(req),
        );
        res.status(200).send(page)
    } catch (error) {
        res.status(400).json(error.message)
        return
    }
}
export const deletewatchlater = async (req, res) => {
    const { videoid: videoid, viewer: viewer } = req.params
    // Phase 3b: a user may only remove their OWN watch-later rows.
    if (String(viewer) !== String(req.userid)) {
        return res.status(403).json({ error: { code: "FORBIDDEN", message: "You can only remove your own watch-later videos" } })
    }
    try {
        await watchlater.findOneAndDelete({
            videoid:videoid,viewer:viewer,
        })
        await removeLibraryEntry(viewer, videoid);
        res.status(200).json({message:"removed from watch later"})
    } catch (error) {
        res.status(400).json(error.message)
        return
    }

}
