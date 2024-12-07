import users from "../Models/Auth.js"
import jwt from "jsonwebtoken"


export const login = async (req, res) => {
    const { email,username, picture } = req.body;
    // console.log(req.body)
    try {
        const extinguser = await users.findOne({ email })
        if (!extinguser) {
            try {
                const newuser = await users.create({
                     email ,
                     username,
                     picture
                    });
                const token = jwt.sign({
                    email: newuser.email, id: newuser._id
                }, process.env.JWT_SECERT, {
                    expiresIn: "6h"
                })
                
                // res.cookie("jwt_01", token, {
                //     maxAge: 1 * 24 * 60 * 60 * 1000, //ms
                //     httpOnly: true, //prevent XSS attacks cross-site scripting attacks
                //     sameSite: "strict", // CSRF attacks cross-site request forgery attacks
                //     secure: process.env.NODE_ENV !== "development", // cookie only works in https
                // });
                // console.log(newuser);
                res.status(200).json({ result: newuser, token })
            } catch (error) {
                res.status(500).json({ mess: "something went wrong..." })
                return
            }

        } else {
            const token = jwt.sign({
                email: extinguser.email, id: extinguser._id
            }, process.env.JWT_SECERT, {
                expiresIn: "6h"
            });

            // const tokenString = JSON.stringify(token);

            // res.cookie("jwt_01", tokenString, {
            //     maxAge: 1 * 24 * 60 * 60 * 1000, //ms
            //     httpOnly: true, //prevent XSS attacks cross-site scripting attacks
            //     sameSite: "strict", // CSRF attacks cross-site request forgery attacks
            //     secure: process.env.NODE_ENV !== "development", // cookie only works in https
            // });

            res.status(200).json({ result: extinguser ,token})
        }
    } catch (error) {
        res.status(500).json({ mess: "something went wrong..." })
        return
    }
}


export const updatePoints = async (req, res) => {
  try {
    const { points } = req.body;
    const userId = req.userid;

    const existingUser = await users.findById(userId);
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    existingUser.reputation = (existingUser.reputation || 0) + points;
    await existingUser.save();

    res.status(200).json({ message: 'Points updated successfully', points: existingUser.reputation });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error, Look like you not logged In' });
  }
};
