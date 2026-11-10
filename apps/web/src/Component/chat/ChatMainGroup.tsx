import React, { useCallback, useEffect, useRef, useState } from "react";
import "./chat_main.css";
import { IoMdSend } from "react-icons/io";
import {
  useGroupMessages,
  useSendGroupMessage,
} from "../../query/chat";
import type { Group } from "../../types";

const ChatMainGroup = ({ selectedUser }: { selectedUser: Group }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const {
    data: getmessages,
    isLoading,
    isError,
  } = useGroupMessages(selectedUser._id);
  const sendMutation = useSendGroupMessage();
  const [sendingMessages, setSendingMessages] = useState("");

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      sendMutation.mutate({
        content: sendingMessages,
        groupId: selectedUser._id,
      });
      setSendingMessages("");
    },
    [sendMutation, sendingMessages, selectedUser],
  );

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [getmessages]);

  return (
    <section className="c_section">
      <div className="c_nav">
        <div>
          <div>
            {selectedUser.GroupPicture ? (
              <img
                src={selectedUser.GroupPicture}
                alt="avatar"
                className="s_avatar_img"
              />
            ) : (
              selectedUser.name.charAt(0).toUpperCase()
            )}
          </div>
          <p>{selectedUser.name}</p>
        </div>
      </div>

      <div className="c_main1_conainer" ref={contentRef}>
        <div className="c_main_container">
          {isLoading ? (
            <p style={{ color: "var(--forground_text)" }}>
              Loading messages...
            </p>
          ) : isError ? (
            <p style={{ color: "var(--forground_text)" }}>
              Could not load messages. Please try again.
            </p>
          ) : (
            getmessages?.map((item, index) => (
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
            ))
          )}
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
