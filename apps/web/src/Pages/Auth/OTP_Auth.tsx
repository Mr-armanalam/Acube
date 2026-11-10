import React, { useCallback, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../store";
import { useNavigate, useParams } from "react-router";

import "./OTP_Auth.css";
import {
  loginThunk,
  sendOtpThunk,
  verifyOtpThunk,
} from "../../store/slices/authSlice";
import { decryptData2 } from "../../utils/toEncrypt";

// Phase 2c: the "Skip" bypass is removed — auth completes ONLY after the
// server verifies an OTP (verifyOTPStatus.status === 200). There is no
// client-side shortcut to a signed-in state.
const OTP_Auth = () => {
  const navigate = useNavigate();
  const { user } = useParams();
  let data: { email?: string; name?: string; picture?: string } = {};

  const handleUnauthorized = useCallback(() => {
    navigate("/");
    alert("Something went wrong ");
  }, [navigate]);

  try {
    data = decryptData2(user);
  } catch (error) {
    console.log((error as Error).message);
  }

  const sentotpStatus = useAppSelector((s) => s.auth.otpSend);
  const verifyOTPStatus = useAppSelector((s) => s.auth.otpVerify);
  const dispatch = useAppDispatch();
  const currentUser = data.email;

  const [state, setState] = useState({
    email: "",
    otp: "",
    number: "",
  });

  const handleOnChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setState((prevProps) => ({ ...prevProps, [name]: value }));
  };

  const handleOnSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (state.otp === "") {
      if (state.number !== "" && state.number.length === 12) {
        void dispatch(sendOtpThunk({ phone: state.number }));
      } else if (state.number === "") {
        void dispatch(sendOtpThunk({ email: state.email || currentUser }));
      }
    } else if (state.otp?.length >= 0) {
      void dispatch(
        verifyOtpThunk({
          otp: state.otp,
          phone:
            state.number !== "" && state.number.length === 12
              ? state.number
              : null,
          email:
            state.number !== ""
              ? null
              : state.email || currentUser,
        }),
      );
    }
  };

  useEffect(() => {
    if (verifyOTPStatus.status === 200) {
      navigate("/");
      // Phase 3a: the server consumes the verified-OTP record on this
      // login (single-use) — a second login with the same email 401s.
      void dispatch(
        loginThunk({
          email: data.email ?? "",
          username: data.name,
          picture: data.picture,
        }),
      );
    }
  }, [verifyOTPStatus, user, data.email, data.name, data.picture, dispatch, navigate]);

  useEffect(() => {
    if (!data.email) {
      handleUnauthorized();
    }
  }, [handleUnauthorized, data.email]);

  return (
    <section className="otp_auth_container">
      <div className="otp_auth_container_box">
        <div className="auth_title_section">
          <h1>Authenticate using email or number</h1>
          <p>Write your country code with your number</p>
        </div>

        <form onSubmit={handleOnSubmit} className="otp_auth_frm">
          <input
            type="email"
            name="email"
            disabled={currentUser ? true : false}
            onChange={handleOnChange}
            value={state.email || currentUser || ""}
            placeholder="jongo@gmail.com"
          />
          <label htmlFor="number">-OR-</label>
          <input
            type="number"
            name="number"
            id="number"
            value={state.number}
            onChange={handleOnChange}
            placeholder="+91 9567123074"
          />
          {sentotpStatus?.status === 200 && (
            <input
              type="text"
              name="otp"
              onChange={handleOnChange}
              value={state.otp}
              placeholder="Otp"
            />
          )}
          <div className="submit_box_btn">
            {verifyOTPStatus?.status === 400 && <small>password invalid</small>}
            <button type="submit">Next</button>
          </div>
        </form>
      </div>
    </section>
  );
};

export default OTP_Auth;
