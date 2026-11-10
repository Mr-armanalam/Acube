import React, { useMemo } from "react";
import "./Yourvideo.css";
import Showvideogrid from "../../Component/Showvideogrid/Showvideogrid";
import Leftsidebar from "../../Component/Leftsidebar/Leftsidebar";
import { useAppSelector } from "../../store";
import { useVideos } from "../../query/hooks";
import LoadingCard from "../../Component/LoadingCard";

const Yourvideo = () => {
  const currentuser = useAppSelector((s) => s.auth.session);
  const { data, isLoading, isError } = useVideos();
  // Old code reversed here AND again in Showvideogrid (net: API order).
  const yourvideolist = useMemo(
    () =>
      data?.filter((q) => q.videochanel === currentuser?.result._id),
    [data, currentuser],
  );
  return (
    <div className="container_Pages_App">
      <div className="at_small_sizel">
        <Leftsidebar />
      </div>
      <div className="container2_Pages_App">
        <div className="container_yourvideo">
          <h1>Your Video</h1>
          {currentuser ? (
            <>
              {isLoading ? (
                <LoadingCard />
              ) : isError ? (
                <p style={{ color: "var(--forground_text)" }}>
                  Could not load videos. Please check your connection and try
                  again.
                </p>
              ) : (
                <Showvideogrid vid={yourvideolist} />
              )}
            </>
          ) : (
            <>
              <h3>PLZ Login to see Your upload video list</h3>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Yourvideo;
