import React, { useState } from "react";
import "./chat.css";
import { MdOutlineSettings } from "react-icons/md";
import NoChatMain from "../../Component/chat/No_Chat_main";
import ChatMain from "../../Component/chat/ChatMain";
import { useDispatch, useSelector } from "react-redux";
import { get_messages } from "../../action/get_messages";
import getCookie from "../../utils/getCookie";


const Chat = () => {
  const dispatch = useDispatch();
  const [selectedUser, setSelectedUser] = useState({});
  const newMessage = useSelector((state) => state.send_chat_messages_reducer);
  const users = useSelector((state) => state.get_all_chat_user_reducer);
  // console.log(getCookie("Date"));

  const handleSelectedUser = (user) => {
    dispatch(get_messages({selectedUser: user._id}))
    setSelectedUser(user);
  }

  
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
          {users !== undefined && users?.map((item, index) => (
            <div key={index} className={`s_chat_box ${selectedUser.email === item.email ? "selected":'' }`}  onClick={() => handleSelectedUser(item)}>
              <div className="s_avatar">
                {item?.picture ? <img src={item.picture} alt="user avatar" className="s_avatar_img" />
                : item.username.charAt(0).toUpperCase()}
              </div>
              <div className="chat_owner">
                <div>
                  <h4>{item.username}</h4>
                  <p>Keep consestency, focus on goal & get success</p>
                </div>
                <span>{getCookie("Date")}</span>
                {/* <span>{newMessage.createdAt}</span> */}
              </div>
            </div>
          ))}
        </div>
        
      </div>

      {/* /////////////////////// Main Chat /////////////////////////// */}

      <div className="main_chat_container">
        {
          Object.keys(selectedUser).length === 0 ? 
          <NoChatMain /> : 
          <ChatMain 
            selectedUser={selectedUser}
          />
        }
      </div>
    </main>
  );
};

export default Chat;
