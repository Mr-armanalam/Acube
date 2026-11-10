import mongoose from "mongoose";
import users from "../Models/Auth.js"
import videofile from "../Models/videofile.js";
import { paginate, paginationOf } from "../utils/pagination.js";


export const updatechaneldata=async(req,res)=>{
    const {id:_id}=req.params;
    const {name,desc}=req.body;
    if(!mongoose.Types.ObjectId.isValid(_id)){
        return res.status(400).send("Channel unavailable..")
    }
    // Phase 3b: owner check — a user may only edit their OWN channel.
    // (The route is also authed now; see Routes/User.js.)
    if (String(req.userid) !== String(_id)) {
        return res.status(403).json({ error: { code: "FORBIDDEN", message: "You can only edit your own channel" } })
    }
    try {
         await videofile.updateMany({videochanel: _id}, {
            $set: {
                uploader: name
            }
        });

        const updatedata=await users.findByIdAndUpdate(
            _id,{
                $set:{
                    name:name,
                    desc:desc,
                },
            },
            { returnDocument: "after" }
        );

        if (!updatedata) {
            return res.status(404).send("Channel unavailable..")
        }
        res.status(200).json(updatedata)
    } catch (error) {
        res.status(405).json({message:error.message})
        return
    }
}

export const getallchanels=async(req,res)=>{
    try {
        // Phase 3b: paginated + lean. Response shape is now
        // { items, page, limit, total, totalPages }; each item keeps the
        // old {_id, name, email, desc} projection. The list stays public
        // (it is the channel directory) — no auth on this route.
        const page = await paginate(
            users.find().sort({ createdAt: 1, _id: 1 }),
            paginationOf(req),
        );
        const allchaneldata = page.items.map((channel)=>({
            _id:channel._id,
            name:channel.name,
            email:channel.email,
            desc:channel.desc
        }));
        res.status(200).json({ ...page, items: allchaneldata })
    } catch (error) {
        res.status(405).json({message:error.message})
        return
    }
}
