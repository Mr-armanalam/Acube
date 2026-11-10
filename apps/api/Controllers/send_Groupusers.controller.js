import Group from "../Models/Group.model.js";

export const send_Groupusers = async (req, res, next) => {
  try {
    const { GroupId: memberIds, GroupName: name } = req.body;
    const currentUser = req.userid;
    // console.log(GroupName);

    // Phase 3b: build a NEW members array (the old code pushed the
    // creator onto the request-body array in place) and dedupe, so the
    // creator is a member + admin exactly once even if listed twice.
    const members = [...new Set([...memberIds, String(currentUser)])];

    const group = new Group({ name, members, admin: [currentUser] });
    await group.save();
    res.status(200).json("Groupusers successfully created");
  } catch (error) {
    // Phase 1: the old code replied 200 with { error, status: 500 } in the
    // body. Forward to the central error handler for a real 500 instead.
    next(error);
  }
};
