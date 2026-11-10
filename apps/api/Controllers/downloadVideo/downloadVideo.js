import User from '../../Models/Auth.js';
import { FREE_DAILY_DOWNLOADS } from "@acube/shared";

// Phase 3b: the daily-limit check and the counter increment are now ONE
// atomic findOneAndUpdate — the old read-then-save let two concurrent
// downloads both pass the free limit. The update only applies when the
// user is premium OR still under the free daily limit; otherwise the
// caller gets 403. (The daily reset itself still happens on login, as
// before — see Controllers/Auth.js login.)
export const downloadvideo = async (req, res) => {
    const userId = req.userid;
    try {
        const updated = await User.findOneAndUpdate(
            {
                _id: userId,
                $or: [
                    { isPremium: true },
                    { downloadsToday: { $lt: FREE_DAILY_DOWNLOADS } },
                ],
            },
            {
                $inc: { downloadsToday: 1 },
                $set: { lastReset: new Date() },
                $push: { downloads: { title: 'Video Title', date: new Date() } },
            },
            { returnDocument: "after" },
        );
        if (!updated) {
            const user = await User.findById(userId).lean();
            if (!user) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }
            return res.status(403).json({ success: false, message: 'Daily download limit reached. Upgrade to premium for unlimited downloads.' });
        }

        return res.status(200).json({ success: true, video: { title: 'Video Title' } });
    } catch (error) {
        console.error('Error downloading video:', error);
        return res.status(500).json({ success: false, message: 'Error downloading video' });
    }
};
