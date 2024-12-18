import React, { useCallback, useState } from "react";
import "./SelectedGroupMembers.css";
import { RxCross2 } from "react-icons/rx";
import { useDispatch } from "react-redux";
import { send_GroupUsers } from "../../action/sendgroupuser";
import { fetchGroup } from "../../action/getAll_Group";

const SelectedGroupMembers = ({ handleisCreateUser, GroupMembers, setGroupMembers, setIscreateGroup }) => {
  const dispatch = useDispatch();
  const [GroupId, setGroupId] = useState([]);
  const [GroupName, setGroupName] = useState("");
  const [isSelected, setIsselected] = useState(false);

  const handleOnSubmit = useCallback(
    (e) => {
      e.preventDefault();
      setIsselected(false);
      dispatch(send_GroupUsers({GroupId: GroupId, GroupName: GroupName}))
      setGroupMembers([]);
      setIscreateGroup(false);
      dispatch(fetchGroup());
    },
    [ GroupName, GroupId, dispatch, setGroupMembers, setIscreateGroup]
  );

  const handleOnSelected = useCallback(() => {
    setIsselected(true);
    setGroupId(GroupMembers?.map((item) => item._id));
    // console.log(GroupId);
  },[ GroupMembers]);

  return (
    <>
      <div className="group_container_main">
        <div className="group_container">
          {GroupMembers?.map((item, index) => (
            <div key={index} className="group_member">
              <span>{item.username}</span>
              <RxCross2
                className="cross"
                onClick={() => handleisCreateUser(GroupMembers[index])}
              />
            </div>
          ))}
        </div>
        {GroupMembers?.length !==0 && <button className="selectbtn" type="button" onClick={handleOnSelected}>
          Select
        </button>}
      </div>
      {isSelected && (
        <div className="Groupname_container">
          <div className="Group_form1">
            <form onSubmit={(e) => handleOnSubmit(e)}>
              <input
                type="text"
                placeholder="Group Name"
                className="Group_name"
                value={GroupName}
                required={true}
                onChange={(e) => setGroupName(e.target.value)}
              />
              <button type="submit" className="submitbtn">
                Create Group
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default SelectedGroupMembers;
