import * as api from "../Api";
import { setcurrentuser } from "./currentuser";
export const login=(authdata)=>async(dispatch)=>{
    try {
        const {data}=await api.login(authdata);
        dispatch({type:"AUTH",data})
        dispatch(setcurrentuser(JSON.parse(localStorage.getItem('Profile'))))
    } catch (error) {
        alert("Failed to login: " + error.message)
    }
}

export const sendOTP = (authdata)=>async(dispatch)=>{
    try {
        const result = await api.sendOtp(authdata);
        console.log(result?.data + result.status);
        dispatch({type:"SENDOTP",result})
    } catch (error) {
        alert("Failed to send OTP: " + error.message)
    }
}

export const verifyOTP = (authdata)=>async(dispatch)=>{
    try {
       const result = await api.verifyOtp(authdata);
       console.log(result?.data + result.status);
        dispatch({type:"VERIFYOTP",result})
    } catch (error) {
        const result = {data: "Invalid OTP", status: error.status || 400};
        dispatch({type:"VERIFYOTP",result});
    }
}