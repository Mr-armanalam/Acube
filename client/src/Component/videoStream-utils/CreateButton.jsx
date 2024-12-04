import React, { useContext } from 'react'
import { RoomContext } from '../../utils/RoomContext'
import '../../Pages/videostream/videoStream.css'
import { IoVideocamOutline } from "react-icons/io5";


const JoinButton = ({friendsId}) => {
    const { socket } = useContext(RoomContext);
    // console.log(friendsId);  
    const createRoom = () => {
        socket.emit('create-room',{friendsId: friendsId});
    }
  return (
    <button onClick={createRoom} type='button' className='start_meeting_btn1'> 
    <IoVideocamOutline  className='start_button2' style={{fontWeight: 'bolder'}}/>
    </button>
  )
}

export default JoinButton