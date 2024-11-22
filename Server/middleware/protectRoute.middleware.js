import jwt from 'jsonwebtoken';
import User from '../Models/Auth.js'

const protectRoute = async (req, res, next) => {
    try {
        const token = req.cookies.jwt_01;

        if (!token) {
            return res.status(401).json({ message: "You are not authenticated" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECERT);

        if(!decoded) {
            return res.status(401).json({ message: "Unauthorized - Invalid Token" });
        }

        const user =  decoded

        // const user = await User.findById(decoded.userId).select("-password")

        // if(!user) {
        //     return res.status(401).json({ message: "Unauthorized - User not found" });
        // }

        req.user = user;
        next();
    } catch (error) {
        console.log("Error in protectRoute middleware: ", error.message)
        res.status(500).json({error: "Internal server error"})
    }
}

export default protectRoute;
