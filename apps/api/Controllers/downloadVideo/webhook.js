// Phase 3b: Stripe webhook — the ONLY place premium is granted on a
// payment event. POST /download/webhook receives the raw request body
// (registered with express.raw in app.js BEFORE express.json) and
// verifies the Stripe signature with STRIPE_WEBHOOK_SECRET. An
// unverifiable request is 400 and grants nothing.
//
// Idempotency: the event is recorded in ProcessedWebhookEvent BEFORE
// granting premium. A duplicate delivery (Stripe retries webhooks)
// hits the unique eventId index and is answered 200 without granting
// twice. Only checkout.session.completed with payment_status "paid"
// grants premium; every other event type is acknowledged and ignored.
import User from "../../Models/Auth.js";
import ProcessedWebhookEvent from "../../Models/ProcessedWebhookEvent.js";
import { getStripe, premiumPriceInr } from "./createPaymentRequest.js";

export const stripeWebhook = async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return res.status(500).json({
      success: false,
      message: "Webhook secret is not configured",
    });
  }

  const signature = req.headers["stripe-signature"];
  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, signature, secret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed:", error);
    return res.status(400).json({
      success: false,
      message: "Invalid webhook signature",
    });
  }

  if (event.type !== "checkout.session.completed") {
    return res.status(200).json({ received: true, ignored: event.type });
  }

  const session = event.data.object;
  if (session.payment_status !== "paid") {
    return res.status(200).json({ received: true, ignored: "unpaid" });
  }

  // Amount validation (premium-pricing change): the session must have
  // paid exactly the catalogue price (premiumPriceInr() * 100 paise).
  // A session created at the old ₹1000 price — or any other amount —
  // must NOT grant premium after the price changed to ₹15. A mismatch
  // is answered 200 (Stripe retries non-2xx, and there is nothing to
  // retry: the session amount is fixed) and the event is NOT recorded
  // as processed, so nothing about it is treated as granted.
  const expectedAmountPaise = premiumPriceInr() * 100;
  if (session.amount_total !== expectedAmountPaise) {
    console.error(
      "Stripe webhook: session amount mismatch — expected",
      expectedAmountPaise,
      "paise, got",
      session.amount_total,
      "for session",
      session.id,
    );
    return res
      .status(200)
      .json({ received: true, ignored: "amount-mismatch" });
  }

  // Record first, atomically: an upsert with $setOnInsert claims the
  // event id exactly once — a duplicate delivery (Stripe retries
  // webhooks) matches the existing row instead of inserting, and is
  // answered 200 without granting twice. The unique index on eventId
  // is a backstop, not the mechanism: index builds are asynchronous,
  // so a duplicate arriving before the index exists must still be
  // caught, and this upsert does that.
  const claimed = await ProcessedWebhookEvent.updateOne(
    { eventId: event.id },
    {
      $setOnInsert: {
        eventId: event.id,
        type: event.type,
        sessionId: session.id,
        userId: session.metadata?.userId ?? null,
      },
    },
    { upsert: true },
  );
  if (claimed.upsertedCount === 0) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  const userId = session.metadata?.userId;
  const user = userId
    ? await User.findById(userId)
    : session.customer_email
      ? await User.findOne({ email: session.customer_email })
      : null;
  if (!user) {
    console.error(
      "Stripe webhook: no user for completed session",
      session.id,
    );
    return res.status(200).json({ received: true, user: "not-found" });
  }

  if (!user.isPremium) {
    user.isPremium = true;
    user.premiumGrantedAt = new Date();
    user.stripeCheckoutSessionId = session.id;
    await user.save();
  }

  return res.status(200).json({ received: true });
};
