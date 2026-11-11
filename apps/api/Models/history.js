import mongoose from "mongoose"
const historyschema=mongoose.Schema({
    videoid:{type:String,required:true},
    viewer:{type:String,required:true},
    likedon:{type:Date,default:Date.now()},
    // Phase 5 fix: resume position in seconds for this (viewer, video)
    // pair — the single store for watch progress (see
    // Controllers/History.js updateHistoryProgress). It lives here, not
    // on LibraryEntry (kind-scoped) or ViewEvent (per-day audit rows):
    // a resume position is per viewer+video, exactly this row's key.
    // Clamped server-side to 0..durationSec (durationSec ?? duration).
    progressSec:{type:Number,default:0},
    // Phase 5 fix: demo seed marker (see Models/Auth.js).
    demo:{type:Boolean,default:false}
})

// Phase 3b: one history row per (video, viewer) — duplicates are
// rejected by this index (upserts in the controller make re-adds a no-op).
historyschema.index({ videoid: 1, viewer: 1 }, { unique: true });

export default mongoose.model("History",historyschema)