import User from "../Models/Auth.js";

export const getChatUser = async (req, res) => {
  try {   
    const loggedInUserId = req.user.id;
    const filteredUsers = await User.find({_id: {$ne: loggedInUserId}});

    res.status(200).json(filteredUsers);
  } catch (error) {
    console.log("Error -in getUsersForSidebar : ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
