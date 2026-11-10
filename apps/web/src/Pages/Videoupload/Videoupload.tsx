import React, { useEffect, useRef, useState } from "react";
import "./Videoupload.css";
import ProgressRing from "../../Component/ProgressRing/ProgressRing";
import { useAppDispatch, useAppSelector } from "../../store";
import { useUploadVideo } from "../../query/hooks";
import { resetUpload } from "../../store/slices/uploadSlice";

/** 10 MB upload limit, in bytes. */
export const MAX_VIDEO_BYTES = 10_000_000;

const Videoupload = ({
  setvideouploadpage,
}: {
  setvideouploadpage: (v: boolean) => void;
}) => {
  const [title, settitle] = useState("");
  const [videofile, setvideofile] = useState<File | null>(null);
  // Phase 2c: validation problems are shown inline, not via alert().
  const [validationError, setValidationError] = useState<string | null>(null);
  const currentuser = useAppSelector((s) => s.auth.session);
  // Progress lives in the upload RTK slice; the mutation drives it.
  const progress = useAppSelector((s) => s.upload.progress);
  const uploadStatus = useAppSelector((s) => s.upload.status);
  const uploadError = useAppSelector((s) => s.upload.error);
  const uploadMutation = useUploadVideo();
  const dispatch = useAppDispatch();

  // The old code closed the modal when progress hit 100%; now it closes
  // when the upload actually succeeds.
  // Phase 2c: the slice keeps its last status after the modal unmounts,
  // so a reopened modal would see the stale "success" and close at once.
  // Reset on mount and skip the close on that first render; only a
  // success that happens while THIS modal is open closes it.
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      dispatch(resetUpload());
      return;
    }
    if (uploadStatus === "success") {
      setvideouploadpage(false);
    }
  }, [uploadStatus, setvideouploadpage, dispatch]);

  const handlesetvideofile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setvideofile(e.target.files?.[0] ?? null);
    setValidationError(null);
  };

  const uploadvideofile = () => {
    if (!title) {
      setValidationError("Please enter a title for the video");
    } else if (!videofile) {
      setValidationError("Please attach a video file");
    } else if (videofile.size > MAX_VIDEO_BYTES) {
      // Phase 2c: the limit is 10,000,000 bytes (10 MB) — the old alert
      // claimed "less than 1 kb".
      setValidationError(
        "Please attach a video file less than 10 MB",
      );
    } else {
      setValidationError(null);
      const filedata = new FormData();
      filedata.append("file", videofile);
      filedata.append("title", title);
      filedata.append("chanel", currentuser?.result?._id ?? "");
      filedata.append("uploader", currentuser?.result.name ?? "");
      uploadMutation.mutate({ filedata: filedata });
    }
  };
  return (
    <div className="container_VidUpload">
      <input
        type="submit"
        name="text"
        value={"X"}
        onClick={() => setvideouploadpage(false)}
        className="ibtn_x"
      />
      <div className="container2_VidUpload">
        <div className="ibox_div_vidupload">
          <input
            type="text"
            maxLength={30}
            placeholder="Enter title of your video"
            className="ibox_vidupload"
            onChange={(e) => {
              settitle(e.target.value);
            }}
          />
          <label
            htmlFor="file"
            className="ibox_vidupload btn_vidUpload"
          >
            <input
              type="file"
              name="file"
              style={{ fontSize: "1rem" }}
              onChange={(e) => {
                handlesetvideofile(e);
              }}
              className="ibox_vidupload"
            />
          </label>
        </div>
        <div className="ibox_div_vidupload">
          <input
            type="submit"
            onClick={() => uploadvideofile()}
            value={"Upload"}
            className="ibox_vidupload btn_vidUpload"
          />
          <div className="loader ibox_div_vidupload">
            <ProgressRing
              value={progress}
              text={`${progress}%`}
              rotation={0.25}
              strokeLinecap="butt"
              textSize="20px"
              pathTransitionDuration={0.5}
              pathColor={`rgba(255,255,255,${progress / 100})`}
              textColor="var(--create_channel_cut)"
              trailColor="var(--channel_text)"
              backgroundColor="#3e98c7"
            />
          </div>
        </div>
        {validationError ? (
          <p
            role="alert"
            style={{ color: "var(--forground_text)" }}
          >
            {validationError}
          </p>
        ) : null}
        {uploadError ? (
          <p style={{ color: "var(--forground_text)" }}>{uploadError}</p>
        ) : null}
      </div>
    </div>
  );
};

export default Videoupload;
