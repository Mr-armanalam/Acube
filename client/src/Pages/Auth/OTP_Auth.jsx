import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {useNavigate} from "react-router-dom"

import "./OTP_Auth.css";
import { sendOTP, verifyOTP } from "../../action/auth";

const OTP_Auth = () => {
  const navigate = useNavigate();
  const sentotpStatus = useSelector(state => state.authOTPreducer);
  const verifyOTPStatus = useSelector(state => state.authOtpverifierReducer);
  const dispatch = useDispatch();
  const currentUser = useSelector((state) => state.currentuserreducer)?.result
    ?.email;

  const [status, setStatus] = useState();
  const [state, setState] = useState({
    email: "",
    otp: "",
    number: "",
  });

  const handleOnChange = (event) => {
    const { name, value } = event.target;
    setState((prevProps) => ({ ...prevProps, [name]: value }));
  };

  const handleOnSubmit = ( e ) => {
    e.preventDefault();

    if (state.otp === ""){
      if ( state.number !== "" && state.number.length === 12) {
        dispatch(sendOTP({phone: state.number}));
      }else if (state.number === '') {
        dispatch(sendOTP({email: state.email || currentUser}));
      }
    } else if (state.otp?.length >= 0) {      
      dispatch(verifyOTP({
        otp: state.otp,
        phone: (state.number !== '' && state.number.length === 12) ? state.number : null,
        email: state.number !== '' ? null :( state.email || currentUser),
      }))
    }
  }

  useEffect(() => {    
    if (status === 200) {
      navigate("/");
    }else{
      setStatus(verifyOTPStatus.status)
    }
  },[verifyOTPStatus,status, navigate]);

  return (
    <section className="otp_auth_container">
      <div className="otp_auth_container_box">

        <div className="auth_title_section">
          <h1>Authenticate using email or number</h1>
          <p>Write your country code with your number</p>
          <button type="button" onClick={()=> setStatus(200)}>Skip</button>
        </div>

        <form onSubmit={handleOnSubmit} className="otp_auth_frm">
          <input
            type="email"
            name="email"
            disabled={!currentUser && true}
            onChange={handleOnChange}
            value={state.email || currentUser}
            placeholder="jongo@gmail.com"
          />
          <label htmlFor="number">-OR-</label>
          <input
            type="number"
            name="number"
            id="number"
            value={state.number}
            onChange={handleOnChange}
            placeholder="919567123074"
          />
          {sentotpStatus?.status === 200 && <input
            type="text"
            name="otp"
            onChange={handleOnChange}
            value={state.otp}
            placeholder="Otp"
          />}
          <div className="submit_box_btn">
            {verifyOTPStatus?.status === 400 && <small>password invalid</small>}
          <button type="submit">Next</button>
          </div>
        </form>
        <div className="auth_terms">{sessionStorage.isSouthIndia}</div>
      </div>
    </section>
  );
};

export default OTP_Auth;
