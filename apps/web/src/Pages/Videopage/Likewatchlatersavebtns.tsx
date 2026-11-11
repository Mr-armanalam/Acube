// Watch action row — Like pill (preview screen, image-37).
//
// ONE combined pill: 👍 real like count + 👎 icon joined, red accent
// when active. The dead "Thanks" div (no handler, no endpoint) and
// the dead "···" icon are gone; Download moved to the Watch action
// row (DownloadVideo, premium-gated). Mutation behaviour is
// UNCHANGED: Like is a local toggle that also writes the liked-videos
// list; Dislike is local-only, no server call (see togglelikevideo /
// toggledislikevideo below). The `.ishidden` rule DownloadVideo
// relies on now lives in Watch.css (this component's old CSS file is
// deleted — nothing else imported it).
import React, { useEffect, useState, useCallback } from "react";
import {
  AiFillDislike,
  AiFillLike,
  AiOutlineDislike,
  AiOutlineLike,
} from "react-icons/ai";
import { useAppSelector } from "../../store";
import {
  useAddLikedVideo,
  useDeleteLikedVideo,
  useLikeVideo,
  useLikedVideos,
} from "../../query/hooks";
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
    <div
      className="watch-like-pill"
      role="group"
      aria-label="Like or dislike this video"
    >
      <button
        type="button"
        className={`watch-like-btn${likebtn ? " active" : ""}`}
        aria-pressed={likebtn}
        aria-label="Like this video"
        title={currentuser ? "Like this video" : "Sign in to like this video"}
        onClick={togglelikevideo}
      >
        {likebtn ? (
          <AiFillLike size={18} />
        ) : (
          <AiOutlineLike size={18} />
        )}
        <b>{vv?.Like}</b>
      </button>
      <span className="watch-like-divider" aria-hidden="true" />
      <button
        type="button"
        className={`watch-like-btn${dislikebtn ? " active" : ""}`}
        aria-pressed={dislikebtn}
        aria-label="Dislike this video"
        title={
          currentuser ? "Dislike this video" : "Sign in to dislike this video"
        }
        onClick={toggledislikevideo}
      >
        {dislikebtn ? (
          <AiFillDislike size={18} />
        ) : (
          <AiOutlineDislike size={18} />
        )}
      </button>
    </div>
  );
};

export default Likewatchlatersavebtns;
