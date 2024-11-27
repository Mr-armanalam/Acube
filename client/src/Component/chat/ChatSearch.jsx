import React, { useEffect, useState, useCallback } from "react";
import { useDispatch } from "react-redux";
import { get_all_chat_user } from "../../action/get_all_chat_user";
import { GrAddCircle } from "react-icons/gr";
import { ImCross } from "react-icons/im";




const ChatSearch = ({ setIscreateGroup, iscreateGroup, setGroupMembers}) => {
  const dispatch = useDispatch();
  const [searchquery, setsearchquery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState(searchquery);
  
  // Debounce function
  const debounce = (func, delay) => {
    let timer;
    return (...args) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        func(...args);
      }, delay);
    };
  };

  const handleIscreate = useCallback(() => {
    setIscreateGroup(true);    
  },[setIscreateGroup])

  const handleSearch = useCallback(
    debounce((query) => {
      dispatch(get_all_chat_user({ searchquery: query }));
    }, 500), 
    [dispatch]
  );

  const handleChat = useCallback(() => {
    setIscreateGroup(false);
    setGroupMembers([]);
  },[setIscreateGroup, setGroupMembers])

  useEffect(() => {
    setDebouncedQuery(searchquery);
    handleSearch(searchquery);
  }, [searchquery, handleSearch]);

  return (
    <div className="s_header">
      {!iscreateGroup ? (
        <h2>
        Chats <GrAddCircle className="add_group" onClick={handleIscreate} />
        </h2>
      ):(
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


/////////////////// another method ////////////////////

//   useEffect(() => {
//     setTimeout(() => {
//       dispatch(get_all_chat_user({ searchquery: searchquery }));
//     }, 500);
//     clearTimeout();
//   }, [searchquery, dispatch]);
