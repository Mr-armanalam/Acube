import User from '../Models/Auth.js';

const getUser = async (userId) => { 
    return await User.findById(userId);
};

const updateUserDownloadCount = async (user) => {
    user.downloadsToday += 1;
    await user.save();
};

const createPaymentRequest = async (data) => {
    return { success: true, payment_request: { longurl: 'https://test.instamojo.com/longurl' } };
};

const handlePaymentStatus = async (payment_id, user_id) => {
    const user = await getUser(user_id);
    user.isPremium = true;
    await user.save();
};

const getUserDownloads = async (userId) => {
    const user = await getUser(userId);
    return user.downloads;
};

export {getUser, updateUserDownloadCount, createPaymentRequest, handlePaymentStatus, getUserDownloads };
