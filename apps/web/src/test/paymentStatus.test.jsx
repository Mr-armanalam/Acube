// PaymentStatus (Phase 2c regression): success must be shown only after
// the server confirms the payment — never from the URL alone.
// Phase 3b: the server verifies the Stripe Checkout Session named by
// `session_id` in the return URL. A forged `?success=1` with no
// session id never calls the API.
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { captured } from "../mocks/handlers";
import { renderWithProviders, testSession } from "./testUtils";
import PaymentStatus from "../Component/PaymentStatus";

afterEach(() => {
  window.history.pushState({}, "", "/");
});

describe("PaymentStatus", () => {
  it("shows success only after the server verifies the session id", async () => {
    window.history.pushState(
      {},
      "",
      "/paymentstatus?success=1&session_id=cs_test_123",
    );
    renderWithProviders(<PaymentStatus />, { session: testSession });
    expect(
      await screen.findByText(/Payment is Successfull/i),
    ).toBeInTheDocument();
    expect(captured.paymentStatus).toHaveLength(1);
    expect(captured.paymentStatus[0]).toEqual({ sessionId: "cs_test_123" });
  });

  it("shows failure — and never calls the API — on a plain visit", async () => {
    window.history.pushState({}, "", "/paymentstatus");
    renderWithProviders(<PaymentStatus />, { session: testSession });
    expect(
      await screen.findByText(/Payment is Failed/i),
    ).toBeInTheDocument();
    expect(captured.paymentStatus).toHaveLength(0);
  });

  it("shows failure — and never calls the API — for ?success=1 with no session id", async () => {
    window.history.pushState({}, "", "/paymentstatus?success=1");
    renderWithProviders(<PaymentStatus />, { session: testSession });
    expect(
      await screen.findByText(/Payment is Failed/i),
    ).toBeInTheDocument();
    expect(captured.paymentStatus).toHaveLength(0);
  });

  it("shows failure when server verification fails", async () => {
    server.use(
      http.post("*/download/handle-payment-status", () =>
        HttpResponse.json({ success: false }),
      ),
    );
    window.history.pushState(
      {},
      "",
      "/paymentstatus?success=1&session_id=cs_test_123",
    );
    renderWithProviders(<PaymentStatus />, { session: testSession });
    expect(
      await screen.findByText(/Payment is Failed/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/could not verify your payment/i),
    ).toBeInTheDocument();
  });
});
