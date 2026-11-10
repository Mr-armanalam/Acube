import React from "react";
import "./Showvideogrid.css";
import Showvideo from "../Showvideo/Showvideo";
import type { Video } from "../../types";

// Phase 2b: this grid used to call vid.reverse() in render, mutating the
// array its caller passed in (and flipping the order on every render when
// the caller had already reversed). It now renders the order it is given;
// callers that need newest-first pass a reversed COPY.
const Showvideogrid = ({ vid }: { vid: Video[] | undefined }) => {
  return (
    <div className="Container_ShowVideoGrid2">
      {vid?.map((vi) => {
        return (
          <div key={vi._id} className="video_box_app">
            <Showvideo vid={vi} />
          </div>
        );
      })}
    </div>
  );
};

export default Showvideogrid;
