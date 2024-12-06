import React, { useState, useEffect, useCallback, useContext } from 'react'
import logo from "./logo.ico"
import "./Navbar.css"
import { useDispatch, useSelector } from 'react-redux'
import { Link } from "react-router-dom"
import { RiVideoAddLine } from "react-icons/ri"
import { IoMdNotificationsOutline } from "react-icons/io"
import { BiUserCircle } from "react-icons/bi"
import Searchbar from './Searchbar/Searchbar'
import Auth from '../../Pages/Auth/Auth'
import axios from "axios"
import { login } from "../../action/auth"
import { useGoogleLogin,googleLogout } from '@react-oauth/google';
import { setcurrentuser } from '../../action/currentuser';
import { IoSunny } from "react-icons/io5";
import { IoIosMoon } from "react-icons/io";


import {jwtDecode} from "jwt-decode"
import { ThemeContext } from '../../context/ThemeProvider'
import ThemeBox from './ThemeBox'
const Navbar = ({ toggledrawer, seteditcreatechanelbtn }) => {
    const { mode } = useContext(ThemeContext);
    const [themeClick, setThemeClick] = useState(false);
    const [authbtn, setauthbtn] = useState(false)
    const [user, setuser] = useState(null)
    const [profile, setprofile] = useState([])
    const dispatch = useDispatch()
   
    const currentuser = useSelector(state => state.currentuserreducer);
      
    const successlogin = useCallback(() => {
        if (profile.email) {
            dispatch(login({
               email: profile.email ,
               username: profile.name,
               picture: profile.picture
              }))
            // console.log(profile.email)
        }
    },[dispatch,profile])

    // console.log(currentuser?.token)
    // const currentuser={
    //     result:{
    //         _id:1,
    //         name:"abcjabsc",
    //         email:"abcd@gmail.com",
    //         joinedon:"222-07-134"
    //     }
    // }

    const google_login = useGoogleLogin({
        onSuccess: tokenResponse => setuser(tokenResponse),     
        onError: (error) => console.log("Login Failed", error)
    });

    useEffect(
        () => {
            if (user) {
                axios.get(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${user.access_token}`, {
                    headers: {
                        Authorization: `Bearer ${user.access_token}`,
                        Accept: 'application/json'
                    }
                })
                    .then((res) => {
                        setprofile(res.data)
                        successlogin()
                        // console.log(res.data)
                    })

            }
        },
        [user, successlogin]
    );
    const logout=useCallback(()=>{
        dispatch(setcurrentuser(null))
        googleLogout()
        localStorage.clear()
    },[dispatch])

    useEffect(()=>{
        const token=currentuser?.token;
        if(token){
            const decodetoken=jwtDecode(token)
            if(decodetoken.exp *1000 <new Date().getTime()){
                logout()
            }
        }
        dispatch(setcurrentuser(JSON.parse(localStorage.getItem("Profile"))))
  },[currentuser?.token,dispatch, logout]
)
    return (
      <>
        <div className="Container_Navbar">
          <div className="Burger_Logo_Navbar">
            <div className="burger" onClick={() => toggledrawer()}>
              <p></p>
              <p></p>
              <p></p>
            </div>
            <Link to={"/"} className="logo_div_Navbar">
              <img src={logo} className="logo-size" alt="logo" />
              <p className="logo_title_navbar">Your-Tube</p>
            </Link>
          </div>
          <Searchbar />

          <div className='themeContainer' onClick={() => setThemeClick(!themeClick)}>
            {(mode === "auto" || mode === "dark") ? 
              <IoIosMoon size={22} className='vid_bell_Navbar'/>:
              <IoSunny size={22} className='vid_bell_Navbar'/> 
            }
           {themeClick && <ThemeBox/>}
          </div>

          <RiVideoAddLine size={22} className="vid_bell_Navbar" />
          <div className="apps_Box">
            <p className="appBox"></p>
            <p className="appBox"></p>
            <p className="appBox"></p>
            <p className="appBox"></p>
            <p className="appBox"></p>
            <p className="appBox"></p>
            <p className="appBox"></p>
            <p className="appBox"></p>
            <p className="appBox"></p>
          </div>

          <IoMdNotificationsOutline size={22} className="vid_bell_Navbar" />
          <div className="Auth_cont_Navbar">
            {currentuser ? (
              <>
                <div
                  className="Chanel_logo_App"
                  onClick={() => setauthbtn(true)}
                >
                  <p className="fstChar_logo_App">
                    {currentuser?.result.name ? (
                      <>{currentuser?.result.name.charAt(0).toUpperCase()}</>
                    ) : (
                      <>{currentuser?.result.email.charAt(0).toUpperCase()}</>
                    )}
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="Auth_Btn" onClick={() => google_login()}>
                  <BiUserCircle className={"at_small_size"} />
                  <b className="display_none">Sign in</b>
                </p>
              </>
            )}
          </div>
        </div>
        {authbtn && (
          <Auth
            seteditcreatechanelbtn={seteditcreatechanelbtn}
            setauthbtn={setauthbtn}
            user={currentuser}
          />
        )}
      </>
    );
}

export default Navbar


