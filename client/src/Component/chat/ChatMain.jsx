import React, { useCallback, useEffect, useRef, useState } from "react";
import "./chat_main.css";
import { IoMdSend } from "react-icons/io";
import { useDispatch, useSelector } from "react-redux";
import { deleteMessage, send_chat_messages } from "../../action/send_chat_messages";
import { get_messages } from "../../action/get_messages";
import { get_all_chat_user } from "../../action/get_all_chat_user";
import JoinButton from "../videoStream-utils/CreateButton";
import { encryptData2 } from "../../utils/toEncrypt";
import { MdOutlineDelete } from "react-icons/md";


const ChatMain = ({ selectedUser, loading, setloading }) => {
  const contentRef = useRef(null);
  const dispatch = useDispatch();
  const getmessages = useSelector((state) => state.get_messages_reducer);
  const newMessages = useSelector((state) => state.send_chat_messages_reducer);
  const [sendingMessages, setSendingMessages] = useState("");
  const [isdelete, setIsdelete] = useState("");


  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      dispatch(
        send_chat_messages({
          message: sendingMessages,
          recieverId: selectedUser._id,
        })
      );
      setSendingMessages("");
      setloading(true);
    },
    [dispatch,setloading, sendingMessages, selectedUser]
  );

  const handleDelete = useCallback((e, id)=> {
    e.stopPropagation();
    dispatch(deleteMessage({id: id}));
    dispatch(get_messages(selectedUser._id));
    setIsdelete("");
  },[dispatch])
  

  useEffect(() => {
    if (loading) {
      dispatch(get_all_chat_user());
      setloading(false);
    }
    dispatch(get_messages(selectedUser._id ));
  }, [newMessages, loading, dispatch, selectedUser, setloading]);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [newMessages,getmessages]);


  return (
    <section className="c_section">
      <div className="c_nav">
        <div>
          <div>
            {selectedUser.picture ? (
              <img
                src={selectedUser.picture}
                alt="avatar"
                className="s_avatar_img"
              />
            ) : (
              selectedUser.username.charAt(0).toUpperCase()
            )}
          </div>
          <p>
            {selectedUser.username}

          </p>
        {/* <JoinButton friendsId = {selectedUser?.email}/>     */}
        <JoinButton friendsId = {encryptData2(selectedUser?.email)}/>    
        </div>

      </div>

      <div className="c_main1_conainer" ref={contentRef}>
        <div onClick={()=>setIsdelete("")} className="c_main_container">
          {getmessages.map((item, index) => (
            <div key={index} className="c_left_message">
              {item.receiver === selectedUser._id ? (
                <div className="c_message_box">
                  <div className="message_cut_left" />
                  <div onClick={(e)=>{e.stopPropagation(); setIsdelete(item?._id)}} className="message_cut_right">{item.content}</div>
                  {isdelete === item?._id && <span onClick={(e)=> handleDelete(e, item?._id)} className="delete_btn"><MdOutlineDelete/></span>}
                </div>
              ) : item.sender === selectedUser._id ? (
                <div className="c_message_box box_right_message">
                  <div className="message_cut_right">{item.content}</div>
                  <div className="message_cut_left right_cut_message" />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="c_buttom">
        <form>
          <input
            type="text"
            placeholder="Type a message"
            value={sendingMessages}
            onChange={(e) => setSendingMessages(e.target.value)}
          />
          {sendingMessages === "" ? null : (
            <button type="submit" onClick={(e) => handleSubmit(e)}>
              <IoMdSend className="C_searchIcon" />
            </button>
          )}
        </form>
      </div>
    </section>
  );
};

export default ChatMain;
