import React, { useCallback } from "react";
import { useAppDispatch } from "../../store";
import { selectChat } from "../../store/slices/chatUiSlice";
import type { ChatUser, Group } from "../../types";

const SidebarAllGroups = ({
  selectedUser,
  iscreateGroup,
  groups,
}: {
  selectedUser: ChatUser | undefined;
  iscreateGroup: boolean;
  groups: Group[] | undefined;
}) => {
  const dispatch = useAppDispatch();

  const handleSelectedUser = useCallback(
    (group: Group) => {
      dispatch(selectChat({ kind: "group", group }));
    },
    [dispatch],
  );
  return (
    <>
      {groups &&
        groups.map((item, index) => (
          <div
            key={index}
            className={`s_chat_box ${
              // selectedUser?._id === groups._id ? "selected" :
              ""
            }`}
            onClick={() => !iscreateGroup && handleSelectedUser(item)}
          >
            <div className="s_avatar">
              {item?.GroupPicture ? (
                <img
                  src={item.GroupPicture}
                  alt="user avatar"
                  className="s_avatar_img"
                />
              ) : (
                item.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="chat_owner">
              <div>
                <h4>{item.name}</h4>
                <p>{"Let's talk with our colleagues and friends"}</p>
              </div>
              <span>Groups</span>
            </div>
          </div>
        ))}
    </>
  );
};

export default SidebarAllGroups;
