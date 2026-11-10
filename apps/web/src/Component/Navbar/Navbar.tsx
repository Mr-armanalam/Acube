import React, { useState, useEffect, useCallback } from "react";
import logo from "./logo.ico";
import "./Navbar.css";
import { Link } from "react-router";
import { RiVideoAddLine } from "react-icons/ri";
import { IoMdNotificationsOutline } from "react-icons/io";
import Searchbar from "./Searchbar/Searchbar";
import Auth from "../../Pages/Auth/Auth";
import { GoogleLogin, googleLogout, type CredentialResponse } from "@react-oauth/google";
import { useAppDispatch, useAppSelector } from "../../store";
import { loginThunk, logoutThunk } from "../../store/slices/authSlice";
import { IoSunny } from "react-icons/io5";
import { IoIosMoon } from "react-icons/io";
import { jwtDecode } from "jwt-decode";
import ThemeBox from "./ThemeBox";

// Phase 3a: Google sign-in now uses the <GoogleLogin> credential flow,
// whose onSuccess carries the real Google ID token (credential). That
// token — never a client-claimed email — is sent to POST /user/login,
// where the server verifies it against GOOGLE_CLIENT_ID. The old
// useGoogleLogin implicit flow returned only an access_token, and the
// Navbar then fetched the profile from Google and trusted it client-side;
// both are gone, as is the OTP-verifier detour that flow ended in.

const Navbar = ({
  toggledrawer,
  seteditcreatechanelbtn,
}: {
  toggledrawer: () => void;
  seteditcreatechanelbtn: (v: boolean) => void;
}) => {
  const [themeClick, setThemeClick] = useState(false);
  const [authbtn, setauthbtn] = useState(false);
  const [isLoading, setisLoading] = useState(false);
  const dispatch = useAppDispatch();

  const currentuser = useAppSelector((s) => s.auth.session);
  const themeMode = useAppSelector((s) => s.theme.mode);

  const handleGoogleSuccess = useCallback(
    (credentialResponse: CredentialResponse) => {
      const idToken = credentialResponse.credential;
      if (!idToken) {
        console.error("Google sign-in returned no ID token");
        return;
      }
      setisLoading(true);
      void dispatch(loginThunk({ idToken }))
        .unwrap()
        .then(() => setisLoading(false))
        .catch(() => setisLoading(false));
    },
    [dispatch],
  );

  const handleGoogleError = useCallback(() => {
    console.log("Login Failed");
  }, []);

  const logout = useCallback(() => {
    void dispatch(logoutThunk());
    googleLogout();
    localStorage.clear();
  }, [dispatch]);

  // Phase 2b: the old effect re-dispatched setcurrentuser from localStorage
  // on EVERY token change (a Navbar useEffect loop). The session is now
  // hydrated once at store bootstrap; this only checks expiry once.
  useEffect(() => {
    const token = currentuser?.token;
    if (token) {
      const decodetoken = jwtDecode(token) as { exp?: number };
      if (
        decodetoken.exp !== undefined &&
        decodetoken.exp * 1000 < new Date().getTime()
      ) {
        logout();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <div className="Container_Navbar">
        {isLoading && (
          <div className="isLding">
            <p>Loading...</p>
          </div>
        )}
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

        <div
          className="themeContainer"
          onClick={() => setThemeClick(!themeClick)}
        >
          {!(themeMode === "light") ? (
            <IoSunny size={22} className="vid_bell_Navbar" />
          ) : (
            <IoIosMoon size={22} className="vid_bell_Navbar" />
          )}
          {themeClick && <ThemeBox />}
        </div>

        <RiVideoAddLine size={22} className="vid_bell_Navbar" />

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
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
              />
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
};

export default Navbar;
