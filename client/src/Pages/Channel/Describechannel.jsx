import React from "react";
import "./Describechannel.css";
import { FaEdit, FaUpload } from "react-icons/fa";
import { useSelector } from "react-redux";
import { MdFileDownload } from "react-icons/md";

const Describechannel = ({
  setvideouploadpage,
  cid,
  seteditcreatechanelbtn,
}) => {
  const channel = useSelector((state) => state.chanelreducer);

  const currentchannel = channel.filter((c) => c._id === cid)[0];
  const currentuser = useSelector((state) => state.currentuserreducer);
  // console.log(currentuser);

  return (
    <div className="container3_chanel">
      <div className="reputation_cont">
        <div className="download">
        <MdFileDownload/> <span>{currentuser?.rsult?.downloadsToday || "0"}</span>
        </div>
        <div className="credit">
        <div>Points: {" "} <span>{currentuser?.result?.reputation}</span></div>
        <button className="premium">Premium:  <span>Buy $</span></button>
        </div>
      </div>

      <div className="channel_details">
        <div className="chanel_logo_chanel">
          <b>{currentchannel?.name.charAt(0).toUpperCase()}</b>
        </div>
        <div className="description_chanel">
          <b>{currentchannel?.name}</b>
          <p>{currentchannel?.desc}</p>
        </div>
      </div>
      {currentuser?.result._id === currentchannel?._id && (
        <div className="edit_crete_cont">
          <p
            className="editbtn_chanel"
            onClick={() => seteditcreatechanelbtn(true)}
          >
            <FaEdit />
            <b>Edit Channel</b>
          </p>
          <p
            className="uploadbtn_chanel"
            onClick={() => setvideouploadpage(true)}
          >
            <FaUpload />
            <b>Upload Video</b>
          </p>
        </div>
      )}
    </div>
  );
};

export default Describechannel;

// const channel=[
//   {
//       _id:1,
//       name:"abcjabsc",
//       email:"abcd@gmail.com",
//       joinedon:"222-07-134",
//       desc:"bithead"
//   }
// ]
