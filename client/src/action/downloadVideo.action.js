import * as api from "../Api";

export const downloadVideo = (videoId) => async (dispatch) => {
    try {
        const {data} = await api.downloadVideo( videoId );
        if (data.success) {
            dispatch({ type: 'VIDEO_DOWNLOADED', payload: data.video });
            return { success: true, video: data.video };
        } else {
            return { success: false, message: data.message };
        }
    } catch (error) {
        console.error('Error downloading video:', error);
        return { success: false, message: 'Error downloading video' };
    }
};

export const checkPremiumStatus = () => async (dispatch) => {
    try {
        const response = await api.checkPremiumStatus();
        dispatch({ type: 'CHECK_PREMIUM_STATUS', payload: response.data.isPremium });
        return response.data.isPremium;
    } catch (error) {
        console.error('Error checking premium status:', error);
        return false;
    }
};


export const createPaymentRequest = (paymentData) => async (dispatch) => {
    try {
        const response = await api.createPaymentRequest(paymentData);
        return response.data;
    } catch (error) {
        console.error('Error creating payment request:', error);
        throw error;
    }
};

export const handlePaymentStatus = (paymentId) => async (dispatch) => {
    try {
        const response = await api.handlePaymentStatus(paymentId);
        return response.data;
    } catch (error) {
        console.error('Error handling payment status:', error);
        throw error;
    }
};

export const getDownloads = () => async (dispatch) => {
    try {
        const response = await api.getDownloads();
        dispatch({ type: 'GET_DOWNLOADS', payload: response.data.downloads });
        // console.log(response.data);
        
        return response.data.downloads;
    } catch (error) {
        console.error('Error fetching downloads:', error);
        return [];
    }
};
