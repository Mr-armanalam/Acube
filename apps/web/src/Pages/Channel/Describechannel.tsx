import React, { useState } from "react";
import "./Describechannel.css";
import { FaEdit, FaUpload } from "react-icons/fa";
import { MdFileDownload } from "react-icons/md";
import { Link } from "react-router";
import { useAppSelector } from "../../store";
import { useChannelById } from "../../query/hooks";
import { resolveApiMediaUrl } from "../../Api";

const Describechannel = ({
  cid,
  seteditcreatechanelbtn,
}: {
  cid: string | undefined;
  seteditcreatechanelbtn: (v: boolean) => void;
}) => {
  const currentchannel = useChannelById(cid);
  const currentuser = useAppSelector((s) => s.auth.session);
  // Settings polish fix: the channel header used to render only the
  // first-letter initial — the uploaded avatar (preferred, falling
  // back to the Google login photo) and banner never reached it.
  // A failed avatar falls back to the initial; a missing banner
  // falls back to the gradient.
  const avatarUrl = resolveApiMediaUrl(
    currentchannel?.avatarUrl ?? currentchannel?.picture,
  );
  const bannerUrl = resolveApiMediaUrl(currentchannel?.bannerUrl);
  const [avatarBroken, setAvatarBroken] = useState(false);

  return (
    <>
    {bannerUrl ? (
      <div
        className="channel_banner"
        style={{ backgroundImage: `url("${bannerUrl}")` }}
        role="img"
        aria-label="Channel banner"
      />
    ) : (
      <div
        className="channel_banner channel_banner--gradient"
        role="img"
        aria-label="Channel banner"
      />
    )}
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
          {avatarUrl && !avatarBroken ? (
            <img
              src={avatarUrl}
              alt=""
              onError={() => setAvatarBroken(true)}
            />
          ) : (
            <b>{currentchannel?.name?.charAt(0).toUpperCase()}</b>
          )}
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
          <Link to="/studio/upload" className="uploadbtn_chanel">
            <FaUpload />
            <b>Upload Video</b>
          </Link>
        </div>
      )}
    </div>
    </>
  );
};

export default Describechannel;
