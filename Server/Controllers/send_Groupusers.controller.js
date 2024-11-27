import Group from "../Models/Group.model.js";

export const send_Groupusers = async (req, res) =>{
    const {GroupId:members, GroupName:name} = req.body;
    // console.log(GroupName);

    const group = new Group({ name, members });
    await group.save();
    
    console.log(group)

    res.status(200).json("Groupusers successfully created") ;   
}