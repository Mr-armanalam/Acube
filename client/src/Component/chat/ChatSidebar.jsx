import React from 'react'
import { MdOutlineSettings } from "react-icons/md";
import { get_messages } from "../../action/get_messages";
import { useDispatch, useSelector } from 'react-redux';
import formatDate from '../../utils/getDateformate';
import { formatNewDate } from '../../utils/getnewDate';


const ChatSidebar = ({ setSelectedUser, selectedUser, setloading}) => {
    const dispatch = useDispatch();
    const {filteredUsers: users, currentMessages} = useSelector((state) => state.get_all_chat_user_reducer);
    // console.log(new Date());
    
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
                  <p>{currentMessages[index]?.message === undefined ? "Let's talk with someone " : currentMessages[index]?.message}</p>
                </div>
                <span>{currentMessages[index]?.date === undefined ? formatNewDate(new Date()) : formatDate(currentMessages[index]?.date)}</span>
              
              </div>
            </div>
          ))}
        </div>
        
      </div>
  )
}

export default ChatSidebar