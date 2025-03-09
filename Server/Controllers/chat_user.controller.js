import CryptoJS from "crypto-js";
import User from "../Models/Auth.js";
import Conversation from "../Models/conversation.model.js";
import Group from "../Models/Group.model.js";
import Message from "../Models/message.model.js";

export const getChatUser = async (req, res) => {
  try {
    const { searchquery } = req.body;
    const loggedInUserId = req.userid;

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

    const currentMessages = await Promise.all(
      filteredUsers.map(async (user) => {
        const conversatedMessages = await Conversation.findOne({
          participants: { $all: [loggedInUserId, user._id] },
        })
          .sort({ updatedAt: -1 })
          .limit(1);

        if (!conversatedMessages) return null;

        const latestMessageId = conversatedMessages.messages.slice(-1)[0];
        const latestChat = await Message.findById(latestMessageId);

        if (!latestChat) return null;

        const bytes = CryptoJS.AES.decrypt(
          latestChat.content,
          process.env.SECRETKEY_CRYPTO
        );
        const decryptedMessage = bytes.toString(CryptoJS.enc.Utf8);

        return {
          user: user._id,
          date: latestChat.createdAt,
          message: decryptedMessage,
        };
      })
    );

    // console.log(currentMessages);

    res.status(200).json({ filteredUsers, currentMessages });
  } catch (error) {
    console.log("Error -in getUsersForSidebar : ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getGroupUser = async (req, res) => {
  try {
    const currentUser = req.userid;

    const group = await Group.find({
      members: { $all: [currentUser] },
    }).populate("members", "name");
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }
    res.status(200).json(group);
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ error: "Internal server error" });
    // throw new Error(error.message);
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const {id: messageId} = req.body;
    // console.log( messageId);

    const deleted = await Message.findOneAndDelete({ _id: messageId }, {new: true});
    if (!deleted) {
      return res.status(404).json({ error: "message not deleted" });
    }
    res.status(200).json("message is successfully deleted")
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ error: "Internal server"})
  }
};