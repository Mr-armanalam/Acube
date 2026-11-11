import "./App.css";
import React, { useState } from "react";
import TopBar from "./Component/TopBar/TopBar";
import Allroutes from "../src/Allroutes";
import { BrowserRouter as Router, useLocation } from "react-router";
import Createeditchannel from "./Pages/Channel/Createeditchannel";
import { RoomProvider } from "./context/RoomContext";

// Phase 2b: the old App ran one useEffect that dispatched every legacy
// thunk (channels, videos, comments, history, liked, watch-later, chat
// users) on every current-user change — the refetch-everything pattern.
// Each page now fetches its own server state through TanStack Query, so
// App is only the shell: top bar, modals, routes.
//
// Phase 5 match-preview (follow-up): the legacy Your-Tube Navbar +
// drawer are DELETED. /studio/* routes render the Studio's own shell
// (Studio.tsx) with no top bar at all; every other route renders the
// new premium TopBar in the same design language. The old Videoupload
// modal is deleted too — uploads live at /studio/upload.
export function AppShell() {
  const location = useLocation();
  const isStudio = location.pathname === "/studio" || location.pathname.startsWith("/studio/");
  const [editcreatechanelbtn, seteditcreatechanelbtn] = useState(false);
  return (
    <RoomProvider>
      {editcreatechanelbtn && (
        <Createeditchannel seteditcreatechanelbtn={seteditcreatechanelbtn} />
      )}
      {!isStudio ? (
        <TopBar seteditcreatechanelbtn={seteditcreatechanelbtn} />
      ) : null}
      <Allroutes seteditcreatechanelbtn={seteditcreatechanelbtn} />
    </RoomProvider>
  );
}

function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  );
}

export default App;
