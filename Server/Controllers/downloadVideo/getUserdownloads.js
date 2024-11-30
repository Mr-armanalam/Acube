import User from '../../Models/Auth.js';

export const getUserDownloads = async (req, res) => {
    const userId = req.userid;
    try {
        const user = await User.findById(userId);

        return res.status(200).json({ success: true, downloads: user.downloads });
    } catch (error) {
        console.error('Error fetching user downloads:', error);
        return res.status(500).json({ success: false, message: 'Error fetching user downloads' });
    }
};
