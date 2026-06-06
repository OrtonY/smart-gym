import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./styles.css";

const preferredTheme = localStorage.getItem("smart-gym-theme") ?? "dark";
document.documentElement.dataset.theme = preferredTheme;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
