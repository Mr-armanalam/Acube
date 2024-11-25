import Conversation from "../Models/conversation.model.js";
import Message from "../Models/message.model.js";


export const sendMessage = async (req, res) =>{
    try {
        const {message, recieverId} = req.body;
        const senderId = req.userid;
        // console.log(recieverId)
        // console.log(senderId)

        let conversation = await Conversation.findOne({
            participants: {$all : [senderId, recieverId]}
        })

        if (!conversation) {
            conversation = await Conversation.create({
                participants: [senderId, recieverId]
            })
        }

        const newMessage = new Message({
            sender: senderId,
            receiver: recieverId,
            content: message
        })

        if (newMessage) {
            conversation.messages.push(newMessage);
        }
        
        // // this will run is parallel
        await Promise.all([conversation.save(), newMessage.save()]);
        res.status(201).json(newMessage)
    } catch (error) {
        console.error("Error in sending message", error.message)
        res.status(500).json({error: error.message})
    }
}

export const getMessage = async (req, res) => {
    try {
        const {id:selectedUser} = req.params;
        const senderId = req.userid;

        // console.log(selectedUser);
        // console.log(senderId)     

        const conversation = await Conversation.findOne({
         participants: {$all: [senderId, selectedUser]}
        }).populate("messages");

        if (!conversation) return res.status(404).json([]);
        const messages = conversation.messages;
        res.status(200).json(messages);
        
    } catch (error) {
        console.error("Error in getMessage", error.message);
        res.status(500).json({ error: error.message });
    }
}
