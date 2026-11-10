import User from '../../Models/Auth.js'
import { getStripe } from "./createPaymentRequest.js";

// Phase 3b: the old handler granted premium on ANY authenticated call
// — a forged client "success" callback made anyone premium for free.
// Now the caller must name the Stripe Checkout Session
// ({ sessionId }) and the server verifies it with Stripe:
//   * session not found on Stripe -> 404, no premium;
//   * session not paid, or owned by someone else -> { success: false },
//     no premium;
//   * session paid AND owned by the caller -> premium granted
//     (idempotent: an already-premium user just gets success: true).
// The webhook remains the primary grant path; this is the fallback for
// a return from Checkout when the webhook has not landed yet.
export const handlePaymentStatus = async (req, res) => {
    const user_id = req.userid;
    const { sessionId } = req.body;
    try {
        let session;
        try {
            session = await getStripe().checkout.sessions.retrieve(sessionId);
        } catch (error) {
            console.error('Error retrieving Stripe session:', error);
            return res.status(404).json({ success: false, message: 'Payment session not found' });
        }

        const user = await User.findById(user_id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const ownedByCaller =
            session.metadata?.userId === String(user._id) ||
            (session.customer_email && session.customer_email === user.email);
        if (!ownedByCaller || session.payment_status !== 'paid') {
            return res.status(200).json({ success: false, message: 'Payment not verified' });
        }

        if (!user.isPremium) {
            user.isPremium = true;
            user.premiumGrantedAt = new Date();
            user.stripeCheckoutSessionId = session.id;
            await user.save();
        }

        return res.status(200).json({ success: true, isPremium: true });
    } catch (error) {
        console.error('Error handling payment status:', error);
        return res.status(500).json({ success: false, message: 'Error handling payment status' });
    }
};
