// Phase 3c: pins the jest-dom-under-Vitest-5 fix (see
// src/test/jest-dom.d.ts). If these matchers ever stop typechecking,
// the suite falls back to Vitest built-ins for DOM assertions.
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "./testUtils";
import Home from "../Pages/Home/Home";

describe("jest-dom matchers", () => {
  it("supports toBeInTheDocument / toHaveTextContent", async () => {
    renderWithProviders(<Home />);
    const title = await screen.findByText("Python Basics Tutorial");
    expect(title).toBeInTheDocument();
    expect(title).toHaveTextContent("Python Basics");
  });
});
