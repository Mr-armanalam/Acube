import React, { useContext } from "react";
import { ThemeContext } from "../../context/ThemeProvider";
import { themedata } from "../../utils/deta";
import type { ThemeMode } from "../../store/slices/themeSlice";

const ThemeBox = () => {
  const { setMode } = useContext(ThemeContext);

  const handlethemeSelect = (theme: ThemeMode) => {
    // Persistence is handled by the store subscriber (theme slice).
    setMode(theme);
  };

  return (
    <div className="theme_box">
      {themedata?.map((item, index) => (
        <div
          key={index}
          className={`theme_item ${
            localStorage.getItem("theme") === item.value && "item_active"
          }`}
          onClick={() => handlethemeSelect(item.value as ThemeMode)}
        >
          {item.icon} {item.title}
        </div>
      ))}
    </div>
  );
};

export default ThemeBox;
