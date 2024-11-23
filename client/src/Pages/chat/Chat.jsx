import React, { useState } from "react";
import "./chat.css";
import NoChatMain from "../../Component/chat/No_Chat_main";
import ChatMain from "../../Component/chat/ChatMain";
import ChatSidebar from "../../Component/chat/ChatSidebar";


const Chat = () => {
  const [selectedUser, setSelectedUser] = useState({});
  const [loading, setloading] = useState(false)
  
  return (
    <main className="chat_container">
      <ChatSidebar 
        selectedUser={selectedUser}
        setSelectedUser={setSelectedUser}
        setloading={setloading}
      />

      <div className="main_chat_container">
        {
          Object.keys(selectedUser).length === 0 ? 
          <NoChatMain /> : <ChatMain selectedUser={selectedUser} loading={loading} setloading= {setloading} />
        }
      </div>
    </main>
  );
};

export default Chat;
