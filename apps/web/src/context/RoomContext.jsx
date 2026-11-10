import { createContext, useEffect } from "react";
import socketIo from "socket.io-client";
import {useNavigate} from 'react-router'

// const WS = "http://localhost:5000";
const WS = import.meta.env.VITE_BACKEND_URL;


export const RoomContext = createContext(null);

const socket = socketIo(WS);

export const RoomProvider = ({ children }) => {
  const navigate = useNavigate();

  const enterRoom = ({roomId}) => {
    // console.log({roomId});   
    navigate(`/video-stream/${roomId}`)
  };

  useEffect(() =>{
    socket.on('room-created', enterRoom);
  },[])

  return <RoomContext.Provider value={{ socket}}>{children}</RoomContext.Provider>;
};
