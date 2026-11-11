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
    // Phase 5 fix: channel profile fields (GET/PATCH /studio/settings).
    // handle is unique when set (sparse: unset handles do not collide);
    // format is enforced by studioSettingsSchema in @acube/shared.
    // There is NO subscribe/follower system — keepSubscriptionsPrivate
    // is a stored preference only, it gates nothing today.
    handle: { type: String, default: null, index: true, sparse: true },
    links: {
      type: [{ label: { type: String }, url: { type: String } }],
      default: [],
    },
    contactEmail: { type: String, default: null },
    country: { type: String, default: null },
    language: { type: String, default: null },
    bannerUrl: { type: String, default: null },
    // avatarUrl is the channel avatar; `picture` (Google photo) stays
    // the login avatar and is used as the fallback when this is unset.
    avatarUrl: { type: String, default: null },
    channelPublic: { type: Boolean, default: true },
    keepSubscriptionsPrivate: { type: Boolean, default: false },
    uploadDefaultVisibility: {
      type: String,
      enum: ["public", "unlisted", "private", "draft"],
      default: "public",
    },
    uploadDefaultComments: { type: Boolean, default: true },
    watermarkEnabled: { type: Boolean, default: false },
    // Phase 5 fix: when true, POST /video/history does not record a
    // row and PATCH /video/history/:videoid/progress does not store a
    // position (see Controllers/History.js). Read/changed via
    // GET/PATCH /user/history-paused.
    historyPaused: { type: Boolean, default: false },
    // Phase 5 fix: demo seed marker (apps/api/scripts/seed-demo.js).
    // True ONLY for rows created by the demo seed; the seed clears
    // demo:true rows before re-inserting, so re-runs are idempotent
    // and never touch real user data.
    demo: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("User", userschema);
