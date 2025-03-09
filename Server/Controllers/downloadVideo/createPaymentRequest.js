import Stripe from "stripe";
import User from "../../Models/Auth.js";

const stripe = new Stripe(process.env.STRIPE_SK);

export const createPaymentRequest = async (req, res) => {
  const { amount, _id, emailId, purpose } = req.body;
  //   console.log(amount, buyerName, emailId);

  try {
    const YOUR_DOMAIN = process.env.FRONTEND_URL;

    await User.findByIdAndUpdate(_id, { isPremium: true }, { new: true });

    const customer = await stripe.checkout.sessions.create({
      customer_email: emailId,
      line_items: [
        {
          price_data: {
            currency: "INR",
            product_data: { name: purpose || "Upgrade to Premium" },
            unit_amount: amount * 100,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${YOUR_DOMAIN}/paymentstatus?success=1`,
      cancel_url: `${YOUR_DOMAIN}/paymentstatus?canceled=1`,
    });

    return res
      .status(200)
      .json({ success: true, payment_request: customer.url });
  } catch (error) {
    console.error("Error creating payment request:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error creating payment request" });
  }
};
