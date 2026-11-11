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
        // Phase 5 fix: "draft" joins the enum (owner-only, never in
        // feeds/search, like private). description/tags/thumbnailUrl/
        // durationSec are the contract field names (see
        // apps/web/src/types.ts Video); duration/thumbnail stay as the
        // legacy Cloudinary field names alongside them.
        visibility:{
            type:String,
            enum:["public","unlisted","private","draft"],
            default:"public",
        },
        status:{
            type:String,
            enum:["ready","processing"],
            default:"ready",
        },
        description:{
            type:String,
            default:"",
        },
        tags:{
            type:[String],
            default:[],
        },
        thumbnailUrl:{
            type:String,
            default:null,
        },
        // Auto-thumbnails: the three candidate frame URLs (5% / 50% /
        // 90% of the duration, in that order) — Cloudinary eager
        // stills on the Cloudinary path, /uploads/<videoId>-thumb-<n>
        // .jpg files on the local fallback path. thumbnailUrl is the
        // CHOSEN frame: an uploaded thumbnail file wins, then a pasted
        // thumbnailUrl, then the middle candidate (index 1), then the
        // legacy Cloudinary thumbnail_url, else null. Empty when no
        // frames could be generated (never invented, never fatal to
        // the upload — see Controllers/video.js).
        autoThumbnails:{
            type:[String],
            default:[],
        },
        durationSec:{
            type:Number,
            default:null,
        },
        // Watch page: real chapters only — [{ title, startSec }],
        // validated by chaptersSchema in @acube/shared (title
        // non-empty, max 120 chars; startSec >= 0; strictly
        // ascending, no duplicates). Absent/empty means "no
        // chapters" — the player renders no ticks, never invented
        // ones. Set on upload and via PATCH /video/:id.
        chapters:{
            type:[{
                title:{ type:String, required:true },
                startSec:{ type:Number, required:true },
            }],
            default:[],
        },
        // Phase 5 fix: soft delete. DELETE /video/:id sets this
        // (nothing is hard-deleted any more); POST /video/:id/restore
        // clears it. A soft-deleted video is 404 on GET /video/:id,
        // excluded from the feed/search/suggestions/library, and still
        // listed in GET /studio/videos so its owner can restore it.
        // Missing field (pre-fix rows) means "not deleted".
        deletedAt:{
            type:Date,
            default:null,
        },
        // Phase 5 fix: demo seed marker (see Models/Auth.js).
        demo:{
            type:Boolean,
            default:false,
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
// Phase 5 fix: soft-delete + tag filters (feed/suggestions exclude
// deletedAt != null; Studio search filters on tags).
videofileschema.index({ deletedAt: 1 });
videofileschema.index({ tags: 1 });
export default mongoose.model("Videofiles",videofileschema);
