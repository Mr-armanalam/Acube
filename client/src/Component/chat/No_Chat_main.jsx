import React from "react";
import "./chat_main.css";
import { MdChatBubble } from "react-icons/md";

const NoChatMain = () => {
  return (
    <section className="No_Chat_main_container">
      <div className="No_chat_box">
        <MdChatBubble size={110} color="#252525" />
        <h2>Welcome to Your Chats</h2>
        <h3>Please Select to start your conversation </h3>
      </div>
      <h4>End-to-End Encripted</h4>
    </section>
  );
};

export default NoChatMain;
