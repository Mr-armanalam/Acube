import "./App.css";
import React, { useEffect, useState } from "react";
import Navbar from "./Component/Navbar/Navbar";
import { useDispatch, useSelector } from "react-redux";
import Allroutes from "../src/Allroutes";
import { BrowserRouter as Router } from "react-router-dom";
import Drawersliderbar from "../src/Component/Leftsidebar/Drawersliderbar";
import Createeditchannel from "./Pages/Channel/Createeditchannel";
import Videoupload from "./Pages/Videoupload/Videoupload";
import { fetchallchannel } from "./action/channeluser";
import { getallvideo } from "./action/video";
import { getallcomment } from "./action/comment";
import { getallhistory } from "./action/history";
import { getalllikedvideo } from "./action/likedvideo";
import { getallwatchlater } from "./action/watchlater";
import { get_all_chat_user } from "./action/get_all_chat_user";
import { RoomProvider } from "./context/RoomContext";

function App() {
  const [toggledrawersidebar, settogledrawersidebar] = useState({
    display: "none",
  });
  const dispatch = useDispatch();
  const currentUser = useSelector((state) => state.currentuserreducer);

  useEffect(() => {
    dispatch(fetchallchannel());
    dispatch(getallvideo());
    dispatch(getallcomment());
    if (currentUser?.result._id) {
      dispatch(getallhistory());
      dispatch(getalllikedvideo());
      dispatch(getallwatchlater());
      dispatch(get_all_chat_user());
    }
  }, [dispatch, currentUser]);

  const toggledrawer = () => {
    if (toggledrawersidebar.display === "none") {
      settogledrawersidebar({
        display: "flex",
      });
    } else {
      settogledrawersidebar({
        display: "none",
      });
    }
  };
  const [editcreatechanelbtn, seteditcreatechanelbtn] = useState(false);
  const [videouploadpage, setvideouploadpage] = useState(false);
  return (
    <Router>
      <RoomProvider>
        {videouploadpage && (
          <Videoupload setvideouploadpage={setvideouploadpage} />
        )}
        {editcreatechanelbtn && (
          <Createeditchannel seteditcreatechanelbtn={seteditcreatechanelbtn} />
        )}
        <Navbar
          seteditcreatechanelbtn={seteditcreatechanelbtn}
          toggledrawer={toggledrawer}
        />
        <Drawersliderbar
          toggledraw={toggledrawer}
          toggledrawersidebar={toggledrawersidebar}
        />
        <Allroutes
          seteditcreatechanelbtn={seteditcreatechanelbtn}
          setvideouploadpage={setvideouploadpage}
        />
      </RoomProvider>
    </Router>
  );
}

export default App;
