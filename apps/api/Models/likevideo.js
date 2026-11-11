import mongoose from "mongoose"
const likedvideoschema=mongoose.Schema({
    videoid:{type:String,required:true},
    viewer:{type:String,required:true},
    likedon:{type:Date,default:Date.now()},
    // Phase 5 fix: demo seed marker (see Models/Auth.js).
    demo:{type:Boolean,default:false}
})

// Phase 3b: one liked row per (video, viewer).
likedvideoschema.index({ videoid: 1, viewer: 1 }, { unique: true });
export default mongoose.model("Likedvideo",likedvideoschema)