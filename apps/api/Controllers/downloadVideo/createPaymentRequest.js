import Stripe from "stripe";
import User from "../../Models/Auth.js";
import {
  PREMIUM_CURRENCY,
  PREMIUM_FREE_UNTIL_DEFAULT,
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

// Premium free window (Arman decided 12 Nov 2026): premium is FREE for
// everyone for one year. The cutoff is PREMIUM_FREE_UNTIL (a YYYY-MM-DD
// date, overridable by env) and is treated as END OF DAY UTC on that
// date — the window is active while `now` is before 00:00:00 UTC on the
// day AFTER the cutoff (so 2027-11-12T23:59:59Z is still free, and
// 2027-11-13T00:00:00Z is not). End-of-day was chosen so the whole
// announced last day counts, in every timezone, with no timezone math
// at the call sites. An invalid env value (not a real YYYY-MM-DD date)
// falls back to PREMIUM_FREE_UNTIL_DEFAULT — it never crashes and never
// silently disables the window. The cutoff is read on every call, so
// tests and deploys can change it without a restart of the module.
function parseFreeUntilDate(raw) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const startOfDay = new Date(Date.UTC(year, month - 1, day));
  if (
    startOfDay.getUTCFullYear() !== year ||
    startOfDay.getUTCMonth() !== month - 1 ||
    startOfDay.getUTCDate() !== day
  ) {
    return null; // e.g. 2027-02-30 — not a real calendar date
  }
  // End of the cutoff day, UTC = start of the next day.
  return new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
}

// Exclusive end of the free window (a Date): the window is active while
// `now < premiumFreeUntilEnd()`.
export function premiumFreeUntilEnd() {
  return (
    parseFreeUntilDate(process.env.PREMIUM_FREE_UNTIL) ??
    parseFreeUntilDate(PREMIUM_FREE_UNTIL_DEFAULT)
  );
}

// True while the free window is active. `now` is injectable so tests
// can pin the clock instead of depending on the real date.
export function isPremiumFreeWindowActive(now = new Date()) {
  return now < premiumFreeUntilEnd();
}

// Effective premium: paid premium on record, OR the free window is
// active. This is the ONLY definition of "premium" the download gate
// and the status endpoint use. No permanent flag is ever stored for
// free-window users, so the window ends automatically at the cutoff.
export function isEffectivelyPremium(user, now = new Date()) {
  return user?.isPremium === true || isPremiumFreeWindowActive(now);
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
    // 409 only for PAID premium on record (user.isPremium). During the
    // free window a user without paid premium is effectively premium
    // but may still check out: paying now grants paid premium that
    // survives the cutoff, so checkout stays offered while the window
    // is active. The download gate and the status endpoint (not this
    // route) are what apply the free window.
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
