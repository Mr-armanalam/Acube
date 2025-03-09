import React, { useCallback, useEffect, useMemo, useRef } from "react";
import "./Videopage.css";
import moment from "moment";
import Likewatchlatersavebtns from "./Likewatchlatersavebtns";
import { useParams, Link } from "react-router-dom";
import Comment from "../../Component/Comment/Comment";
import { viewvideo } from "../../action/video";
import { addtohistory } from "../../action/history";
import { useSelector, useDispatch } from "react-redux";
import Showvideogrid from "../../Component/Showvideogrid/Showvideogrid";
import VideoPlayer from "../../Component/videoPlayer/videoPlayer";

const Videopage = () => {
  const commentRef = useRef(null);
  const { vid } = useParams();
  const dispatch = useDispatch();

  const vids = useSelector((state) => state.videoreducer);
  const currentuser = useSelector((state) => state.currentuserreducer);

  const viDs = useMemo(() => {
    return vids?.data?.filter((q) => q).reverse();
  }, [vids]);

  const vv = useMemo(() => {
    return vids?.data?.find((q) => q._id === vid);
  }, [vids, vid]);

  const handleviews = useCallback(() => {
    dispatch(viewvideo({ id: vid }));
  }, [dispatch, vid]);
  
  const handlehistory = useCallback(() => {
    if (currentuser) {
      dispatch(
        addtohistory({
          videoid: vid,
          viewer: currentuser?.result?._id,
        })
      );
    }
  }, [dispatch, vid, currentuser]);

  useEffect(() => {
    handleviews();
  }, [handleviews]);

  useEffect(() => {
    handlehistory();
  }, [handlehistory]);

  return (
    <div className="container_videoPage">
      <div className="container2_videoPage">
        <div className="video_display_screen_videoPage">
          <VideoPlayer commentRef={commentRef} currentuser={currentuser} video={vv?.filepath} />
          <div className="video_details_videoPage">
            <div className="video_btns_title_VideoPage_cont">
              <p className="video_title_VideoPage">{vv?.videotitle}</p>
              <div className="views_date_btns_VideoPage">
                <div className="views_videoPage">
                  {vv?.views} views <div className="dot"></div> {moment(vv?.createdat).fromNow()}
                </div>
                <Likewatchlatersavebtns vv={vv} vid={vid} />
              </div>
            </div>
            <Link to={"/"} className="chanel_details_videoPage">
              <b className="chanel_logo_videoPage">
                <p>{vv?.uploader.charAt(0).toUpperCase()}</p>
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
