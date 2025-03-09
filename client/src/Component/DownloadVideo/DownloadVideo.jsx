import React, { useState, useEffect, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  checkPremiumStatus,
  createPaymentRequest,
  downloadVideo,
  getDownloads,
} from "../../action/downloadVideo.action";
import { IoMdDownload } from "react-icons/io";
import { RiMoneyRupeeCircleLine } from "react-icons/ri";

const DownloadVideo = ({ video }) => {
  const user = useSelector((state) => state.currentuserreducer);

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloads, setDownloads] = useState([]);
  const [isPremium, setIsPremium] = useState(false);
  const dispatch = useDispatch();

  useEffect(() => {
    const fetchPremiumStatus = async () => {
      const status = await dispatch(checkPremiumStatus());
      setIsPremium(status);
    };
    fetchPremiumStatus();

    const fetchDownloads = async () => {
      const userDownloads = await dispatch(getDownloads());
      setDownloads(userDownloads);
    };
    fetchDownloads();
  }, [user, dispatch]);

  const handleDownload = useCallback(async () => {
    if (user === null || undefined) {
      alert("Please login to download videos");
      return;
    }

    setIsDownloading(true);
    const response = await dispatch(downloadVideo());
    if (response.success) {
      alert("Video downloaded successfully!");
      setDownloads([...downloads, response.video]);
    } else {
      alert(response.message);
    }
    setIsDownloading(false);
  }, [dispatch, setIsDownloading,user, setDownloads, downloads]);


  const handleUpgradeToPremium = useCallback(async () => {
    try {
      if (user === null || undefined) {        
        alert("Please login to upgrade your account to premium");
        return;
      }
      const paymentData = {
        amount: 1000,
        _id: user.result._id,
        emailId: user.result.email,
        purpose: "Upgrade to Premium",
      };
      const response = await dispatch(createPaymentRequest(paymentData));

      if (response.success) {
        setIsPremium(true);
        const longurl = response.payment_request;
        window.location.href = longurl;
      } else {
        alert(response.message);
      }
    } catch (error) {
      console.error("Error creating payment request:", error);
      alert("Error creating payment request");
    }
  }, [dispatch, user]);
  

  return (
    <>
      <a
        href={video}
        download
        className={`btn_VideoPage download ${
          ((!isPremium && downloads.length >= 1) || !user) && "ishidden"
        } `}
        onClick={handleDownload}
        disabled={isDownloading || (!isPremium && downloads.length >= 1)}
      >
        <IoMdDownload size={22} className="btns_videoPage" />
      </a>
      {!isPremium && (
        <button
          className="btn_VideoPage download"
          onClick={handleUpgradeToPremium}
        >
          <RiMoneyRupeeCircleLine size={22} className="btns_videoPage" />
          <b>Upgrade</b>
        </button>
      )}
    </>
  );
};

export default DownloadVideo;
