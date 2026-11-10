import "./App.css";
import React, { useState } from "react";
import Navbar from "./Component/Navbar/Navbar";
import Allroutes from "../src/Allroutes";
import { BrowserRouter as Router } from "react-router";
import Drawersliderbar from "../src/Component/Leftsidebar/Drawersliderbar";
import Createeditchannel from "./Pages/Channel/Createeditchannel";
import Videoupload from "./Pages/Videoupload/Videoupload";
import { RoomProvider } from "./context/RoomContext";

// Phase 2b: the old App ran one useEffect that dispatched every legacy
// thunk (channels, videos, comments, history, liked, watch-later, chat
// users) on every current-user change — the refetch-everything pattern.
// Each page now fetches its own server state through TanStack Query, so
// App is only the shell: navbar, drawer, modals, routes.
function App() {
  const [toggledrawersidebar, settogledrawersidebar] = useState({
    display: "none",
  });

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
