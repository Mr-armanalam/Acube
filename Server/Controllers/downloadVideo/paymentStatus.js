import User from '../../Models/Auth.js'

export const handlePaymentStatus = async (req, res) => {
    const user_id = req.userid;
    try {
        const user = await User.findById(user_id);

        user.isPremium = true;
        await user.save();

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error handling payment status:', error);
        return res.status(500).json({ success: false, message: 'Error handling payment status' });
    }
};
