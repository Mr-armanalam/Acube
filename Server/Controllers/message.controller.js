import Conversation from "../Models/conversation.model.js";
import Message from "../Models/message.model.js";


export const sendMessage = async (req, res) =>{
    try {
        const {message} = req.body;
        const {id: receiverId} = req.params;
        const senderId = req.user._id;

        let conversation = await Conversation.findOne({
            participants: {$all : [senderId, receiverId]}
        })

        if (!conversation) {
            conversation = await Conversation.create({
                participants: [senderId, receiverId]
            })
        }

        const newMessage = new Message({
            sender: senderId,
            receiver: receiverId,
            content: message
        })

        if (newMessage) {
            conversation.messages.push(newMessage);
        }

        
        // await conversation.save();
        // await newMessage.save();
        
        // this will run is parallel
        await Promise.all([conversation.save(), newMessage.save()]);
        // SOCKET IO FUNCTIONALITY WILL GO HERE
        const receiverSocketId = getReceiverSocketId(receiverId);
        if (receiverSocketId) {
            // io.to(<socket_id>).emit() used to send events to specivic client
            io.to(receiverSocketId).emit("newMessage", newMessage);
        } else {
            console.log("receiver socket id not found");
        }

        res.status(201).json(newMessage)
    } catch (error) {
        console.error("Error in sending message", error.message)
        res.status(500).json({error: error.message})
    }
}

export const getMessage = async (req, res) => {
    try {
        const {id: userToChatId} = req.params;
        const senderId = req.user._id;
        const conversation = await Conversation.findOne({
            participants: {$all: [senderId, userToChatId]}
        }).populate("messages");

        if (!conversation) return res.status(404).json([]);

        const messages = conversation.messages;
        

        res.status(200).json(messages);
        
    } catch (error) {
          console.error("Error in getMessage", error.message);
          res.status(500).json({ error: error.message });
    }
}
