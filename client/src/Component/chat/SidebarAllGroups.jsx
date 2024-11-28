import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux';
import { fetch_grp_msg } from '../../action/send_group_msg';

const SidebarAllGroups = ({ setSelectedUser,setloading, setnavigate,selectedUser, iscreateGroup}) => {
    const dispatch = useDispatch();
    const groups = useSelector(state => state.fetch_All_groups);

    const handleSelectedUser = useCallback(
        (group) => {
          dispatch(fetch_grp_msg(group._id));
          setSelectedUser(group);        
          setloading(true);
          setnavigate({ display: "navigate" });
        },
        [setloading, setnavigate, dispatch, setSelectedUser]
      );
  return (
    <>
        {groups &&
          groups.map((item, index) => (
            <div
              key={index}
              className={`s_chat_box ${
                // selectedUser?._id === groups._id ? "selected" : 
                "" 
              }`}
              onClick={() => !iscreateGroup && handleSelectedUser(item)
              }
            >
              <div className="s_avatar">
                {item?.GroupPicture ? (
                  <img
                    src={item.GroupPicture}
                    alt="user avatar"
                    className="s_avatar_img"
                  />
                ) : (
                  item.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="chat_owner">
                <div>
                  <h4>{item.name}</h4>
                  <p>
                      "Let's talk with our colleagues and friends"
                  </p>
                </div>
                <span>Groups</span>
              </div>
            </div>
          ))}
      </>
  )
}

export default SidebarAllGroups