import jwt from 'jsonwebtoken';
import User from '../Models/Auth.js'

const protectRoute = async (req, res, next) => {
    try {
        // const token = JSON.parse(req.cookies.jwt_01);
        // console.log(token);

        const {token} = req.params;

        if (!token) {
            return res.status(401).json({ message: "You are not authenticated" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECERT);
        // console.log(decoded);

        if(!decoded) {
            return res.status(401).json({ message: "Unauthorized - Invalid Token" });
        }

        // const user =  decoded

        const user = await User.findById(decoded.id)

        if(!user) {
            return res.status(401).json({ message: "Unauthorized - User not found" });
        }

        req.user = user;
        next();
    } catch (error) {
        console.log("Error in protectRoute middleware: ", error.message)
        res.status(500).json({error: "Internal server error"})
    }
}

export default protectRoute;
