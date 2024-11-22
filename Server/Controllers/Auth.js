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
                    expiresIn: "12h"
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
                expiresIn: "12h"
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