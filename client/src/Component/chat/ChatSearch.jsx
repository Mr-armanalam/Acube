import React, { useEffect, useState } from "react";
import { MdOutlineSettings } from "react-icons/md";
import { useDispatch } from "react-redux";
import { get_all_chat_user } from "../../action/get_all_chat_user";

const ChatSearch = () => {
    const dispatch = useDispatch();
    const [searchquery, setsearchquery] = useState('');
    // console.log(searchquery);
    
    useEffect(() => {
        // console.log(searchquery);
            setTimeout(() => {
           dispatch(get_all_chat_user({searchquery: searchquery})) 
        }, 500)
        clearTimeout();
    },[searchquery, dispatch])

  return (
    <div className="s_header">
      <h2>
        Chats{" "}
        <MdOutlineSettings className="s_setting"/>
      </h2>
      <div>
        <input type="text" placeholder="Search" 
            value={searchquery}
            onChange={(e) => setsearchquery(e.target.value)}
        />
      </div>
    </div>
  );
};

export default ChatSearch;
