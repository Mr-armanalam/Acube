import React from "react";

const PaymentStatus = () => {

  return (
    <div className="Payment_statuse">
      <div>
        {window.location.href.includes("success") ? (
          <>
            <h1>Payment is Successfull !</h1>
            <p>You are upgraded to Premium.</p>
          </>
        ) : (
          <>
            <h1>Payment is Failed !</h1>
            <p>Please try again later.</p>
          </>
        )}
      </div>
    </div>
  );
};

export default PaymentStatus;
