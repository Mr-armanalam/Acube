import mongoose from "mongoose"
const watchalatervideoschema=mongoose.Schema({
    videoid:{type:String,required:true},
    viewer:{type:String,required:true},
    likedon:{type:Date,default:Date.now()}
})

// Phase 3b: one watch-later row per (video, viewer).
watchalatervideoschema.index({ videoid: 1, viewer: 1 }, { unique: true });
export default mongoose.model("Watchlater",watchalatervideoschema)