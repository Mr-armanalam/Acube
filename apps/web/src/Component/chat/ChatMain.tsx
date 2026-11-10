import React, { useCallback, useEffect, useRef, useState } from "react";
import "./chat_main.css";
import { IoMdSend } from "react-icons/io";
import {
  useChatMessages,
  useDeleteChatMessage,
  useSendChatMessage,
} from "../../query/chat";
import JoinButton from "../videoStream-utils/CreateButton";
import { encryptData2 } from "../../utils/toEncrypt";
import { MdOutlineDelete } from "react-icons/md";
import type { ChatUser } from "../../types";

const ChatMain = ({ selectedUser }: { selectedUser: ChatUser }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const {
    data: getmessages,
    isLoading,
    isError,
  } = useChatMessages(selectedUser._id);
  const sendMutation = useSendChatMessage();
  const deleteMutation = useDeleteChatMessage();
  const [sendingMessages, setSendingMessages] = useState("");
  const [isdelete, setIsdelete] = useState("");

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      sendMutation.mutate({
        message: sendingMessages,
        recieverId: selectedUser._id,
      });
      setSendingMessages("");
    },
    [sendMutation, sendingMessages, selectedUser],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      deleteMutation.mutate({ id: id, selectedUserId: selectedUser._id });
      setIsdelete("");
    },
    [deleteMutation, selectedUser],
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
            {selectedUser.picture ? (
              <img
                src={selectedUser.picture}
                alt="avatar"
                className="s_avatar_img"
              />
            ) : (
              selectedUser.username.charAt(0).toUpperCase()
            )}
          </div>
          <p>{selectedUser.username}</p>
          <JoinButton friendsId={encryptData2(selectedUser?.email)} />
        </div>
      </div>

      <div className="c_main1_conainer" ref={contentRef}>
        <div onClick={() => setIsdelete("")} className="c_main_container">
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
                {item.receiver === selectedUser._id ? (
                  <div className="c_message_box">
                    <div className="message_cut_left" />
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsdelete(item?._id);
                      }}
                      className="message_cut_right"
                    >
                      {item.content}
                    </div>
                    {isdelete === item?._id && (
                      <span
                        onClick={(e) => handleDelete(e, item?._id)}
                        className="delete_btn"
                      >
                        <MdOutlineDelete />
                      </span>
                    )}
                  </div>
                ) : item.sender === selectedUser._id ? (
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

export default ChatMain;
