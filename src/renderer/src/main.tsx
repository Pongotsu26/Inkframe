import React from "react";
import { createRoot } from "react-dom/client";
import "./styles/inkframe-theme.css";
import "./styles/global.css";
import { App } from "./App";

if (/Macintosh|Mac OS X/.test(navigator.userAgent))
  document.documentElement.classList.add("platform-darwin");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
