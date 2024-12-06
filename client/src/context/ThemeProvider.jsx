import React, { createContext, useEffect, useState } from "react";
import { getCurrentTime, getUserLocation } from "../utils/getUserLocation_time";

export const ThemeContext = createContext(null);
const ThemeProvider = ({ children }) => {
  const [mode, setMode] = useState("auto");

  async function handleThemeChange() {

    const location = await getUserLocation();
    const hours = getCurrentTime();    
    const southIndiaStates = [ "Tamil Nadu", "Kerala", "Karnataka", "Andhra Pradesh", "Telangana" ];
    let isSouthIndia = southIndiaStates.includes(location.region);

    if (!(localStorage.theme === "light" || localStorage.theme === "dark")) {  
      if (isSouthIndia && hours >= 10 && hours <= 12) {        
        document.body.classList.add("white-theme");
      } else {        
        document.body.classList.remove("white-theme");
      }
    } else if (localStorage.theme === "light") {      
      document.body.classList.add("white-theme");
    } else if (localStorage.theme === "dark") {      
      document.body.classList.remove("white-theme");
    } else if (localStorage.theme === "auto") { 
      document.body.classList.remove("white-theme");
    }
  }

  useEffect(() => {
    handleThemeChange();
  }, [mode]);

  return (
    <ThemeContext.Provider value={{mode, setMode}}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;
