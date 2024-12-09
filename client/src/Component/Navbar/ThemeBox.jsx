import React, { useContext } from 'react'
import { ThemeContext } from '../../context/ThemeProvider';
import { themedata } from '../../utils/deta';

const ThemeBox = () => {
  const { setMode } = useContext(ThemeContext);

  const handlethemeSelect = (theme) => {
    setMode(theme);
    localStorage.setItem('theme', theme);
  }

  return (
    <div className='theme_box'>
      {themedata?.map((item, index) => (
        <div key={index} className={`theme_item ${((localStorage.getItem('theme') === item.value)) && "item_active"}`} onClick={() => handlethemeSelect(item.value)}>
          {item.icon} {item.title}
        </div>
      ))}
    </div>
  )
}

export default ThemeBox