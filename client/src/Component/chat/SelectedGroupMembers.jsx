import React from "react";
import "./SelectedGroupMembers.css";
import { RxCross2 } from "react-icons/rx";


const SelectedGroupMembers = () => {
  return (
    <div className="group_container_main">
      <div className="group_container">
        {[...Array(6)].map((_, item) => (
          <div key={item} className="group_member">
            <span>hihello</span>
            <RxCross2 className="cross"/>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SelectedGroupMembers;
