import "./styles/tailwind.css";

import { ThemeModeProvider } from "@metaverse-systems/llm-tutor-shared";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { LandingPage } from "./pages/landing";
import { LLMProfiles } from "./pages/settings";
import { SettingsPage } from "./pages/settings/SettingsPage";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing root element for frontend bootstrap");
}

const pathname = window.location?.pathname || "/";

let PageComponent;
if (pathname === "/settings") {
  PageComponent = SettingsPage;
} else if (pathname.startsWith("/settings/llm")) {
  PageComponent = LLMProfiles;
} else {
  PageComponent = LandingPage;
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeModeProvider>
      <PageComponent />
    </ThemeModeProvider>
  </StrictMode>
);
