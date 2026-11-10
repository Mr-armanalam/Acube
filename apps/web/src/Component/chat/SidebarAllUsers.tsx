import React, { useCallback } from "react";
import formatDate from "../../utils/getDateformate";
import { formatNewDate } from "../../utils/getnewDate";
import { useAppDispatch } from "../../store";
import { selectChat } from "../../store/slices/chatUiSlice";
import type { ChatUser, ChatUserList } from "../../types";

const SidebarAllUsers = ({
  selectedUser,
  handleisCreateUser,
  iscreateGroup,
  users,
  currentMessages,
}: {
  selectedUser: ChatUser | undefined;
  handleisCreateUser: (user: ChatUser) => void;
  iscreateGroup: boolean;
  users: ChatUser[] | undefined;
  currentMessages: ChatUserList["currentMessages"] | undefined;
}) => {
  const dispatch = useAppDispatch();

  const handleSelectedUser = useCallback(
    (user: ChatUser) => {
      dispatch(selectChat({ kind: "user", user }));
    },
    [dispatch],
  );
  return (
    <>
      {users &&
        users.map((item, index) => (
          <div
            key={index}
            className={`s_chat_box ${
              selectedUser?.email === item.email ? "selected" : ""
            }`}
            onClick={() =>
              iscreateGroup
                ? handleisCreateUser(item)
                : handleSelectedUser(item)
            }
          >
            <div className="s_avatar">
              {item?.picture ? (
                <img
                  src={item.picture}
                  alt=""
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
                  {currentMessages?.[index]?.message ||
                    "Let's talk with someone"}
                </p>
              </div>
              <span>
                {currentMessages?.[index]?.date
                  ? formatDate(currentMessages[index]?.date)
                  : formatNewDate(new Date())}
              </span>
            </div>
          </div>
        ))}
    </>
  );
};

export default SidebarAllUsers;
