import React from "react";
import { BiLogOut } from "react-icons/bi";
import { Link } from "react-router";
import { googleLogout } from "@react-oauth/google";
import "./Auth.css";
import { useAppDispatch } from "../../store";
import { logoutThunk } from "../../store/slices/authSlice";
import type { SessionProfile } from "../../types";

const Auth = ({
  user,
  setauthbtn,
  seteditcreatechanelbtn,
}: {
  user: SessionProfile | null;
  setauthbtn: (v: boolean) => void;
  seteditcreatechanelbtn: (v: boolean) => void;
}) => {
  const dispatch = useAppDispatch();
  const logout = () => {
    void dispatch(logoutThunk());
    // As before, signing out clears all local storage.
    localStorage.clear();
    googleLogout();
  };

  return (
    <div className="Auth_container" onClick={() => setauthbtn(false)}>
      <div className="Auth_container2">
        <div className="User_Details">
          <div className="Chanel_logo_App">
            <p className="fstChar_logo_App">
              {user?.result.name ? (
                <>{user?.result.name.charAt(0).toUpperCase()}</>
              ) : (
                <>{user?.result.email?.charAt(0).toUpperCase()}</>
              )}
            </p>
          </div>
          <div className="email_Auth">{user?.result.username}</div>
        </div>
        <div className="btns_Auth">
          {user?.result.name ? (
            <>
              {
                <Link
                  to={`/channel/${user?.result?._id}`}
                  className="btn_Auth"
                >
                  Your Channel
                </Link>
              }
            </>
          ) : (
            <>
              <input
                type="submit"
                className="btn_Auth"
                value="Create Your Own Channel"
                onClick={() => seteditcreatechanelbtn(true)}
              />
            </>
          )}
          <div>
            <div className="btn_Auth" onClick={() => logout()}>
              <BiLogOut />
              Log Out
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
