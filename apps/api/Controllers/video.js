import { uploadOnCloudinary } from "../cloudinary.js";
import videofile from "../Models/videofile.js";
import User from "../Models/Auth.js";
import { MAX_UPLOAD_BYTES, SUPPORTED_VIDEO_MIMETYPES } from "@acube/shared";
import { paginate, paginationOf } from "../utils/pagination.js";

// Phase 3b upload hardening:
//  * MIME + size are re-checked here (multer's filter/limit are the
//    first line, this is defence in depth — never trust the client);
//  * the uploader is req.userid's display name, NEVER req.body.uploader
//    (a body value could impersonate another channel);
//  * the stored filename is multer's sanitised name (see
//    Helper/filehelper.js), never the raw originalname;
//  * the filepath is Cloudinary's secure_url, and duration/thumbnail are
//    stored when Cloudinary returns them.
export const uploadvideo = async (req, res) => {
  if (req.file === undefined) {
    res.status(404).json({ message: "plz upload a mp.4 video file only" });
  } else {
    try {
      if (!SUPPORTED_VIDEO_MIMETYPES.includes(req.file.mimetype)) {
        res.status(400).json({ message: "Only mp4 video files are supported" });
        return;
      }
      if (req.file.size > MAX_UPLOAD_BYTES) {
        res.status(400).json({ message: "File must be less than 10 MB" });
        return;
      }
      const uploader = await User.findById(req.userid).lean();
      if (!uploader) {
        res.status(404).json({ message: "Uploader not found" });
        return;
      }
      //  console.log(req.file);
      const videoLocalPath = req.file?.path;
      const video = await uploadOnCloudinary(videoLocalPath);
      //console.log(video);
      if (!video) {
        res
          .status(400)
          .json({ message: "Failed to upload video to cloudinary" });
        return;
      }
      const file = new videofile({
        videotitle: req.body.title,
        filename: req.file.filename,
        filepath: video.secure_url ?? video.url,
        filetype: req.file.mimetype,
        filesize: req.file.size,
        videochanel: req.body.chanel,
        uploader: uploader.username ?? uploader.name ?? uploader.email,
        duration: video.duration ?? null,
        thumbnail: video.thumbnail_url ?? null,
      });
      // console.log(file)
      await file.save();
      res.status(200).send("File uploaded successfully");
    } catch (error) {
      res.status(404).json(error.message);
      return;
    }
  }
};

export const getallvideos = async (req, res) => {
  // console.log("get all videos");
  try {
    // Phase 3b: paginated + lean. Response shape is now
    // { items, page, limit, total, totalPages } (see PHASE3B_NOTES.md);
    // items are in upload order (createdAt ascending), as before.
    const page = await paginate(
      videofile.find().sort({ createdAt: 1, _id: 1 }),
      paginationOf(req),
    );
    res.status(200).send(page);
  } catch (error) {
    res.status(404).json(error.message);
    return;
  }
};
