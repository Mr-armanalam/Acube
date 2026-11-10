import React from "react";
import Showvideo from "../Showvideo/Showvideo";
import { useVideoById } from "../../query/hooks";

// Phase 2b: was a per-row O(n) filter over the whole video array
// (the N+1 in WHL lists). Now an O(1) lookup in the videos-by-id map.
const Showvideolist = ({ videoid }: { videoid: string }) => {
  const video = useVideoById(videoid);
  if (!video) return null;
  return (
    <div className="Container_ShowVideoGrid">
      <div className="video_box_app" key={video._id}>
        <Showvideo vid={video} />
      </div>
    </div>
  );
};

export default Showvideolist;
