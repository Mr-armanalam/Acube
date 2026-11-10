import CryptoJS from "crypto-js";
import Conversation from "../Models/conversation.model.js";
import Group from "../Models/Group.model.js";
import Message from "../Models/message.model.js";
import { paginate, paginationOf } from "../utils/pagination.js";

// Chat encryption model (Phase 3c honesty note): messages are AES
// encrypted with ONE shared server-side key (SECRETKEY_CRYPTO), so the
// server can decrypt every message. That is TLS + server-side
// encryption at rest — NOT end-to-end encryption. Do not label it E2E
// anywhere (README, UI, or comments).
function decrypt(content) {
  const bytes = CryptoJS.AES.decrypt(content, process.env.SECRETKEY_CRYPTO);
  return bytes.toString(CryptoJS.enc.Utf8);
}

// Phase 3b: group membership check shared by the group send/get
// handlers. Non-members get 403; an unknown group gets 404.
async function memberGroupOrError(req, res, groupId) {
  const group = await Group.findById(groupId).lean();
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return null;
  }
  const isMember = (group.members ?? []).some(
    (m) => String(m) === String(req.userid),
  );
  if (!isMember) {
    res.status(403).json({
      error: { code: "FORBIDDEN", message: "You are not a member of this group" },
    });
    return null;
  }
  return group;
}

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
    }).lean();

    if (!conversation) return res.status(404).json([]);

    // Phase 3b: messages are queried from the Message collection
    // (paginated, chronological) instead of populate-everything on the
    // conversation — a long thread no longer loads every message at
    // once. Shape is now { items, page, limit, total, totalPages }.
    const page = await paginate(
      Message.find({
        $or: [
          { sender: senderId, receiver: selectedUser },
          { sender: selectedUser, receiver: senderId },
        ],
      }).sort({ createdAt: 1, _id: 1 }),
      paginationOf(req),
    );
    const messages = page.items.map((msg) => ({
      ...msg,
      content: decrypt(msg.content),
    }));

    res.status(200).json({ ...page, items: messages });
  } catch (error) {
    console.error("Error in getMessage", error.message);
    res.status(500).json({ error: error.message });
  }
};

export const sendGroupMessage = async (req, res) => {
  try {
    const { content, groupId } = req.body;
    const senderId = req.userid;

    // Phase 3b: the group must exist AND the sender must be a member
    // before any message is stored (the old code saved the message
    // first and updated a possibly-missing group afterwards).
    if (!(await memberGroupOrError(req, res, groupId))) return;

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

    // Phase 3b: authed + members-only (403 for non-members), and
    // messages are queried from the Message collection (paginated,
    // chronological) instead of populate-everything on the group.
    if (!(await memberGroupOrError(req, res, groupId))) return;

    const page = await paginate(
      Message.find({ group: groupId })
        .populate("sender", "username")
        .sort({ createdAt: 1, _id: 1 }),
      paginationOf(req),
    );
    const messages = page.items.map((msg) => ({
      ...msg,
      content: decrypt(msg.content),
    }));

    res.status(200).json({ ...page, items: messages });
  } catch (error) {
    console.error("Error in getGroupMessages", error.message);
    res.status(500).json({ error: error.message });
  }
};
