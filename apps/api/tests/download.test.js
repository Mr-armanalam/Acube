import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, authHeader, createUser } from "./helpers.js";
import User from "../Models/Auth.js";
import ProcessedWebhookEvent from "../Models/ProcessedWebhookEvent.js";

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

beforeEach(() => {
  stripeState.retrieveResult = null;
});

function completedEvent(overrides = {}) {
  return {
    id: "evt_test_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        payment_status: "paid",
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
    expect(res.body).toEqual({ success: true, isPremium: false });
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
    expect(res.body.amount).toBe(1000);
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
    expect(res.body.amount).toBe(1000);
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
