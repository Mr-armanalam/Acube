import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import { Provider } from "react-redux";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { store } from "./store";
import { queryClient } from "./query/client";
import { InternetStatusProvider } from "./utils/internetStatusContext";
import ThemeProvider from "./context/ThemeProvider";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}
const root = ReactDOM.createRoot(rootElement);

root.render(
  <InternetStatusProvider>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <GoogleOAuthProvider clientId={import.meta.env.VITE_CLIENT_ID}>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </GoogleOAuthProvider>
        {import.meta.env.DEV ? (
          <ReactQueryDevtools initialIsOpen={false} />
        ) : null}
      </QueryClientProvider>
    </Provider>
  </InternetStatusProvider>,
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
