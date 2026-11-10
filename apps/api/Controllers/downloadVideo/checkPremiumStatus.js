import User from '../../Models/Auth.js'

export const checkPremiumStatus = async (req, res) => {
    const userId  = req.userid;
    try {
        const user = await User.findById(userId).lean();
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        return res.status(200).json({ success: true, isPremium: user.isPremium });
    } catch (error) {
        console.error('Error checking premium status:', error);
        return res.status(500).json({ success: false, message: 'Error checking premium status' });
    }
};
