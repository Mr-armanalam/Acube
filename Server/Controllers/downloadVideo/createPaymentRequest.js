
import axios from 'axios';

export const createPaymentRequest = async (req, res) => {
    const { amount, buyerName, emailId, phone, purpose, sendEmail, sendSMS } = req.body;
    
    try {
        const options1 = {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'content-type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: process.env.CLIENT_ID_INSTAMOJO,
                client_secret: process.env.CLIENT_SECRET_INSTAMOJO
            })
        };

        const tokenResponse = await fetch('https://api.instamojo.com/oauth2/token/', options1);
        const tokenData = await tokenResponse.json();
        const token = tokenData.access_token;

        if (!token) {
            throw new Error('Token retrieval failed');
        }

        const options = {
            method: 'POST',
            headers: {
                accept: 'application/json',
                Authorization: `Bearer ${token}`,
                'content-type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                send_email: sendEmail,
                amount: amount,
                purpose: purpose,
                buyer_name: buyerName,
                email: emailId,
                redirect_url: 'https://armanalam.vercel.app/'
            })
        };

        const paymentResponse = await fetch('https://api.instamojo.com/v2/payment_requests/', options);
        
        const paymentData = await paymentResponse.json();
        // console.log(paymentData);

        if (paymentData.success) {
            return res.status(200).json({ success: true, payment_request: paymentData.payment_request });
        } else {
            return res.status(400).json({ success: false, message: paymentData.message });
        }
    } catch (error) {
        console.error('Error creating payment request:', error);
        return res.status(500).json({ success: false, message: 'Error creating payment request' });
    }
};
