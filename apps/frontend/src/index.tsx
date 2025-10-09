import "./styles/tailwind.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { LandingPage } from "./pages/landing";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing root element for frontend bootstrap");
}

createRoot(rootElement).render(
  <StrictMode>
    <LandingPage />
  </StrictMode>
);
