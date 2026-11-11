import React, { useEffect, useState, useCallback } from "react";
import { BsThreeDots } from "react-icons/bs";
import {
  AiFillDislike,
  AiFillLike,
  AiOutlineDislike,
  AiOutlineLike,
} from "react-icons/ai";
import { RiHeartAddFill } from "react-icons/ri";
import "./Likewatchlatersavebtn.css";
import { useAppSelector } from "../../store";
import {
  useAddLikedVideo,
  useDeleteLikedVideo,
  useLikeVideo,
  useLikedVideos,
} from "../../query/hooks";
import DownloadVideo from "../../Component/DownloadVideo/DownloadVideo";
import type { Video } from "../../types";

const Likewatchlatersavebtns = ({
  vv,
  vid,
}: {
  vv: Video | undefined;
  vid: string | undefined;
}) => {
  const [dislikebtn, setdislikebtn] = useState(false);
  const [likebtn, setlikebtn] = useState(false);

  const currentuser = useAppSelector((s) => s.auth.session);
  const { data: likedvideolist } = useLikedVideos();
  const likeMutation = useLikeVideo();
  const addLikedMutation = useAddLikedVideo();
  const deleteLikedMutation = useDeleteLikedVideo();

  useEffect(() => {
    const likedVideo = likedvideolist?.some(
      (q) => q.videoid === vid && q.viewer === currentuser?.result._id,
    );

    if (likedVideo) setlikebtn(likedVideo);
  }, [likedvideolist, vid, currentuser]);

  const viewerId = currentuser?.result?._id;

  // Phase 3b: liking is a toggle — the client sends only the action
  // and the server $inc's the counter. No absolute Like count is ever
  // sent (the old code computed Like ± 1 client-side and the server
  // trusted it).
  const togglelikevideo = useCallback(() => {
    if (currentuser && vid && viewerId) {
      if (likebtn) {
        setlikebtn(false);
        likeMutation.mutate({ id: vid, action: "unlike" });
        deleteLikedMutation.mutate({ videoid: vid, viewer: viewerId });
      } else {
        setlikebtn(true);
        likeMutation.mutate({ id: vid, action: "like" });
        addLikedMutation.mutate({ videoid: vid, viewer: viewerId });
        if (dislikebtn) {
          setdislikebtn(false);
        }
      }
    } else {
      alert("please login to like video");
    }
  }, [
    currentuser,
    likebtn,
    vid,
    viewerId,
    dislikebtn,
    likeMutation,
    addLikedMutation,
    deleteLikedMutation,
  ]);

  const toggledislikevideo = useCallback(() => {
    if (currentuser && vid && viewerId) {
      if (dislikebtn) {
        setdislikebtn(false);
      } else {
        setdislikebtn(true);
        if (likebtn) {
          likeMutation.mutate({ id: vid, action: "unlike" });
          deleteLikedMutation.mutate({ videoid: vid, viewer: viewerId });
          setlikebtn(false);
        }
      }
    } else {
      alert("please login to dislike video");
    }
  }, [
    currentuser,
    dislikebtn,
    likebtn,
    vid,
    viewerId,
    likeMutation,
    deleteLikedMutation,
  ]);

  return (
    <div className="btns_cont_videoPage">
      <div className="btn_VideoPage btn_hide">
        <BsThreeDots />
      </div>
      <DownloadVideo video={vv?.filepath} videoId={vv?._id} />
      <div className="btn_VideoPage">
        <div className="like_videoPage" onClick={togglelikevideo}>
          {likebtn ? (
            <AiFillLike size={22} className="btns_videoPage" />
          ) : (
            <AiOutlineLike size={22} className="btns_videoPage" />
          )}
          <b>{vv?.Like}</b>
        </div>
        <div className="like_videoPage" onClick={toggledislikevideo}>
          {dislikebtn ? (
            <AiFillDislike size={22} className="btns_videoPage" />
          ) : (
            <AiOutlineDislike size={22} className="btns_videoPage" />
          )}
          <b>Dislike</b>
        </div>
        <div className="like_videoPage">
          <RiHeartAddFill size={22} className="btns_videoPage" />
          <b>Thanks</b>
        </div>
      </div>
    </div>
  );
};

export default Likewatchlatersavebtns;
