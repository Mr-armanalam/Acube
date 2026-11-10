import { describe, it, expect } from "vitest";
// Auth guard (Phase 2b RequireAuth): guarded routes redirect logged-out
// users to "/" and render for signed-in users.
import { screen } from "@testing-library/react";
import { renderWithProviders, testSession } from "./testUtils";
import { InternetStatusProvider } from "../utils/internetStatusContext";
import Allroutes from "../Allroutes";

function renderRoutes(route: string, session: typeof testSession | null) {
  return renderWithProviders(
    <InternetStatusProvider>
      <Allroutes
        seteditcreatechanelbtn={() => {}}
        setvideouploadpage={() => {}}
      />
    </InternetStatusProvider>,
    { route, session },
  );
}

describe("Auth guard", () => {
  it("redirects a logged-out user from /library to Home", async () => {
    renderRoutes("/library", null);
    expect(
      await screen.findByText("Python Basics Tutorial"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Your library")).not.toBeInTheDocument();
  });

  it("renders /library for a signed-in user", async () => {
    renderRoutes("/library", testSession);
    expect(await screen.findByText("Your library")).toBeInTheDocument();
  });

  // Phase 5 regression (fix pass): the /library route was rewritten
  // with `caseSensitive`, so the old capital-L URL /Library (bookmarks,
  // Phase 4 e2e) fell through to the 404 page instead of the auth
  // guard. Both casings must hit the guarded route.
  it("redirects a logged-out user from /Library (capital L) to Home", async () => {
    renderRoutes("/Library", null);
    expect(
      await screen.findByText("Python Basics Tutorial"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Your library")).not.toBeInTheDocument();
  });

  it("renders /Library (capital L) for a signed-in user", async () => {
    renderRoutes("/Library", testSession);
    expect(await screen.findByText("Your library")).toBeInTheDocument();
  });

  // Phase 3c: /Likedvideo, /Watchhistory and /Watchlater are behind
  // RequireAuth too (they used to render a "Plz login" message).
  // Logged-out users are redirected to Home; signed-in users see the
  // list page header.
  it.each([
    ["/Likedvideo", "Liked Video"],
    ["/Watchhistory", "History"],
    ["/Watchlater", "Watch Later"],
  ])(
    "redirects a logged-out user from %s to Home",
    async (route, page) => {
      renderRoutes(route, null);
      expect(
        await screen.findByText("Python Basics Tutorial"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(`Your ${page} Shown Here`),
      ).not.toBeInTheDocument();
    },
  );

  it.each([
    ["/Likedvideo", "Liked Video"],
    ["/Watchhistory", "History"],
    ["/Watchlater", "Watch Later"],
  ])("renders %s for a signed-in user", async (route, page) => {
    renderRoutes(route, testSession);
    expect(
      await screen.findByText(`Your ${page} Shown Here`),
    ).toBeInTheDocument();
  });
});
