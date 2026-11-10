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
        }
    },
    {
        timestamps:true,
    }
)

// Phase 3b: the video list is paged by createdAt.
videofileschema.index({ createdAt: -1 });
export default mongoose.model("Videofiles",videofileschema);
