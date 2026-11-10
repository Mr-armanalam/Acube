import React from 'react'
import "./Leftsidebar.css"
import shorts from "./shorts.png"
import {AiOutlineHome} from "react-icons/ai"
import {MdOutlineExplore, MdOutlineSubscriptions, MdOutlineVideoLibrary} from "react-icons/md"
import { NavLink } from "react-router"
import { PiChatDotsBold } from "react-icons/pi";
import { useAppSelector } from "../../store";

const Leftsidebar = () => {
  // Phase 5: Studio is a creator surface — only shown when signed in.
  const session = useAppSelector((s) => s.auth.session);
  return (
    <div className="container_leftSidebar">
        <NavLink to={'/'} className="icon_sidebar_div">
            <AiOutlineHome size={22} className='icon_sidebar'/>
            <p className="text_sidebar_icon">Home</p>
        </NavLink>
        <div className="icon_sidebar_div">
            <MdOutlineExplore size={22} className='icon_sidebar'/>
            <p className="text_sidebar_icon">Explore</p>
        </div>
        <div className="icon_sidebar_div">
            <img src={shorts} width={22} alt='short' className='icon_sidebar'/>
            <p className="text_sidebar_icon">Shorts</p>
        </div>
        <div className="icon_sidebar_div">
            <MdOutlineSubscriptions size={22} className='icon_sidebar'/>
            <p className="text_sidebar_icon" style={{fontSize:"12px"}}>Subscription</p>
        </div>
        <NavLink to={'/library'} className="icon_sidebar_div">
            <MdOutlineVideoLibrary size={22} className='icon_sidebar'/>
            <p className="text_sidebar_icon">Library</p>
        </NavLink>
        {session ? (
          <NavLink to={'/studio'} className="icon_sidebar_div">
              <MdOutlineVideoLibrary size={22} className='icon_sidebar'/>
              <p className="text_sidebar_icon">Studio</p>
          </NavLink>
        ) : null}
        <NavLink to={'/chat'} className="icon_sidebar_div">
            <PiChatDotsBold size={22} className='icon_sidebar'/>
            <p className="text_sidebar_icon">Chat</p>
        </NavLink>
    </div>
  )
}

export default Leftsidebar