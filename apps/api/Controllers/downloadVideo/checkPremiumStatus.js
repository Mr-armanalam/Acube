import User from '../../Models/Auth.js'
import { isEffectivelyPremium, isPremiumFreeWindowActive } from './createPaymentRequest.js'

// GET /download/user/premium-status returns the EFFECTIVE premium
// state: paid premium on record, OR the premium free window
// (PREMIUM_FREE_UNTIL, default end of 2027-11-12 UTC) is active.
// Free-window users have no premium flag stored — the window is
// evaluated at request time, so it ends automatically at the cutoff.
// `freeWindowActive` is exposed alongside so the client can tell a
// free-window grant apart from paid premium.
export const checkPremiumStatus = async (req, res) => {
    const userId  = req.userid;
    try {
        const user = await User.findById(userId).lean();
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        return res.status(200).json({
            success: true,
            isPremium: isEffectivelyPremium(user),
            freeWindowActive: isPremiumFreeWindowActive(),
        });
    } catch (error) {
        console.error('Error checking premium status:', error);
        return res.status(500).json({ success: false, message: 'Error checking premium status' });
    }
};
