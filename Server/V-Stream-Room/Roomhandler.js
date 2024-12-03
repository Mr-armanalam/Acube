import { v4 as uuidv4 } from "uuid";

// const users = {};

export const roomhandler = (socket, io, users) => {
  const createRoom = () => {
    const roomId = uuidv4();
    users[roomId] = [];
    socket.emit("room-created", { roomId });
    console.log("User created the room");
  };

  const joinRoom = ({ roomId }) => { 
    // console.log("User joined room", roomId);
    users[roomId] = socket.id;  
  };

  socket.on("create-room", createRoom);
  socket.on("join-room", joinRoom); 

  socket.on("callUser", (data) => {
    const userToCall = users[data.userToCall];
    // console.log("calluserdata",data);
        
    io.to(userToCall).emit("receiveCall", {
      signal: data.signalData,
      from: data.from,
      name: data.name
    });
  });

  socket.on("answerCall", (data) => {
    // console.log('answercall', data);
    const userToAnswer = users[data.to];
    io.to(userToAnswer).emit("callAccepted", data.signal);
  });

  socket.on("sendSignal", (data) => {
    // console.log(data);    
    io.to(data.to).emit("receiveSignal", data.signal);
  });

};
