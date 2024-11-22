import React from "react";
import "./chat_main.css";
import { IoMdSend } from "react-icons/io";

const ChatMain = ({selectedUser}) => {
  return (
    <section className="c_section">
      <div className="c_nav">
        <div>
          <div>
            {
            selectedUser.picture ? <img src="/demo_pic.jpeg" alt="avatar" className="s_avatar_img" />
            : selectedUser.username.charAt(0).toUpperCase()
            }
          </div>
          <p>{selectedUser.username}</p>
        </div>
      </div>

      <div className="c_main_container">
        <div className="c_left_message">
          <div className="c_message_box">
            <div className="message_cut_left" />
            <div className="message_cut_right">
              hff Hi there I'm arman alam lorem1
            </div>
          </div>
          <div className="c_message_box box_right_message">
            <div className="message_cut_right">
              hff Hi there I'm arman alam lorem
            </div>
            <div className="message_cut_left right_cut_message" />
          </div>

        </div>
      </div>

      <div className="c_buttom">
        <form>
          <input type="text" placeholder="Type a message" />
          <button type="submit">
            <IoMdSend className="C_searchIcon" />
          </button>
        </form>
      </div>
    </section>
  );
};

export default ChatMain;
