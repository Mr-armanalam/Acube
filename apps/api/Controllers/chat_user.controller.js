import CryptoJS from "crypto-js";
import User from "../Models/Auth.js";
import Conversation from "../Models/conversation.model.js";
import Group from "../Models/Group.model.js";
import Message from "../Models/message.model.js";
import { paginate, paginationOf } from "../utils/pagination.js";

function decrypt(content) {
  const bytes = CryptoJS.AES.decrypt(content, process.env.SECRETKEY_CRYPTO);
  return bytes.toString(CryptoJS.enc.Utf8);
}

export const getChatUser = async (req, res) => {
  try {
    const { searchquery } = req.body;
    const loggedInUserId = req.userid;

    const userFilter = { _id: { $ne: loggedInUserId } };
    if (searchquery) {
      // Phase 3b: escape the search text — an unescaped RegExp let a
      // caller inject a regex (ReDoS / match-everything).
      const escaped = searchquery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      userFilter.username = { $regex: new RegExp(escaped, "i") };
    }

    // Phase 3b: paginated + lean. The shape keeps { filteredUsers,
    // currentMessages } and adds page/limit/total/totalPages.
    const page = await paginate(
      User.find(userFilter).sort({ createdAt: 1, _id: 1 }),
      paginationOf(req),
    );
    const filteredUsers = page.items;

    const currentMessages = await Promise.all(
      filteredUsers.map(async (user) => {
        const conversatedMessages = await Conversation.findOne({
          participants: { $all: [loggedInUserId, user._id] },
        })
          .sort({ updatedAt: -1 })
          .limit(1)
          .lean();

        if (!conversatedMessages) return null;

        const latestMessageId = conversatedMessages.messages.slice(-1)[0];
        const latestChat = await Message.findById(latestMessageId).lean();

        if (!latestChat) return null;

        return {
          user: user._id,
          date: latestChat.createdAt,
          message: decrypt(latestChat.content),
        };
      })
    );

    // console.log(currentMessages);

    res.status(200).json({
      filteredUsers,
      currentMessages,
      page: page.page,
      limit: page.limit,
      total: page.total,
      totalPages: page.totalPages,
    });
  } catch (error) {
    console.log("Error -in getUsersForSidebar : ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getGroupUser = async (req, res) => {
  try {
    const currentUser = req.userid;

    // Phase 3b: paginated + lean, shape { items, page, limit, total,
    // totalPages }. (The old code checked `if (!group)` on a find()
    // result, which is always truthy — an empty list is just empty.)
    const page = await paginate(
      Group.find({ members: { $all: [currentUser] } })
        .populate("members", "name")
        .sort({ createdAt: 1, _id: 1 }),
      paginationOf(req),
    );
    res.status(200).json(page);
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

    // Phase 3b: owner check — only the sender may delete their message.
    // (The route is also authed now; see Routes/chat.js.)
    const existing = await Message.findById(messageId).lean();
    if (!existing) {
      return res.status(404).json({ error: "message not deleted" });
    }
    if (String(existing.sender) !== String(req.userid)) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "You can only delete your own messages" } });
    }

    // Phase 1: dropped the meaningless `{ new: true }` option on a delete
    // (Mongoose 9 warns that `new` is deprecated; it has no effect here).
    const deleted = await Message.findOneAndDelete({ _id: messageId });
    if (!deleted) {
      return res.status(404).json({ error: "message not deleted" });
    }
    res.status(200).json("message is successfully deleted")
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ error: "Internal server"})
  }
};
