import React, { useCallback, useEffect, useRef, useState } from "react";
import "./chat_main.css";
import { IoMdSend } from "react-icons/io";
import { useDispatch, useSelector } from "react-redux";
import { fetch_grp_msg, send_grp_msg } from "../../action/send_group_msg";
import { fetchGroup } from "../../action/getAll_Group";

const ChatMainGroup = ({ selectedUser, loading, setloading }) => {
  const contentRef = useRef(null);
  const dispatch = useDispatch();

    const getmessages = useSelector((state) => state.fetch_grp_Msg_reducer);
    const newMessages = useSelector((state) => state.send_group_msg);
    const [sendingMessages, setSendingMessages] = useState("");


  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      dispatch(
        send_grp_msg({
          content: sendingMessages,
          groupId: selectedUser._id,
        })
      );
      setSendingMessages("");    
    },
    [dispatch, sendingMessages, selectedUser]
  );
  

  useEffect(() => {
    if (loading) {
      dispatch(fetchGroup());
      setloading(false);
    }
    dispatch(fetch_grp_msg(selectedUser._id ));
  }, [loading, dispatch, selectedUser, setloading, newMessages]);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [getmessages, newMessages]);


  return (
    <section className="c_section">
      <div className="c_nav">
        <div>
          <div>
            {selectedUser.picture ? (
              <img
                src={selectedUser.picture}
                alt="avatar"
                className="s_avatar_img"
              />
            ) : (
              selectedUser.name.charAt(0).toUpperCase()
            )}
          </div>
          <p>
            {selectedUser.name}
          </p>
        </div>
      </div>

      <div className="c_main1_conainer" ref={contentRef}>
        <div className="c_main_container">
          {getmessages.map((item, index) => (
            <div key={index} className="c_left_message">
              {item?.group === selectedUser._id ? (
                <div className="c_message_box">
                  <div className="message_cut_left" />
                  <div className="message_cut_right">{item.content}</div>
                </div>
              ) : item?.sender === selectedUser._id ? (
                <div className="c_message_box box_right_message">
                  <div className="message_cut_right">{item.content}</div>
                  <div className="message_cut_left right_cut_message" />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="c_buttom">
        <form>
          <input
            type="text"
            placeholder="Type a message"
            value={sendingMessages}
            onChange={(e) => setSendingMessages(e.target.value)}
          />
          {sendingMessages === "" ? null : (
            <button type="submit" onClick={(e) => handleSubmit(e)}>
              <IoMdSend className="C_searchIcon" />
            </button>
          )}
        </form>
      </div>
    </section>
  );
};

export default ChatMainGroup;
