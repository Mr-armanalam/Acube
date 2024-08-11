import { uploadOnCloudinary } from "../cloudinary.js";
import videofile from "../Models/videofile.js";
export const uploadvideo = async (req, res) => {
  if (req.file === undefined) {
    res.status(404).json({ message: "plz upload a mp.4 video file only" });
  } else {
    try {
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
        filename: req.file.originalname,
        filepath: video.url,
        filetype: req.file.mimetype,
        filesize: req.file.size,
        videochanel: req.body.chanel,
        uploader: req.body.uploader,
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
    const files = await videofile.find();
   // console.log(files);
    res.status(200).send(files);
  } catch (error) {
    res.status(404).json(error.message);
    return;
  }
};
