import React, { useState } from "react";
import "./chat.css";
import NoChatMain from "../../Component/chat/No_Chat_main";
import ChatMain from "../../Component/chat/ChatMain";
import ChatSidebar from "../../Component/chat/ChatSidebar";
import ChatMainGroup from "../../Component/chat/ChatMainGroup";


const Chat = () => {

  const [selectedUser, setSelectedUser] = useState({});
  const [loading, setloading] = useState(false);
  const [navigate, setnavigate] = useState({main: "navigate"});

  // console.log(selectedUser.username == true);
  
  
  return (
    <main className="chat_container">
      <ChatSidebar 
        selectedUser={selectedUser}
        setSelectedUser={setSelectedUser}
        setloading={setloading}
        setnavigate={setnavigate}
        navigate={navigate}
        loading={loading}
      />
      <div className="main_chat_container">
        {
          Object.keys(selectedUser).length === 0 ? 
          <NoChatMain navigate= {navigate}/> : selectedUser.username ?
          <ChatMain 
            selectedUser={selectedUser} 
            loading={loading} 
            setloading= {setloading} 
          />:
          <ChatMainGroup 
            selectedUser={selectedUser}
            loading={loading}
            setloading={setloading}
          />
        }
      </div>
    </main>
  );
};

export default Chat;
