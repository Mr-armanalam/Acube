import React from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./Pages/Home/Home";
import Search from "./Pages/Search/Search";
import Videopage from "./Pages/Videopage/Videopage";
import Channel from "./Pages/Channel/Channel";
import Library from "./Pages/Library/Library";
import Likedvideo from "./Pages/Likedvideo/Likedvideo";
import Watchhistory from "./Pages/Watchhistory/Watchhistory";
import Watchlater from "./Pages/Watchlater/Watchlater";
import Yourvideo from "./Pages/Yourvideo/Yourvideo";
import Chat from "./Pages/chat/Chat";
import { useInternetStatus } from "./utils/internetStatusContext";
import StreamRoom from "./Pages/videostream/StreamRoom";
import OtpAuth from "./Pages/Auth/OTP_Auth";

const Allroutes = ({ seteditcreatechanelbtn, setvideouploadpage }) => {
  const isOnline = useInternetStatus();
  return (
    <>
      {isOnline ? (
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search/:Searchquery" element={<Search />} />
          <Route path="/videopage/:vid" element={<Videopage />} />
          <Route path="/Library" element={<Library />} />
          <Route path="/Likedvideo" element={<Likedvideo />} />
          <Route path="/Watchhistory" element={<Watchhistory />} />
          <Route path="/Watchlater" element={<Watchlater />} />
          <Route path="/Yourvideo" element={<Yourvideo />} />
          <Route
            path="/channel/:cid"
            element={
              <Channel
                seteditcreatechanelbtn={seteditcreatechanelbtn}
                setvideouploadpage={setvideouploadpage}
              />
            }
          />
          <Route path="/chat" element={<Chat />} />
          <Route path="/video-stream/:encryptId" element={<StreamRoom />} />
          <Route path="/auth-verifier/:user" element={<OtpAuth/>} />
        </Routes>
      ) : (
        <div
          style={{
            color: "red",
            backgroundColor: "var(--body_forground)",
            height: "100vh",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontSize: "24px",
            fontWeight: "bold",
          }}
        >
          Please check your internet connection.
        </div>
      )}
    </>
  );
};

export default Allroutes;
