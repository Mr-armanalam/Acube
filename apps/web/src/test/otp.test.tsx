import { describe, it, expect } from "vitest";
// OTP auth (Phase 2c regression): the "Skip" button used to complete auth
// without verifying an OTP. There must be no skip path at all — auth
// completes only after the server verifies the OTP.
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { renderWithProviders } from "./testUtils";
import OTP_Auth from "../Pages/Auth/OTP_Auth";
import { encryptData2 } from "../utils/toEncrypt";

function renderOtp() {
  const param = encryptData2({
    email: "test@example.com",
    name: "Test User",
    picture: "",
  });
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<div>Home page</div>} />
      <Route path="/auth-verifier/:user" element={<OTP_Auth />} />
    </Routes>,
    { route: `/auth-verifier/${param}` },
  );
}

describe("OTP auth", () => {
  it("has no Skip button or any skip path", async () => {
    renderOtp();
    expect(
      await screen.findByText(/Authenticate using email or number/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /skip/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^Skip$/i)).not.toBeInTheDocument();
  });

  it("completes auth after a verified OTP and navigates home", async () => {
    const user = userEvent.setup();
    const { store } = renderOtp();
    expect(
      await screen.findByText(/Authenticate using email or number/i),
    ).toBeInTheDocument();

    // First submit (empty OTP) sends the OTP to the prefilled email.
    await user.click(screen.getByRole("button", { name: /next/i }));
    const otpInput = await screen.findByPlaceholderText("Otp");
    await user.type(otpInput, "123456");
    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(await screen.findByText("Home page")).toBeInTheDocument();
    expect(store.getState().auth.session?.result.email).toBe(
      "test@example.com",
    );
  });

  it("does not sign in on a wrong OTP", async () => {
    const user = userEvent.setup();
    const { store } = renderOtp();
    await user.click(screen.getByRole("button", { name: /next/i }));
    const otpInput = await screen.findByPlaceholderText("Otp");
    await user.type(otpInput, "000000");
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Still on the OTP page, with no session.
    await waitFor(() =>
      expect(screen.queryByText(/password invalid/i)).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("Home page"),
    ).not.toBeInTheDocument();
    expect(store.getState().auth.session).toBeNull();
  });
});
