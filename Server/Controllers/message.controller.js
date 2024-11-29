import CryptoJS from "Crypto-js";
import Conversation from "../Models/conversation.model.js";
import Group from "../Models/Group.model.js";
import Message from "../Models/message.model.js";

export const sendMessage = async (req, res) => {
  try {
    const { message, recieverId } = req.body;
    const senderId = req.userid;
    const encryptedMessage = CryptoJS.AES.encrypt(
      message,
      process.env.SECRETKEY_CRYPTO
    ).toString();

    let conversation = await Conversation.findOne({
      participants: { $all: [senderId, recieverId] },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [senderId, recieverId],
      });
    }

    const newMessage = new Message({
      sender: senderId,
      receiver: recieverId,
      content: encryptedMessage,
    });

    if (newMessage) {
      conversation.messages.push(newMessage);
    }

    // // this will run is parallel
    await Promise.all([conversation.save(), newMessage.save()]);
    res.status(201).json(newMessage);
  } catch (error) {
    console.error("Error in sending message", error.message);
    res.status(500).json({ error: error.message });
  }
};

export const getMessage = async (req, res) => {
  try {
    const { id: selectedUser } = req.params;
    const senderId = req.userid;

    const conversation = await Conversation.findOne({
      participants: { $all: [senderId, selectedUser] },
    }).populate("messages");

    if (!conversation) return res.status(404).json([]);

    const messages = conversation.messages.map((msg) => {
      const bytes = CryptoJS.AES.decrypt(
        msg.content,
        process.env.SECRETKEY_CRYPTO
      );
      const decryptedMessage = bytes.toString(CryptoJS.enc.Utf8);
      return { ...msg._doc, content: decryptedMessage };
    });

    // const messages = conversation.messages;
    res.status(200).json(messages);
  } catch (error) {
    console.error("Error in getMessage", error.message);
    res.status(500).json({ error: error.message });
  }
};

export const sendGroupMessage = async (req, res) => {
  try {
    const { content, groupId } = req.body;
    const senderId = req.userid;
    const encryptedMessage = CryptoJS.AES.encrypt(
      content,
      process.env.SECRETKEY_CRYPTO
    ).toString();

    const message = new Message({
      sender: senderId,
      group: groupId,
      content: encryptedMessage,
    });

    await message.save();

    await Group.findByIdAndUpdate(groupId, {
      $push: { messages: message._id },
    });

    res.status(201).json("message is successfully send");
  } catch (error) {
    console.error("Error in sending group message", error.message);
    res.status(500).json({ error: error.message });
  }
};

export const getGroupMessages = async (req, res) => {
  try {
    // console.log("hi");
    const { groupId } = req.params;

    const group = await Group.findById(groupId).populate({
      path: "messages",
      populate: { path: "sender", select: "username" },
    });
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    const messages = group.messages.map((msg) => {
      const bytes = CryptoJS.AES.decrypt(
        msg.content,
        process.env.SECRETKEY_CRYPTO
      );
      const decryptedContent = bytes.toString(CryptoJS.enc.Utf8);
      return { ...msg._doc, content: decryptedContent };
    });

    res.status(200).json(messages);
  } catch (error) {
    console.error("Error in getGroupMessages", error.message);
    res.status(500).json({ error: error.message });
  }
};
