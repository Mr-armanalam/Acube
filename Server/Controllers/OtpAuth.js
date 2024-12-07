import { generateOTP, sendOTPEmail, sendOTPSMS } from '../utils/utility_func.js';

let otpStore = {};

export const SendOtp = (req, res) => {
  const { email, phone } = req.body;
  const otp = generateOTP();
  
  otpStore[email || phone] = otp;

 try {
   if (email) {
     sendOTPEmail(email, otp);
   } else if (phone) {
     sendOTPSMS(phone, otp);  
   }   
   res.status(200).send('OTP sent');
 } catch (error) {  
  console.error(error.message);
  res.status(500).send('Error sending OTP');
 }
   
};

export const VerifyOtp = (req, res) => {
  const { email, phone, otp } = req.body;
  const storedOTP = otpStore[email || phone];

  if (otp === storedOTP) {
    delete otpStore[email || phone];
    res.send('OTP verified');
  } else {
    res.status(400).send('Invalid OTP');
  }
};


