import React, { Suspense, lazy } from "react";
import { Navigate, Routes, Route, useParams } from "react-router";
import Home from "./Pages/Home/Home";
import { useInternetStatus } from "./utils/internetStatusContext";
import { useAppSelector } from "./store";
import LoadingCard from "./Component/LoadingCard";

// Phase 2b: routes are code-split with React.lazy — the player and the
// StreamRoom (simple-peer + recordrtc) are the heavy chunks and no longer
// ship in the initial bundle. Home stays eager so first paint is fast.
const Search = lazy(() => import("./Pages/Search/Search"));
const Channel = lazy(() => import("./Pages/Channel/Channel"));
const Chat = lazy(() => import("./Pages/chat/Chat"));
const StreamRoom = lazy(() => import("./Pages/videostream/StreamRoom"));
const OtpAuth = lazy(() => import("./Pages/Auth/OTP_Auth"));
const PaymentStatus = lazy(() => import("./Component/PaymentStatus"));
// Phase 5 — Creator Studio, rebuilt Watch, History/Library hub, Playlist.
const StudioDashboard = lazy(() => import("./Pages/Studio/Dashboard"));
const StudioContent = lazy(() => import("./Pages/Studio/Content"));
const StudioAnalytics = lazy(() => import("./Pages/Studio/Analytics"));
const StudioComments = lazy(() => import("./Pages/Studio/Comments"));
const StudioSettings = lazy(() => import("./Pages/Studio/Settings"));
const StudioUpload = lazy(() => import("./Pages/Studio/UploadWizard"));
const Watch = lazy(() => import("./Pages/Watch/Watch"));
const HistoryPage = lazy(() => import("./Pages/History/History"));
const LibraryHub = lazy(() => import("./Pages/Library/LibraryHub"));
const PlaylistPage = lazy(() => import("./Pages/Playlist/Playlist"));

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

// Phase 5: old video-page URLs redirect to the rebuilt Watch page.
const VideopageRedirect = () => {
  const { vid } = useParams();
  return <Navigate to={`/watch/${vid ?? ""}`} replace />;
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
}: {
  seteditcreatechanelbtn: (v: boolean) => void;
}) => {
  const isOnline = useInternetStatus();
  return (
    <>
      {isOnline ? (
        <Suspense fallback={<LoadingCard />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search/:Searchquery" element={<Search />} />
            {/* Phase 5: the old /videopage/:id redirects to /watch/:id. */}
            <Route
              path="/videopage/:vid"
              element={<VideopageRedirect />}
            />
            <Route path="/watch/:id" element={<Watch />} />
            <Route
              path="/studio"
              element={
                <RequireAuth>
                  <StudioDashboard />
                </RequireAuth>
              }
            />
            <Route
              path="/studio/content"
              element={
                <RequireAuth>
                  <StudioContent />
                </RequireAuth>
              }
            />
            <Route
              path="/studio/analytics"
              element={
                <RequireAuth>
                  <StudioAnalytics />
                </RequireAuth>
              }
            />
            <Route
              path="/studio/comments"
              element={
                <RequireAuth>
                  <StudioComments />
                </RequireAuth>
              }
            />
            <Route
              path="/studio/upload"
              element={
                <RequireAuth>
                  <StudioUpload />
                </RequireAuth>
              }
            />
            <Route
              path="/studio/settings"
              element={
                <RequireAuth>
                  <StudioSettings />
                </RequireAuth>
              }
            />
            <Route
              path="/history"
              element={
                <RequireAuth>
                  <HistoryPage />
                </RequireAuth>
              }
            />
            {/* No `caseSensitive`: React Router matches case-insensitively
              by default, so the pre-Phase-5 capital-L URL /Library
              (bookmarks, Phase 4 e2e) still hits this guarded route
              instead of the 404 page. */}
            <Route
              path="/library"
              element={
                <RequireAuth>
                  <LibraryHub />
                </RequireAuth>
              }
            />
            {/* Phase 5 fix: public read — visibility rules are
              server-side, so a logged-out visitor can open a public /
              unlisted playlist. Owner mutations are guarded in the
              page itself, not at the route. */}
            <Route path="/playlist/:id" element={<PlaylistPage />} />
            {/* Legacy /Likedvideo, /Watchhistory, /Watchlater and
              /Yourvideo pages are deleted (follow-up): liked / history
              / watch-later live in /library + /history, your videos in
              /studio/content. Old bookmarks to those URLs now 404. */}
            <Route path="/paymentstatus" element={<PaymentStatus />} />
            <Route
              path="/channel/:cid"
              element={
                <Channel seteditcreatechanelbtn={seteditcreatechanelbtn} />
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
