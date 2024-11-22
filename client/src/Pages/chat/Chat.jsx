import React from "react";
import "./chat.css";
import { MdOutlineSettings } from "react-icons/md";
import NoChatMain from "../../Component/chat/No_Chat_main";
import ChatMain from "../../Component/chat/ChatMain";

const Chat = () => {
    let chat = ["Hello"];
  return (
    <main className="chat_container">

    {/* /////////////////////// Sidebar /////////////////////////// */}

      <div className="sidebar_background">
        <div className="s_header">
          <h2 className="">
            Chats <MdOutlineSettings className="s_setting" />
          </h2>
          <div>
            <input type="text" placeholder="Search" />
          </div>
        </div>
        <div className="s_chat_box_container">
          {[...Array(8)].map((_, index) => (
            <div key={index} className="s_chat_box">
              <div className="s_avatar">A</div>
              <div className="chat_owner">
                <div>
                  <h4>Arman Alam</h4>
                  <p>Keep consestency, focus on goal & get success</p>
                </div>
                <span>11-10-2024</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* /////////////////////// Main Chat /////////////////////////// */}

      <div className="main_chat_container">
        {chat.length ===0 ?<NoChatMain /> : <ChatMain />}
      </div>
    </main>
  );
};

export default Chat;
