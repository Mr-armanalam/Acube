import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, authHeader, createUser } from "./helpers.js";
import User from "../Models/Auth.js";
import ProcessedWebhookEvent from "../Models/ProcessedWebhookEvent.js";
import { PREMIUM_PRICE_INR } from "@acube/shared";
import {
  isPremiumFreeWindowActive,
  premiumFreeUntilEnd,
  premiumPriceInr,
} from "../Controllers/downloadVideo/createPaymentRequest.js";

// Stripe is mocked: no Stripe account or network call. The mock must be
// a class: the controller constructs it with `new Stripe(...)`, and an
// arrow function cannot be a constructor.
//
// `stripeState.retrieveResult` lets each test decide what
// checkout.sessions.retrieve returns (paid/unpaid, owned by the caller
// or not). `constructEvent` accepts only the "valid-sig" test signature
// and parses the raw body — any other signature throws, exactly like a
// real signature mismatch.
const stripeState = vi.hoisted(() => ({ retrieveResult: null }));
vi.mock("stripe", () => ({
  default: class MockStripe {
    checkout = {
      sessions: {
        create: async () => ({
          id: "cs_test_123",
          url: "https://checkout.stripe.test/session_123",
        }),
        retrieve: async (id) =>
          stripeState.retrieveResult ?? {
            id,
            payment_status: "paid",
            // Catalogue price: ₹15 = 1500 paise (see the amount-validation
            // tests below — a session without the exact amount grants nothing).
            amount_total: 1500,
            customer_email: "buyer@example.com",
            metadata: {},
          },
      },
    };
    webhooks = {
      constructEvent: (raw, sig) => {
        if (sig !== "valid-sig") throw new Error("Invalid Stripe signature");
        return JSON.parse(raw.toString());
      },
    };
  },
}));

const ORIGINAL_FREE_UNTIL = process.env.PREMIUM_FREE_UNTIL;
const ORIGINAL_PRICE_INR = process.env.PREMIUM_PRICE_INR;

beforeEach(() => {
  stripeState.retrieveResult = null;
  // Baseline for the limit / grant tests: the free window CLOSED, so
  // they exercise the paid-premium path deterministically instead of
  // depending on the real calendar date. Free-window tests delete this
  // override (default cutoff applies) and pin the clock with fake
  // timers instead — only `Date` is faked, real timers keep running
  // for the in-memory MongoDB driver and supertest.
  process.env.PREMIUM_FREE_UNTIL = "2020-01-01";
});

afterEach(() => {
  if (ORIGINAL_FREE_UNTIL === undefined) {
    delete process.env.PREMIUM_FREE_UNTIL;
  } else {
    process.env.PREMIUM_FREE_UNTIL = ORIGINAL_FREE_UNTIL;
  }
  if (ORIGINAL_PRICE_INR === undefined) {
    delete process.env.PREMIUM_PRICE_INR;
  } else {
    process.env.PREMIUM_PRICE_INR = ORIGINAL_PRICE_INR;
  }
  vi.useRealTimers();
});

// Use the real default cutoff (PREMIUM_FREE_UNTIL unset) and pin the
// clock, so the test never depends on the date it happens to run on.
function pinDateForDefaultWindow(isoDate) {
  delete process.env.PREMIUM_FREE_UNTIL;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(isoDate));
}

function completedEvent(overrides = {}) {
  return {
    id: "evt_test_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        payment_status: "paid",
        // Catalogue price: ₹15 = 1500 paise.
        amount_total: 1500,
        customer_email: "buyer@example.com",
        metadata: {},
        ...overrides,
      },
    },
  };
}

async function postWebhook(event, signature = "valid-sig") {
  return api
    .post("/download/webhook")
    .set("stripe-signature", signature)
    .set("Content-Type", "application/json")
    .send(JSON.stringify(event));
}

describe("download limits and premium status", () => {
  it("GET /download/user/premium-status reports non-premium by default", async () => {
    const user = await createUser();
    const res = await api
      .get("/download/user/premium-status")
      .set(authHeader(user));
    expect(res.status).toBe(200);
    // Window closed by the beforeEach baseline (see top of file), so a
    // non-paying user is not premium and the window is not active.
    expect(res.body).toEqual({ success: true, isPremium: false, freeWindowActive: false });
  });

  it("GET /download/user/premium-status returns 401 without a token", async () => {
    const res = await api.get("/download/user/premium-status");
    expect(res.status).toBe(401);
  });

  it("free users get 1 download per day, then 403", async () => {
    const user = await createUser();
    const first = await api.post("/download/download-video").set(authHeader(user)).send({});
    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);

    const second = await api.post("/download/download-video").set(authHeader(user)).send({});
    expect(second.status).toBe(403);
    expect(second.body.message).toMatch(/Daily download limit reached/);
  });

  it("premium users are not limited", async () => {
    const user = await createUser({ isPremium: true });
    for (let i = 0; i < 3; i++) {
      const res = await api.post("/download/download-video").set(authHeader(user)).send({});
      expect(res.status).toBe(200);
    }
    expect((await User.findById(user._id)).downloadsToday).toBe(3);
  });

  it("GET /download/user/downloads returns the download history (paginated)", async () => {
    const user = await createUser();
    await api.post("/download/download-video").set(authHeader(user)).send({});
    const res = await api.get("/download/user/downloads").set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.downloads).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });
});

describe("POST /download/create-payment-request (Phase 3b)", () => {
  it("returns 401 without a token", async () => {
    const res = await api.post("/download/create-payment-request").send({});
    expect(res.status).toBe(401);
  });

  it("returns a checkout URL with mocked Stripe and does NOT grant premium", async () => {
    const user = await createUser();
    const res = await api
      .post("/download/create-payment-request")
      .set(authHeader(user))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.payment_request).toBe("https://checkout.stripe.test/session_123");
    expect(res.body.sessionId).toBe("cs_test_123");
    // The price comes from the server catalogue, not the request.
    expect(res.body.amount).toBe(15);
    expect(res.body.currency).toBe("INR");
    const after = await User.findById(user._id);
    expect(after.isPremium).toBe(false);
    expect(after.stripeCheckoutSessionId).toBe("cs_test_123");
  });

  it("ignores a client-supplied amount — the catalogue price wins", async () => {
    const user = await createUser();
    const res = await api
      .post("/download/create-payment-request")
      .set(authHeader(user))
      .send({ amount: 1, _id: String(user._id), emailId: "someone-else@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(15);
    expect((await User.findById(user._id)).isPremium).toBe(false);
  });

  it("returns 409 for a user who is already premium", async () => {
    const user = await createUser({ isPremium: true });
    const res = await api
      .post("/download/create-payment-request")
      .set(authHeader(user))
      .send({});
    expect(res.status).toBe(409);
  });
});

describe("POST /download/handle-payment-status (Phase 3b)", () => {
  it("a bare call with no session id is 400 and grants nothing", async () => {
    const user = await createUser();
    const res = await api
      .post("/download/handle-payment-status")
      .set(authHeader(user))
      .send({});
    expect(res.status).toBe(400);
    expect((await User.findById(user._id)).isPremium).toBe(false);
  });

  it("a forged success — paid session owned by someone else — grants nothing", async () => {
    const user = await createUser();
    // Default mock retrieve: paid, but customer_email "buyer@example.com"
    // and no metadata userId — owned by nobody here.
    const res = await api
      .post("/download/handle-payment-status")
      .set(authHeader(user))
      .send({ sessionId: "cs_test_123" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect((await User.findById(user._id)).isPremium).toBe(false);
  });

  it("an unpaid session owned by the caller grants nothing", async () => {
    const user = await createUser();
    stripeState.retrieveResult = {
      id: "cs_test_unpaid",
      payment_status: "unpaid",
      customer_email: user.email,
      metadata: { userId: String(user._id) },
    };
    const res = await api
      .post("/download/handle-payment-status")
      .set(authHeader(user))
      .send({ sessionId: "cs_test_unpaid" });
    expect(res.body.success).toBe(false);
    expect((await User.findById(user._id)).isPremium).toBe(false);
  });

  it("a paid session owned by the caller grants premium", async () => {
    const user = await createUser();
    stripeState.retrieveResult = {
      id: "cs_test_paid",
      payment_status: "paid",
      amount_total: 1500,
      customer_email: user.email,
      metadata: { userId: String(user._id) },
    };
    const res = await api
      .post("/download/handle-payment-status")
      .set(authHeader(user))
      .send({ sessionId: "cs_test_paid" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect((await User.findById(user._id)).isPremium).toBe(true);
  });

  it("returns 401 without a token", async () => {
    const res = await api
      .post("/download/handle-payment-status")
      .send({ sessionId: "cs_test_123" });
    expect(res.status).toBe(401);
  });
});

describe("POST /download/webhook (Phase 3b)", () => {
  it("a completed + paid event grants premium", async () => {
    const user = await createUser();
    const res = await postWebhook(
      completedEvent({ metadata: { userId: String(user._id) } }),
    );
    expect(res.status).toBe(200);
    expect((await User.findById(user._id)).isPremium).toBe(true);
    expect(await ProcessedWebhookEvent.countDocuments({})).toBe(1);
  });

  it("a duplicate event is ignored — premium granted once", async () => {
    const user = await createUser();
    const event = completedEvent({ metadata: { userId: String(user._id) } });
    const first = await postWebhook(event);
    expect(first.status).toBe(200);
    const second = await postWebhook(event);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(await ProcessedWebhookEvent.countDocuments({})).toBe(1);
    expect((await User.findById(user._id)).isPremium).toBe(true);
  });

  it("a webhook with a bad signature is 400 and grants nothing", async () => {
    const user = await createUser();
    const res = await postWebhook(
      completedEvent({ metadata: { userId: String(user._id) } }),
      "bad-sig",
    );
    expect(res.status).toBe(400);
    expect((await User.findById(user._id)).isPremium).toBe(false);
    expect(await ProcessedWebhookEvent.countDocuments({})).toBe(0);
  });

  it("a webhook with no signature is 400 and grants nothing", async () => {
    const user = await createUser();
    const res = await api
      .post("/download/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(completedEvent({ metadata: { userId: String(user._id) } })));
    expect(res.status).toBe(400);
    expect((await User.findById(user._id)).isPremium).toBe(false);
  });

  it("an unpaid completed event grants nothing", async () => {
    const user = await createUser();
    const res = await postWebhook(
      completedEvent({ payment_status: "unpaid", metadata: { userId: String(user._id) } }),
    );
    expect(res.status).toBe(200);
    expect((await User.findById(user._id)).isPremium).toBe(false);
  });

  it("a non-checkout event is acknowledged and ignored", async () => {
    const user = await createUser();
    const res = await postWebhook({
      id: "evt_test_other",
      type: "payment_intent.created",
      data: { object: { id: "pi_test_1" } },
    });
    expect(res.status).toBe(200);
    expect((await User.findById(user._id)).isPremium).toBe(false);
    expect(await ProcessedWebhookEvent.countDocuments({})).toBe(0);
  });
});

describe("premium price catalogue (premium-pricing change: ₹15)", () => {
  it("the shared catalogue price is 15 INR", () => {
    expect(PREMIUM_PRICE_INR).toBe(15);
  });

  it("premiumPriceInr() returns 15 by default", () => {
    delete process.env.PREMIUM_PRICE_INR;
    expect(premiumPriceInr()).toBe(15);
  });

  it("premiumPriceInr() honours a valid PREMIUM_PRICE_INR env override", () => {
    process.env.PREMIUM_PRICE_INR = "42";
    expect(premiumPriceInr()).toBe(42);
  });

  it("premiumPriceInr() falls back to 15 for an invalid env value", () => {
    for (const bad of ["abc", "0", "-5", ""]) {
      process.env.PREMIUM_PRICE_INR = bad;
      expect(premiumPriceInr()).toBe(15);
    }
  });
});

describe("premium free window (free until end of 2027-11-12 UTC)", () => {
  it("premium-status is true during the window without any payment", async () => {
    pinDateForDefaultWindow("2026-06-01T12:00:00.000Z");
    const user = await createUser();
    const res = await api
      .get("/download/user/premium-status")
      .set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, isPremium: true, freeWindowActive: true });
    // Nothing is stored: the window grants nothing permanent.
    const after = await User.findById(user._id);
    expect(after.isPremium).toBe(false);
    expect(after.premiumGrantedAt).toBeNull();
  });

  it("premium-status is false after the cutoff without payment", async () => {
    pinDateForDefaultWindow("2027-11-13T00:00:00.000Z");
    const user = await createUser();
    const res = await api
      .get("/download/user/premium-status")
      .set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, isPremium: false, freeWindowActive: false });
  });

  it("the cutoff is end-of-day UTC: the last second of 2027-11-12 is free, midnight after is not", async () => {
    pinDateForDefaultWindow("2027-11-12T23:59:59.000Z");
    expect(isPremiumFreeWindowActive()).toBe(true);
    expect(premiumFreeUntilEnd().toISOString()).toBe("2027-11-13T00:00:00.000Z");
    vi.setSystemTime(new Date("2027-11-13T00:00:00.000Z"));
    expect(isPremiumFreeWindowActive()).toBe(false);
  });

  it("an invalid PREMIUM_FREE_UNTIL falls back to the default instead of crashing", async () => {
    // Garbage and impossible calendar dates both fall back to the
    // default cutoff 2027-11-12 (end of day UTC).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    for (const bad of ["not-a-date", "2027-02-30", "2027-13-01", ""]) {
      process.env.PREMIUM_FREE_UNTIL = bad;
      expect(isPremiumFreeWindowActive()).toBe(true);
      expect(premiumFreeUntilEnd().toISOString()).toBe("2027-11-13T00:00:00.000Z");
    }
    // And after the default cutoff the same invalid value is not free.
    process.env.PREMIUM_FREE_UNTIL = "not-a-date";
    vi.setSystemTime(new Date("2028-01-01T00:00:00.000Z"));
    expect(isPremiumFreeWindowActive()).toBe(false);
  });

  it("paid premium is still premium after the cutoff", async () => {
    pinDateForDefaultWindow("2028-01-01T00:00:00.000Z");
    const user = await createUser({ isPremium: true });
    const res = await api
      .get("/download/user/premium-status")
      .set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, isPremium: true, freeWindowActive: false });
    for (let i = 0; i < 3; i++) {
      const dl = await api.post("/download/download-video").set(authHeader(user)).send({});
      expect(dl.status).toBe(200);
    }
  });

  it("download gate allows unlimited downloads during the window", async () => {
    pinDateForDefaultWindow("2026-06-01T12:00:00.000Z");
    const user = await createUser();
    for (let i = 0; i < 3; i++) {
      const res = await api.post("/download/download-video").set(authHeader(user)).send({});
      expect(res.status).toBe(200);
    }
    expect((await User.findById(user._id)).isPremium).toBe(false);
  });

  it("download gate enforces the free daily limit after the window", async () => {
    pinDateForDefaultWindow("2027-11-13T00:00:00.000Z");
    const user = await createUser();
    const first = await api.post("/download/download-video").set(authHeader(user)).send({});
    expect(first.status).toBe(200);
    const second = await api.post("/download/download-video").set(authHeader(user)).send({});
    expect(second.status).toBe(403);
    expect(second.body.message).toMatch(/Daily download limit reached/);
  });

  it("checkout is still offered during the window — no 409 for a non-paying user", async () => {
    pinDateForDefaultWindow("2026-06-01T12:00:00.000Z");
    const user = await createUser();
    const res = await api
      .post("/download/create-payment-request")
      .set(authHeader(user))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(15);
    expect((await User.findById(user._id)).isPremium).toBe(false);
  });
});

describe("amount validation (old ₹1000 sessions must not grant premium)", () => {
  it("webhook rejects a paid session whose amount_total is not 1500 paise", async () => {
    const user = await createUser();
    const res = await postWebhook(
      completedEvent({
        amount_total: 100000, // old ₹1000 session
        metadata: { userId: String(user._id) },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body.ignored).toBe("amount-mismatch");
    expect((await User.findById(user._id)).isPremium).toBe(false);
    expect(await ProcessedWebhookEvent.countDocuments({})).toBe(0);
  });

  it("webhook rejects a paid session with no amount_total at all", async () => {
    const user = await createUser();
    const event = completedEvent({ metadata: { userId: String(user._id) } });
    delete event.data.object.amount_total;
    const res = await postWebhook(event);
    expect(res.status).toBe(200);
    expect(res.body.ignored).toBe("amount-mismatch");
    expect((await User.findById(user._id)).isPremium).toBe(false);
  });

  it("handle-payment-status rejects a paid session whose amount_total is not 1500 paise", async () => {
    const user = await createUser();
    stripeState.retrieveResult = {
      id: "cs_test_old_price",
      payment_status: "paid",
      amount_total: 100000, // old ₹1000 session
      customer_email: user.email,
      metadata: { userId: String(user._id) },
    };
    const res = await api
      .post("/download/handle-payment-status")
      .set(authHeader(user))
      .send({ sessionId: "cs_test_old_price" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/amount mismatch/i);
    expect((await User.findById(user._id)).isPremium).toBe(false);
  });

  it("handle-payment-status accepts a paid session at exactly 1500 paise", async () => {
    const user = await createUser();
    stripeState.retrieveResult = {
      id: "cs_test_new_price",
      payment_status: "paid",
      amount_total: 1500,
      customer_email: user.email,
      metadata: { userId: String(user._id) },
    };
    const res = await api
      .post("/download/handle-payment-status")
      .set(authHeader(user))
      .send({ sessionId: "cs_test_new_price" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect((await User.findById(user._id)).isPremium).toBe(true);
  });
});
