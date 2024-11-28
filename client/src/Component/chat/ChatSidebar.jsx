import React, { useCallback, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { get_all_chat_user } from "../../action/get_all_chat_user";
import ChatSearch from "./ChatSearch";
import SelectedGroupMembers from "./SelectedGroupMembers";
import { fetchGroup } from "../../action/getAll_Group";
import SidebarAllUsers from "./SidebarAllUsers";
import SidebarAllGroups from "./SidebarAllGroups";

const ChatSidebar = ({
  setSelectedUser,
  selectedUser,
  setloading,
  setnavigate,
  navigate,
}) => {
  const [iscreateGroup, setIscreateGroup] = useState(false);
  const [GroupMembers, setGroupMembers] = useState([]);

  const dispatch = useDispatch();

    const handleisCreateUser = useCallback((user) => {
      setGroupMembers((prevGroupMembers) => {        
        if (prevGroupMembers?.includes( user)) {
          return prevGroupMembers?.filter((userFilter) => userFilter._id !== user._id);
        } else {
          return [...prevGroupMembers, user];
        }
       });
    },[setGroupMembers]);

    useEffect(() => {
        dispatch(get_all_chat_user({}));
        dispatch(fetchGroup());
    }, [dispatch]);

  return (
    <div className={`sidebar_background ${navigate.display}`}>
      <ChatSearch
        setIscreateGroup={setIscreateGroup}
        iscreateGroup={iscreateGroup}
        setGroupMembers={setGroupMembers}

      />

        {iscreateGroup || GroupMembers.length !== 0 ? 
          <SelectedGroupMembers  
          handleisCreateUser={handleisCreateUser} 
          GroupMembers={GroupMembers}
          setIscreateGroup={setIscreateGroup}
          setGroupMembers={setGroupMembers}
        /> : null}

      <div className="s_chat_box_container">
        <SidebarAllGroups 
          selectedUser={selectedUser}
          setSelectedUser={setSelectedUser}
          setloading={setloading}
          setnavigate={setnavigate}
          iscreateGroup={iscreateGroup}
        />

        <SidebarAllUsers 
          selectedUser={selectedUser}
          setSelectedUser={setSelectedUser}
          setloading={setloading}
          setnavigate={setnavigate}
          handleisCreateUser={handleisCreateUser}
          iscreateGroup={iscreateGroup}
        />
      </div>
     
    </div>
  );
};

export default ChatSidebar;
