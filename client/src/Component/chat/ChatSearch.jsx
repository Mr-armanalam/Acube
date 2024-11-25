import React, { useEffect, useState, useCallback } from "react";
import { MdOutlineSettings } from "react-icons/md";
import { useDispatch } from "react-redux";
import { get_all_chat_user } from "../../action/get_all_chat_user";


const ChatSearch = () => {
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

  const handleSearch = useCallback(
    debounce((query) => {
      dispatch(get_all_chat_user({ searchquery: query }));
    }, 500), 
    [dispatch]
  );

  useEffect(() => {
    setDebouncedQuery(searchquery);
    handleSearch(searchquery);
  }, [searchquery, handleSearch]);

  return (
    <div className="s_header">
      <h2>
        Chats <MdOutlineSettings className="s_setting" />
      </h2>
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
