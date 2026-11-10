import { useEffect } from "react";
import { useHandlePaymentStatus } from "../query/downloads";

// Phase 3c: converted from .jsx to .tsx (no logic change).

// Phase 2c: success is shown ONLY after the server confirms the payment
// via POST /download/handle-payment-status. The old code trusted
// `window.location.href.includes("success")` alone, so anyone could see
// (and claim) a successful upgrade by visiting a forged URL.
//
// Phase 3b: the server now verifies the Stripe Checkout Session named
// by `session_id` in the return URL before granting premium — a forged
// `?success=1` with no (or someone else's) session id verifies as
// failure. Only a gateway return carrying a session id is worth
// verifying; a plain visit to /paymentstatus never calls the API.
const PaymentStatus = () => {
  const { mutate, isPending, isSuccess, isError, data } =
    useHandlePaymentStatus();

  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  const sessionId = params?.get("session_id");
  const gatewayReturnedSuccess =
    params?.get("success") === "1" && Boolean(sessionId);

  useEffect(() => {
    if (gatewayReturnedSuccess && sessionId) {
      mutate({ sessionId });
    }
  }, [gatewayReturnedSuccess, sessionId, mutate]);

  let body;
  if (!gatewayReturnedSuccess || isError || (isSuccess && !data?.success)) {
    body = (
      <>
        <h1>Payment is Failed !</h1>
        <p>Please try again later.</p>
        {isError || (isSuccess && !data?.success) ? (
          <p>We could not verify your payment with the server.</p>
        ) : null}
      </>
    );
  } else if (isPending || !isSuccess) {
    body = (
      <>
        <h1>Verifying your payment…</h1>
        <p>Please wait while we confirm your payment.</p>
      </>
    );
  } else {
    body = (
      <>
        <h1>Payment is Successfull !</h1>
        <p>You are upgraded to Premium.</p>
      </>
    );
  }

  return (
    <div className="Payment_statuse">
      <div>{body}</div>
    </div>
  );
};

export default PaymentStatus;
