import React from "react";
import "./chat.css";
import NoChatMain from "../../Component/chat/No_Chat_main";
import ChatMain from "../../Component/chat/ChatMain";
import ChatSidebar from "../../Component/chat/ChatSidebar";
import ChatMainGroup from "../../Component/chat/ChatMainGroup";
import { useAppSelector } from "../../store";

const Chat = () => {
  const currentUser = useAppSelector((s) => s.auth.session);
  const selected = useAppSelector((s) => s.chatUi.selected);

  return (
    <main className="chat_container">
      {currentUser && <ChatSidebar />}
      <div className="main_chat_container">
        {selected === null ? (
          <NoChatMain currentUser={currentUser} navigate={{ main: "navigate" }} />
        ) : selected.kind === "user" ? (
          <ChatMain selectedUser={selected.user} />
        ) : (
          <ChatMainGroup selectedUser={selected.group} />
        )}
      </div>
    </main>
  );
};

export default Chat;
