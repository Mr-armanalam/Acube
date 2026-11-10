import React, { useCallback, useState } from "react";
import { useAppSelector } from "../../store";
import { useChatUsers, useGroups } from "../../query/chat";
import ChatSearch from "./ChatSearch";
import SelectedGroupMembers from "./SelectedGroupMembers";
import SidebarAllUsers from "./SidebarAllUsers";
import SidebarAllGroups from "./SidebarAllGroups";
import type { ChatUser } from "../../types";

const ChatSidebar = () => {
  const [iscreateGroup, setIscreateGroup] = useState(false);
  const [GroupMembers, setGroupMembers] = useState<ChatUser[]>([]);
  const searchQuery = useAppSelector((s) => s.chatUi.searchQuery);
  const sidebarOpen = useAppSelector((s) => s.chatUi.sidebarOpen);
  const selected = useAppSelector((s) => s.chatUi.selected);
  const { data: chatUsers } = useChatUsers(searchQuery);
  const { data: groups } = useGroups();

  const handleisCreateUser = useCallback((user: ChatUser) => {
    setGroupMembers((prevGroupMembers) => {
      if (prevGroupMembers?.includes(user)) {
        return prevGroupMembers?.filter(
          (userFilter) => userFilter._id !== user._id,
        );
      } else {
        return [...prevGroupMembers, user];
      }
    });
  }, []);

  const selectedUser =
    selected?.kind === "user" ? selected.user : undefined;

  return (
    <div className={`sidebar_background ${sidebarOpen ? "navigate" : ""}`}>
      <ChatSearch
        setIscreateGroup={setIscreateGroup}
        iscreateGroup={iscreateGroup}
        setGroupMembers={setGroupMembers}
      />

      {iscreateGroup || GroupMembers.length !== 0 ? (
        <SelectedGroupMembers
          handleisCreateUser={handleisCreateUser}
          GroupMembers={GroupMembers}
          setIscreateGroup={setIscreateGroup}
          setGroupMembers={setGroupMembers}
        />
      ) : null}

      <div className="s_chat_box_container">
        <SidebarAllGroups
          selectedUser={selectedUser}
          iscreateGroup={iscreateGroup}
          groups={groups}
        />

        <SidebarAllUsers
          selectedUser={selectedUser}
          handleisCreateUser={handleisCreateUser}
          iscreateGroup={iscreateGroup}
          users={chatUsers?.filteredUsers}
          currentMessages={chatUsers?.currentMessages}
        />
      </div>
    </div>
  );
};

export default ChatSidebar;
