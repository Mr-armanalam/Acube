import React, { useCallback, useEffect, useState } from "react";
import { useAppDispatch } from "../../store";
import { setChatSearchQuery } from "../../store/slices/chatUiSlice";
import { GrAddCircle } from "react-icons/gr";
import { ImCross } from "react-icons/im";
import type { ChatUser } from "../../types";

const ChatSearch = ({
  setIscreateGroup,
  iscreateGroup,
  setGroupMembers,
}: {
  setIscreateGroup: (v: boolean) => void;
  iscreateGroup: boolean;
  setGroupMembers: (v: ChatUser[]) => void;
}) => {
  const dispatch = useAppDispatch();
  const [searchquery, setsearchquery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState(searchquery);

  // Debounce function
  const debounce = (func: (query: string) => void, delay: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return (...args: [string]) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        func(...args);
      }, delay);
    };
  };

  const handleIscreate = useCallback(() => {
    setIscreateGroup(true);
  }, [setIscreateGroup]);

  const handleSearch = useCallback(
    debounce((query: string) => {
      // The chat-user list is a Query keyed by this text (see ChatSidebar).
      dispatch(setChatSearchQuery(query));
    }, 500),
    [dispatch],
  );

  const handleChat = useCallback(() => {
    setIscreateGroup(false);
    setGroupMembers([]);
  }, [setIscreateGroup, setGroupMembers]);

  useEffect(() => {
    setDebouncedQuery(searchquery);
    handleSearch(searchquery);
  }, [searchquery, handleSearch, setDebouncedQuery]);

  return (
    <div className="s_header">
      {!iscreateGroup ? (
        <h2>
          Chats <GrAddCircle className="add_group" onClick={handleIscreate} />
        </h2>
      ) : (
        <h2>
          Create <ImCross className="add_group" onClick={handleChat} />
        </h2>
      )}

      <div>
        <input
          type="text"
          placeholder="Search"
          value={searchquery}
          onChange={(e) => setsearchquery(e.target.value)}
        />
      </div>
    </div>
  );
};

export default ChatSearch;
