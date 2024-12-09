import React, { useEffect, useState, useCallback } from "react";
import { BsThreeDots } from "react-icons/bs";
import {
  AiFillDislike,
  AiFillLike,
  AiOutlineDislike,
  AiOutlineLike,
} from "react-icons/ai";
import { MdPlaylistAddCheck } from "react-icons/md";
import {
  RiHeartAddFill,
  RiPlayListAddFill,
  RiShareForwardLine,
} from "react-icons/ri";
import "./Likewatchlatersavebtn.css";
import { useSelector, useDispatch } from "react-redux";
import { likevideo } from "../../action/video";
import { addtolikedvideo, deletelikedvideo } from "../../action/likedvideo";
import { addtowatchlater, deletewatchlater } from "../../action/watchlater";
import DownloadVideo from "../../Component/DownloadVideo/DownloadVideo";

const Likewatchlatersavebtns = ({ vv, vid }) => {
  const dispatch = useDispatch();
  const [savevideo, setsavevideo] = useState(false);
  const [dislikebtn, setdislikebtn] = useState(false);
  const [likebtn, setlikebtn] = useState(false);

  const currentuser = useSelector((state) => state.currentuserreducer);
  const likedvideolist = useSelector((state) => state.likedvideoreducer);
  const watchlaterlist = useSelector((state) => state.watchlaterreducer);
  // console.log(likedvideolist, watchlaterlist);
  

  useEffect(() => {
   try {
     const likedVideo = likedvideolist?.data?.some(
       (q) => q.videoid === vid && q.viewer === currentuser?.result._id
     );
     const savedVideo = watchlaterlist?.data?.some(
       (q) => q.videoid === vid && q.viewer === currentuser?.result._id
     );

     if (likedVideo && likedvideolist) setlikebtn(likedVideo);
     if (savedVideo && watchlaterlist) setsavevideo(savedVideo);
   } catch (error) {
    console.log(error.message);  
   }

  }, [likedvideolist, watchlaterlist, vid, currentuser]);

  const togglesavedvideo = useCallback(() => {
    if (currentuser) {
      if (savevideo) {
        setsavevideo(false);
        dispatch(deletewatchlater({ videoid: vid, viewer: currentuser?.result?._id }));
      } else {
        setsavevideo(true);
        dispatch(addtowatchlater({ videoid: vid, viewer: currentuser?.result?._id }));
      }
    } else {
      alert("please login to save video");
    }
  }, [currentuser, savevideo, dispatch, vid]);

  const togglelikevideo = useCallback((e, lk) => {
    if (currentuser) {
      if (likebtn) {
        setlikebtn(false);
        dispatch(likevideo({ id: vid, Like: lk - 1 }));
        dispatch(deletelikedvideo({ videoid: vid, viewer: currentuser?.result?._id }));
      } else {
        setlikebtn(true);
        dispatch(likevideo({ id: vid, Like: lk + 1 }));
        dispatch(addtolikedvideo({ videoid: vid, viewer: currentuser?.result?._id }));
        if (dislikebtn) {
          setdislikebtn(false);
        }
      }
    } else {
      alert("please login to like video");
    }
  }, [currentuser, likebtn, dispatch, vid, dislikebtn]);

  const toggledislikevideo = useCallback((e, lk) => {
    if (currentuser) {
      if (dislikebtn) {
        setdislikebtn(false);
      } else {
        setdislikebtn(true);
        if (likebtn) {
          dispatch(likevideo({ id: vid, Like: lk - 1 }));
          dispatch(deletelikedvideo({ videoid: vid, viewer: currentuser?.result?._id }));
          setlikebtn(false);
        }
      }
    } else {
      alert("please login to dislike video");
    }
  }, [currentuser, dislikebtn, likebtn, dispatch, vid]);

  return (
    <div className="btns_cont_videoPage">
      <div className="btn_VideoPage btn_hide">
        <BsThreeDots />
      </div>
      <DownloadVideo video={vv?.filepath} />
      <div className="btn_VideoPage">
        <div className="like_videoPage" onClick={(e) => togglelikevideo(e, vv?.Like)}>
          {likebtn ? (
            <AiFillLike size={22} className="btns_videoPage" />
          ) : (
            <AiOutlineLike size={22} className="btns_videoPage" />
          )}
          <b>{vv?.Like}</b>
        </div>
        <div className="like_videoPage" onClick={(e) => toggledislikevideo(e, vv?.Like)}>
          {dislikebtn ? (
            <AiFillDislike size={22} className="btns_videoPage" />
          ) : (
            <AiOutlineDislike size={22} className="btns_videoPage" />
          )}
          <b>Dislike</b>
        </div>
        <div className="like_videoPage" onClick={togglesavedvideo}>
          {savevideo ? (
            <>
              <MdPlaylistAddCheck size={22} className="btns_videoPage" />
              <b>Saved</b>
            </>
          ) : (
            <>
              <RiPlayListAddFill size={22} className="btns_videoPage" />
              <b>Save</b>
            </>
          )}
        </div>
        <div className="like_videoPage">
          <RiHeartAddFill size={22} className="btns_videoPage" />
          <b>Thanks</b>
        </div>
        <div className="like_videoPage">
          <RiShareForwardLine size={22} className="btns_videoPage" />
          <b>Share</b>
        </div>
      </div>
    </div>
  );
};

export default Likewatchlatersavebtns;


