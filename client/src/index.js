import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import { Provider } from "react-redux";
import { applyMiddleware, compose } from "redux";
import { legacy_createStore as createstore } from "redux";
import { thunk } from "redux-thunk";
import { GoogleOAuthProvider } from "@react-oauth/google";
import Reducers from "./Reducers";
import { InternetStatusProvider } from "./utils/internetStatusContext";
import ThemeProvider from "./context/ThemeProvider";
const store = createstore(Reducers, compose(applyMiddleware(thunk)));
const root = ReactDOM.createRoot(document.getElementById("root"));
// console.log(process.env.REACT_APP_CLIENT_ID);

root.render(
  <InternetStatusProvider>
    <Provider store={store}>
      <GoogleOAuthProvider clientId={process.env.REACT_APP_CLIENT_ID}>
        <ThemeProvider>
            <App />
        </ThemeProvider>
      </GoogleOAuthProvider>
    </Provider>
  </InternetStatusProvider>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
