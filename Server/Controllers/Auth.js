import users from "../Models/Auth.js";
import jwt from "jsonwebtoken";

export const login = async (req, res) => {
  const { email, username, picture } = req.body;
  try {
    const existinguser = await users.findOne({ email });
    if (!existinguser) {
      try {
        const newuser = await users.create({
          email,
          username,
          picture,
          picture,
          downloads: [],
          downloadsToday: 0,
          lastReset: new Date(),
        });
        const token = jwt.sign({email: newuser.email,id: newuser._id,},
            process.env.JWT_SECERT,{expiresIn: "6h",}
        );

        res.status(200).json({ result: newuser, token });
      } catch (error) {
        res.status(500).json({ mess: "something went wrong..." });
        return;
      }
    } else {

      const now = new Date();
      const lastReset = new Date(existinguser.lastReset || now);

      if (now.getDate() !== lastReset.getDate()) {
        existinguser.downloads = [];
        existinguser.downloadsToday = 0;
        existinguser.lastReset = now;
        await existinguser.save();
      }

      const token = jwt.sign(
        { email: existinguser.email, id: existinguser._id, },
        process.env.JWT_SECERT,
        {expiresIn: "6h",}
      );

      res.status(200).json({ result: existinguser, token });
    }
  } catch (error) {
    res.status(500).json({ mess: "something went wrong..." });
    return;
  }
};

export const updatePoints = async (req, res) => {
  try {
    const { points } = req.body;
    const userId = req.userid;
    console.log(points, userId);

    const existingUser = await users.findById(userId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    existingUser.reputation = (existingUser.reputation || 0) + points;
    await existingUser.save();

    res.status(200).json({
      message: "Points updated successfully",
      points: existingUser.reputation,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Internal server error, Look like you not logged In" });
  }
};
