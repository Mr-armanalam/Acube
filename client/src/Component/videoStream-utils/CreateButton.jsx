import React, { useContext } from 'react'
import { RoomContext } from '../../utils/RoomContext'

const JoinButton = () => {
    const { socket } = useContext(RoomContext);
    const createRoom = () => {
        socket.emit('create-room');
    }
  return (
    <button onClick={createRoom} type='button' className='start_meeting_btn'>Start new meeting</button>
  )
}

export default JoinButton