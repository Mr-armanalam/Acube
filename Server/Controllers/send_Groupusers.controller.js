import Group from "../Models/Group.model.js";

export const send_Groupusers = async (req, res) => {
  try {
    const { GroupId: members, GroupName: name } = req.body;
    const currentUser = req.userid;
    // console.log(GroupName);

    members.push(req.userid);

    const group = new Group({ name, members });
    group?.admin?.push(currentUser);
    await group.save();
    res.status(200).json("Groupusers successfully created");
  } catch (error) {
    console.log(error.message);
    return res.json({ error: error.message, status: 500 });
  }
};
