import Stripe from "stripe";
import User from "../../Models/Auth.js";
import {
  PREMIUM_CURRENCY,
  PREMIUM_PRICE_INR,
  PREMIUM_PRODUCT_NAME,
} from "@acube/shared";

// Lazily constructed: `new Stripe()` throws when STRIPE_SK is unset, and
// the old top-level construction meant the whole server failed to boot
// without Stripe credentials even though only this route uses Stripe.
// The route still returns 500 when Stripe is unusable.
let stripeClient = null;
export function getStripe() {
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SK);
  }
  return stripeClient;
}

// Server-side price catalogue: the premium price is PREMIUM_PRICE_INR
// (overridable with the PREMIUM_PRICE_INR env var). It is NEVER taken
// from the request body — a client-supplied amount is ignored.
export function premiumPriceInr() {
  const fromEnv = Number(process.env.PREMIUM_PRICE_INR);
  return Number.isFinite(fromEnv) && fromEnv > 0
    ? fromEnv
    : PREMIUM_PRICE_INR;
}

// Phase 3b: creating a payment request NO LONGER grants premium. The
// old code set `isPremium: true` before the Stripe session even existed,
// so anyone could become premium for free. Now this route only creates
// a Stripe Checkout Session (server-side price, buyer = the signed-in
// user from the JWT, never a body `_id`/`emailId`) and stores the
// session id on the user. Premium is granted ONLY by the webhook
// (Controllers/downloadVideo/webhook.js) on checkout.session.completed,
// or by handle-payment-status after it verifies the session with Stripe.
export const createPaymentRequest = async (req, res) => {
  try {
    const user = await User.findById(req.userid);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    if (user.isPremium) {
      return res
        .status(409)
        .json({ success: false, message: "Already premium" });
    }

    const YOUR_DOMAIN = process.env.FRONTEND_URL;
    const amountInr = premiumPriceInr();

    const session = await getStripe().checkout.sessions.create({
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: PREMIUM_CURRENCY,
            product_data: { name: PREMIUM_PRODUCT_NAME },
            unit_amount: amountInr * 100,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      metadata: { userId: String(user._id) },
      success_url: `${YOUR_DOMAIN}/paymentstatus?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${YOUR_DOMAIN}/paymentstatus?canceled=1`,
    });

    await User.findByIdAndUpdate(user._id, {
      stripeCheckoutSessionId: session.id,
    });

    return res.status(200).json({
      success: true,
      payment_request: session.url,
      sessionId: session.id,
      amount: amountInr,
      currency: PREMIUM_CURRENCY,
    });
  } catch (error) {
    console.error("Error creating payment request:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error creating payment request" });
  }
};
