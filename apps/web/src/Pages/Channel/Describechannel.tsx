import React from "react";
import "./Describechannel.css";
import { FaEdit, FaUpload } from "react-icons/fa";
import { MdFileDownload } from "react-icons/md";
import { useAppSelector } from "../../store";
import { useChannelById } from "../../query/hooks";

const Describechannel = ({
  setvideouploadpage,
  cid,
  seteditcreatechanelbtn,
}: {
  setvideouploadpage: (v: boolean) => void;
  cid: string | undefined;
  seteditcreatechanelbtn: (v: boolean) => void;
}) => {
  const currentchannel = useChannelById(cid);
  const currentuser = useAppSelector((s) => s.auth.session);

  return (
    <div className="container3_chanel">
      <div className="reputation_cont">
        <div className="download">
          <MdFileDownload />{" "}
          <span>{currentuser?.result?.downloadsToday || "0"}</span>
        </div>
        <div className="credit">
          <div>
            Points: <span>{currentuser?.result?.reputation}</span>
          </div>
          <button className="premium">
            Premium:{" "}
            <span>{`${
              currentuser?.result?.isPremium ? "active" : "Buy $"
            }`}</span>
          </button>
        </div>
      </div>

      <div className="channel_details">
        <div className="chanel_logo_chanel">
          <b>{currentchannel?.name?.charAt(0).toUpperCase()}</b>
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
