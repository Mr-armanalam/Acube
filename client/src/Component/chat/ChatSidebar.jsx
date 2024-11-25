import React, { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { get_messages } from "../../action/get_messages";
import { get_all_chat_user } from "../../action/get_all_chat_user";
import formatDate from "../../utils/getDateformate";
import { formatNewDate } from "../../utils/getnewDate";
import ChatSearch from "./ChatSearch";
import SelectedGroupMembers from "./SelectedGroupMembers";

const ChatSidebar = ({
  setSelectedUser,
  selectedUser,
  setloading,
  setnavigate,
  navigate,
}) => {
  const [iscreateGroup, setIscreateGroup] = useState(false);
  const [GroupMembers, setGroupMembers] = useState([]);
  const [GroupName, setGroupName] = useState("");

  const dispatch = useDispatch();
  const { filteredUsers: users, currentMessages } = useSelector(
    (state) => state.get_all_chat_user_reducer
  );

  const handleSelectedUser = useCallback(
    (user) => {
      dispatch(get_messages(user._id));
      setSelectedUser(user);
      setloading(true);
      setnavigate({ display: "navigate" });
    },
    [setloading, setnavigate, dispatch, setSelectedUser]
  );

    const handleisCreateUser = useCallback((userId) => {

      setGroupMembers((prevGroupMembers) => {
        if (prevGroupMembers.includes(userId)) {
          return prevGroupMembers.filter((id) => id !== userId);
        } else {
          return [...prevGroupMembers, userId];
        }
       });
        console.log("hi" + GroupMembers.length);
    },[GroupMembers, setGroupMembers]);

    useEffect(() => {
        dispatch(get_all_chat_user({}));
    }, [dispatch]);

  return (
    <div className={`sidebar_background ${navigate.display}`}>
      <ChatSearch
        iscreateGroup={iscreateGroup}
        setIscreateGroup={setIscreateGroup}
      />

        <SelectedGroupMembers />

      <div className="s_chat_box_container">
        {users &&
          users.map((item, index) => (
            <div
              key={index}
              className={`s_chat_box ${
                selectedUser?.email === item.email ? "selected" : ""
              }`}
              onClick={() =>
                iscreateGroup
                  ? handleisCreateUser(item._id)
                  : handleSelectedUser(item)
              }
            >
              <div className="s_avatar">
                {item?.picture ? (
                  <img
                    src={item.picture}
                    alt="user avatar"
                    className="s_avatar_img"
                  />
                ) : (
                  item.username.charAt(0).toUpperCase()
                )}
              </div>
              <div className="chat_owner">
                <div>
                  <h4>{item.username}</h4>
                  <p>
                    {currentMessages[index]?.message ||
                      "Let's talk with someone"}
                  </p>
                </div>
                <span>
                  {currentMessages[index]?.date
                    ? formatDate(currentMessages[index].date)
                    : formatNewDate(new Date())}
                </span>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};

export default ChatSidebar;
