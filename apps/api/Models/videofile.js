import mongoose from "mongoose"
const videofileschema=new mongoose.Schema(
    {
        videotitle:{
            type:String,
            required:true,
        },
        filename:{
            type:String,
            required:true,
        },
        filetype:{
            type:String,
            required:true,
        },
        filepath:{
            type:String,
            required:true,
        },
        filesize:{
            type:String,
            required:true,
        },
        videochanel:{
            type:String,
            required:true,
        },
        Like:{
            type:Number,
            default:0,
        },
        views:{
            type:Number,
            default:0,
        },
        uploader:{
            type:String
        },
        // Phase 3b: stored from the Cloudinary upload response when
        // present (secure_url is the filepath; duration in seconds).
        duration:{
            type:Number,
            default:null,
        },
        thumbnail:{
            type:String,
            default:null,
        },
        // Phase 5: visibility + processing status. visibility defaults
        // to "public" (unchanged behaviour for new uploads); rows
        // created before Phase 5 have no field and are treated as
        // public by the feed filter (see Controllers/video.js).
        // status is "ready" for every upload today — there is no
        // transcoding pipeline yet; the field exists so Studio can
        // show a processing state when one lands.
        visibility:{
            type:String,
            enum:["public","unlisted","private"],
            default:"public",
        },
        status:{
            type:String,
            enum:["ready","processing"],
            default:"ready",
        }
    },
    {
        timestamps:true,
    }
)

// Phase 3b: the video list is paged by createdAt.
videofileschema.index({ createdAt: -1 });
// Phase 5: the Studio content list (own videos, newest first) and the
// public feed (public videos, newest first).
videofileschema.index({ videochanel: 1, createdAt: -1 });
videofileschema.index({ visibility: 1, createdAt: -1 });
export default mongoose.model("Videofiles",videofileschema);
