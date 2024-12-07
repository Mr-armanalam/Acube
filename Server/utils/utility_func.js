import twilio from 'twilio'; 
import nodemailer from 'nodemailer';

export function generateOTP(length = 6) {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}


export async function sendOTPEmail(recipientEmail, otp) {
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.STP_USER,
      pass: process.env.STP_PASSWORD,
    },
  });

  let mailOptions = {
    from: 'Your-tube',
    to: recipientEmail,
    subject: 'Your OTP Code',
    text: `Your OTP code is ${otp}. It is valid for 10 minutes.`,
  };

  try {
    let info = await transporter.sendMail(mailOptions);
    return info;
    // console.log('Email sent: ' + info.response);
  } catch (error) {
    console.error('Error sending email: ' + error);
  }
}


const accountSid = process.env.ACCOUNT_SID;
const authToken = process.env.ACCOUNT_TOKEN;
const client = twilio(accountSid, authToken);

export async function sendOTPSMS(recipientNumber, otp) {

  try {
     await client.messages.create({
      body: `Your OTP code is ${otp}. It is valid for 10 minutes.`,
      from: process.env.TWILIO_NUMBER,
      to: recipientNumber,
    });
    
  } catch (error) {
    console.error('Error sending SMS: ' + error);
  } 
}

