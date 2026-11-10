import mongoose from "mongoose"
const historyschema=mongoose.Schema({
    videoid:{type:String,required:true},
    viewer:{type:String,required:true},
    likedon:{type:Date,default:Date.now()}
})

// Phase 3b: one history row per (video, viewer) — duplicates are
// rejected by this index (upserts in the controller make re-adds a no-op).
historyschema.index({ videoid: 1, viewer: 1 }, { unique: true });

export default mongoose.model("History",historyschema)