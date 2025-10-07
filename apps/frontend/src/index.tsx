import { describeProject } from "@metaverse-systems/llm-tutor-shared";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing root element for frontend bootstrap");
}

const summary = describeProject();

createRoot(rootElement).render(
  <StrictMode>
    <main>
      <h1>{summary.name}</h1>
      <p>{summary.description}</p>
      <section>
        <h2>Core Principles</h2>
        <ul>
          {summary.principles.map((principle) => (
            <li key={principle}>{principle}</li>
          ))}
        </ul>
      </section>
    </main>
  </StrictMode>
);
