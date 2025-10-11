import "./styles/tailwind.css";

import { ThemeModeProvider } from "@metaverse-systems/llm-tutor-shared";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { LandingPage } from "./pages/landing";
import { LLMProfiles } from "./pages/settings";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing root element for frontend bootstrap");
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeModeProvider>
      {window.location?.pathname.startsWith("/settings/llm") ? <LLMProfiles /> : <LandingPage />}
    </ThemeModeProvider>
  </StrictMode>
);
