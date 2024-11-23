import User from "../Models/Auth.js";
import Conversation from "../Models/conversation.model.js";
import Message from "../Models/message.model.js";

export const getChatUser = async (req, res) => {
  try {   
    const {searchquery} = req.body;
    const loggedInUserId = req.user.id;

    const userFilter = { _id: { $ne: loggedInUserId } }; 
    if (searchquery) { 
      userFilter.username = { $regex: new RegExp(searchquery, "i") }; 
    }

    const filteredUsers = await User.find(userFilter);

    //   const currentMessage = [];
    //   const conversated_messages = await Conversation.find({participants: {$all: [loggedInUserId, filteredUsers[0]?._id]}});
    //   const messages_id = conversated_messages[0]?.messages.slice(-1)[0];
    //   const latestChat = await Message.findById({_id: messages_id});
    //    currentMessage.push({
    //       date: latestChat?.createdAt,
    //       message: latestChat?.content
    //    })

    const currentMessages = await Promise.all(filteredUsers.map(async (user) => { 
      const conversatedMessages = await Conversation.findOne({ 
        participants: {$all: [loggedInUserId, user._id]} 
      }).sort({'updatedAt': -1}).limit(1); 

     if (!conversatedMessages) return null; 

      const latestMessageId = conversatedMessages.messages.slice(-1)[0]; 
      const latestChat = await Message.findById(latestMessageId); 
      
      if (!latestChat) return null; 

      return { user: user._id, date: latestChat.createdAt, message: latestChat.content }; 
    })); 
    
    // console.log(currentMessages);
  

    res.status(200).json({filteredUsers, currentMessages});
  } catch (error) {
    console.log("Error -in getUsersForSidebar : ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
