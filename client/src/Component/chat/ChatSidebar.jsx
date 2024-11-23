import React from 'react'
import { MdOutlineSettings } from "react-icons/md";
import { get_messages } from "../../action/get_messages";
import { useDispatch, useSelector } from 'react-redux';


const ChatSidebar = ({ setSelectedUser, selectedUser, setloading}) => {
    const dispatch = useDispatch();
    const users = useSelector((state) => state.get_all_chat_user_reducer);

    const handleSelectedUser = (user) => {
      dispatch(get_messages({selectedUser: user._id}))
      setSelectedUser(user);
      setloading(true);
    }

  return (
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
                <span>21-11-2024</span>
              
              </div>
            </div>
          ))}
        </div>
        
      </div>
  )
}

export default ChatSidebar