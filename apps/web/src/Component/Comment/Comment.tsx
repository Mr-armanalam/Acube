import React, { useState } from "react";
import "./Comment.css";
import Displaycommment from "./Displaycommment";
import { useAppSelector } from "../../store";
import { useCommentsForVideo, usePostComment } from "../../query/hooks";

const Comment = ({
  videoid,
  commentRef,
}: {
  videoid: string | undefined;
  commentRef: React.RefObject<HTMLInputElement | null>;
}) => {
  const [commenttext, setcommentext] = useState("");
  const currentuser = useAppSelector((s) => s.auth.session);
  const commentlist = useCommentsForVideo(videoid);
  const postMutation = usePostComment();

  const handleonsubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentuser) {
      if (!commenttext) {
        alert("please type your comment!!");
      } else {
        postMutation.mutate({
          videoid: videoid,
          userid: currentuser?.result._id,
          commentbody: commenttext,
          usercommented: currentuser.result.name,
        });
        setcommentext("");
      }
    } else {
      alert("Please login to comment");
    }
  };

  return (
    <>
      <form className="comments_sub_form_comments" onSubmit={handleonsubmit}>
        <input
          type="text"
          onChange={(e) => setcommentext(e.target.value)}
          placeholder="add comment..."
          value={commenttext}
          ref={commentRef}
          className="comment_ibox"
        />
        <input type="submit" value="add" className="comment_add_btn_comments" />
      </form>
      <div className="display_comment_container">
        {commentlist?.map((m) => {
          return (
            <Displaycommment
              key={m._id}
              cid={m._id}
              userid={m.userid}
              commentbody={m.commentbody}
              commenton={m.commenton ?? m.commentedon}
              usercommented={m.usercommented}
            />
          );
        })}
      </div>
    </>
  );
};

export default Comment;
