import React, { useState } from "react";
import "./Comment.css";
import { formatDistanceToNow } from "date-fns";
import { useAppSelector } from "../../store";
import { useDeleteComment, useEditComment } from "../../query/hooks";

const Displaycommment = ({
  cid,
  commentbody,
  userid,
  commenton,
  usercommented,
}: {
  cid: string;
  commentbody: string;
  userid: string | undefined;
  commenton: string | undefined;
  usercommented: string | undefined;
}) => {
  const [edit, setedit] = useState(false);
  const [cmtnody, setcommentbdy] = useState("");
  const [cmtid, setcmntid] = useState("");
  const currentuser = useAppSelector((s) => s.auth.session);
  const editMutation = useEditComment();
  const deleteMutation = useDeleteComment();

  const handleedit = (ctid: string, ctbdy: string) => {
    setedit(true);
    setcmntid(ctid);
    setcommentbdy(ctbdy);
  };

  const haneleonsubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmtnody) {
      alert("type your comment");
    } else {
      editMutation.mutate({ id: cmtid, commentbody: cmtnody });
      setcommentbdy("");
    }
    setedit(false);
  };

  const handledel = (id: string) => {
    deleteMutation.mutate(id);
  };

  return (
    <>
      {edit ? (
        <>
          <form
            className="comments_sub_form_comments"
            onSubmit={(e) => haneleonsubmit(e)}
          >
            <input
              type="text"
              onChange={(e) => setcommentbdy(e.target.value)}
              placeholder="Edit comments.."
              value={cmtnody}
              className="comment_ibox"
            />
            <input
              type="submit"
              value="change"
              className="comment_add_btn_comments"
            />
          </form>
        </>
      ) : (
        <p className="comment_body">{commentbody}</p>
      )}
      <p className="usercommented">
        {" "}
        - {usercommented} commented{" "}
        {formatDistanceToNow(new Date(commenton ?? Date.now()), {
          addSuffix: true,
        })}
      </p>
      {currentuser?.result?._id === userid && (
        <p className="EditDel_DisplayCommendt">
          <i onClick={() => handleedit(cid, commentbody)}>Edit</i>
          <i onClick={() => handledel(cid)}>Delete</i>
        </p>
      )}
    </>
  );
};

export default Displaycommment;
