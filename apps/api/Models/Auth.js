import mongoose from "mongoose";

const userschema = mongoose.Schema(
  {
    name: { type: String },
    // Phase 3b: email is unique — one account per Google/OTP identity.
    // (Mongoose's old `require` spelling was a no-op typo; it is
    // `required` now.) If the production collection already holds
    // duplicate emails, the index build fails and must be resolved by
    // hand — see PHASE3B_NOTES.md, "migration note". No data is dropped.
    email: { type: String, required: true, unique: true, index: true },
    // Deliberately NOT unique: username comes from the Google display
    // name, and two different people can share a display name. A
    // unique index here would make the second same-name login fail.
    username: { type: String },
    picture: { type: String },
    desc: { type: String },
    reputation: { type: Number, default: 0 },
    downloadsToday: { type: Number, default: 0 },
    isPremium: { type: Boolean, default: false },
    downloads: [{ title: String, date: Date }],
    lastReset: { type: Date, default: Date.now },
    // Phase 3b: Stripe Checkout Session that granted (or will grant)
    // premium, and when premium was granted. Premium is granted ONLY by
    // the Stripe webhook / a verified session lookup — never by the
    // client (see Controllers/downloadVideo/).
    stripeCheckoutSessionId: { type: String, default: null },
    premiumGrantedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("User", userschema);
