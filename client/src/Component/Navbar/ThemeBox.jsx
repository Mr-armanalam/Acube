import React, { useContext } from 'react'
import { ThemeContext } from '../../context/ThemeProvider';
import { themedata } from '../../utils/deta';

const ThemeBox = () => {
  const { mode, setMode } = useContext(ThemeContext);

  const handlethemeSelect = (theme) => {
    setMode(theme);
    localStorage.setItem('theme', theme);
  }

  return (
    <div className='theme_box'>
      {/* <div className={`theme_item ${(mode === "light" ) && "item_active"}`}><IoSunny/>Light</div>
      <div className={`theme_item ${(mode === "dark" ) && "item_active"}`}><IoIosMoon/>Dark</div>
      <div className={`theme_item ${(mode === "auto" ) && "item_active"}`}>Default</div> */}
      {themedata?.map((item, index) => (
        <div key={index} className={`theme_item ${((localStorage.getItem('theme') === item.value)) && "item_active"}`} onClick={() => handlethemeSelect(item.value)}>
          {item.icon} {item.title}
        </div>
      ))}
    </div>
  )
}

export default ThemeBox