import React, { useEffect, useMemo, useRef } from "react";
import "./Videopage.css";
import { formatDistanceToNow } from "date-fns";
import Likewatchlatersavebtns from "./Likewatchlatersavebtns";
import { useParams, Link } from "react-router";
import Comment from "../../Component/Comment/Comment";
import { useAppSelector } from "../../store";
import {
  useAddToHistory,
  useVideos,
  useViewVideo,
} from "../../query/hooks";
import Showvideogrid from "../../Component/Showvideogrid/Showvideogrid";
import VideoPlayer from "../../Component/videoPlayer/videoPlayer";
import LoadingCard from "../../Component/LoadingCard";

const Videopage = () => {
  const commentRef = useRef<HTMLInputElement>(null);
  const { vid } = useParams();
  const { data, isLoading, isError } = useVideos();
  const currentuser = useAppSelector((s) => s.auth.session);
  const viewMutation = useViewVideo();
  const historyMutation = useAddToHistory();

  // Old code reversed here AND again in Showvideogrid (net: API order).
  const viDs = useMemo(() => data?.filter((q) => q), [data]);
  const vv = useMemo(
    () => data?.find((q) => q._id === vid),
    [data, vid],
  );

  const viewerId = currentuser?.result?._id;
  useEffect(() => {
    if (vid) viewMutation.mutate(vid);
    // Count one view per page mount, as before.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vid]);

  useEffect(() => {
    if (viewerId && vid) {
      historyMutation.mutate({ videoid: vid, viewer: viewerId });
    }
    // Record history once per page mount for the signed-in viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vid, viewerId]);

  if (isLoading) {
    return (
      <div className="container_videoPage">
        <LoadingCard />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="container_videoPage">
        <p style={{ color: "var(--forground_text)", padding: "1rem" }}>
          Could not load this video. Please check your connection and try
          again.
        </p>
      </div>
    );
  }
  if (!vv) {
    return (
      <div className="container_videoPage">
        <p style={{ color: "var(--forground_text)", padding: "1rem" }}>
          Video not found.
        </p>
      </div>
    );
  }

  return (
    <div className="container_videoPage">
      <div className="container2_videoPage">
        <div className="video_display_screen_videoPage">
          <VideoPlayer
            commentRef={commentRef}
            currentuser={currentuser}
            video={vv?.filepath}
            videoid={vid}
          />
          <div className="video_details_videoPage">
            <div className="video_btns_title_VideoPage_cont">
              <p className="video_title_VideoPage">{vv?.videotitle}</p>
              <div className="views_date_btns_VideoPage">
                <div className="views_videoPage">
                  {vv?.views} views <div className="dot"></div>{" "}
                  {formatDistanceToNow(new Date(vv?.createdat ?? Date.now()), {
                    addSuffix: true,
                  })}
                </div>
                <Likewatchlatersavebtns vv={vv} vid={vid} />
              </div>
            </div>
            <Link to={"/"} className="chanel_details_videoPage">
              <b className="chanel_logo_videoPage">
                <p>{vv?.uploader?.charAt(0).toUpperCase()}</p>
              </b>
              <p className="chanel_name_videoPage">{vv?.uploader}</p>
            </Link>
            <div className="comments_VideoPage">
              <h2>
                <u>Comments</u>
              </h2>
              <Comment commentRef={commentRef} videoid={vv?._id} />
            </div>
          </div>
        </div>
      </div>
      <div className="moreVideoBar">
        <h1>More videos</h1>
        <Showvideogrid vid={viDs} />
      </div>
    </div>
  );
};

export default Videopage;
