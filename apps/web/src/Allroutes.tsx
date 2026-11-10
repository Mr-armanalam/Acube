import React, { Suspense, lazy } from "react";
import { Navigate, Routes, Route } from "react-router";
import Home from "./Pages/Home/Home";
import { useInternetStatus } from "./utils/internetStatusContext";
import { useAppSelector } from "./store";
import LoadingCard from "./Component/LoadingCard";

// Phase 2b: routes are code-split with React.lazy — the player and the
// StreamRoom (simple-peer + recordrtc) are the heavy chunks and no longer
// ship in the initial bundle. Home stays eager so first paint is fast.
const Search = lazy(() => import("./Pages/Search/Search"));
const Videopage = lazy(() => import("./Pages/Videopage/Videopage"));
const Channel = lazy(() => import("./Pages/Channel/Channel"));
const Library = lazy(() => import("./Pages/Library/Library"));
const Likedvideo = lazy(() => import("./Pages/Likedvideo/Likedvideo"));
const Watchhistory = lazy(() => import("./Pages/Watchhistory/Watchhistory"));
const Watchlater = lazy(() => import("./Pages/Watchlater/Watchlater"));
const Yourvideo = lazy(() => import("./Pages/Yourvideo/Yourvideo"));
const Chat = lazy(() => import("./Pages/chat/Chat"));
const StreamRoom = lazy(() => import("./Pages/videostream/StreamRoom"));
const OtpAuth = lazy(() => import("./Pages/Auth/OTP_Auth"));
const PaymentStatus = lazy(() => import("./Component/PaymentStatus"));

// There is no dedicated /login route in this app — Google sign-in lives in
// the Navbar — so guarded routes redirect to "/" (where the Navbar offers
// Sign in) instead of showing a post-hoc "Plz login" message.
const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const session = useAppSelector((s) => s.auth.session);
  if (!session) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

const NotFound = () => (
  <div
    style={{
      color: "var(--forground_text)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
      gap: "1rem",
    }}
  >
    <h1>404 — Page not found</h1>
    <p>The page you are looking for does not exist.</p>
  </div>
);

const Allroutes = ({
  seteditcreatechanelbtn,
  setvideouploadpage,
}: {
  seteditcreatechanelbtn: (v: boolean) => void;
  setvideouploadpage: (v: boolean) => void;
}) => {
  const isOnline = useInternetStatus();
  return (
    <>
      {isOnline ? (
        <Suspense fallback={<LoadingCard />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search/:Searchquery" element={<Search />} />
            <Route path="/videopage/:vid" element={<Videopage />} />
            <Route
              path="/Library"
              element={
                <RequireAuth>
                  <Library />
                </RequireAuth>
              }
            />
            <Route
              path="/Likedvideo"
              element={
                <RequireAuth>
                  <Likedvideo />
                </RequireAuth>
              }
            />
            <Route
              path="/Watchhistory"
              element={
                <RequireAuth>
                  <Watchhistory />
                </RequireAuth>
              }
            />
            <Route
              path="/Watchlater"
              element={
                <RequireAuth>
                  <Watchlater />
                </RequireAuth>
              }
            />
            <Route
              path="/Yourvideo"
              element={
                <RequireAuth>
                  <Yourvideo />
                </RequireAuth>
              }
            />
            <Route path="/paymentstatus" element={<PaymentStatus />} />
            <Route
              path="/channel/:cid"
              element={
                <Channel
                  seteditcreatechanelbtn={seteditcreatechanelbtn}
                  setvideouploadpage={setvideouploadpage}
                />
              }
            />
            <Route
              path="/chat"
              element={
                <RequireAuth>
                  <Chat />
                </RequireAuth>
              }
            />
            <Route
              path="/video-stream/:encryptId"
              element={
                <RequireAuth>
                  <StreamRoom />
                </RequireAuth>
              }
            />
            <Route path="/auth-verifier/:user" element={<OtpAuth />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      ) : (
        <div
          style={{
            color: "red",
            backgroundColor: "var(--body_forground)",
            height: "100vh",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontSize: "24px",
            fontWeight: "bold",
          }}
        >
          Please check your internet connection.
        </div>
      )}
    </>
  );
};

export default Allroutes;
