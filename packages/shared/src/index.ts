export * from "./diagnostics/index.js";
export * from "./diagnostics/factories.js";

export interface ProjectSummary {
  name: string;
  description: string;
  principles: string[];
}

export function describeProject(): ProjectSummary {
  return {
    name: "LLM Tutor",
    description:
      "Self-hostable, MIT-licensed tutoring platform that uses local-first LLM orchestration.",
    principles: [
      "Learner-First Accessibility",
      "Curriculum Integrity & Assessment",
      "Local-First Privacy & Data Stewardship",
      "Transparent & Controllable AI Operations",
      "Quality-Driven TypeScript Web Delivery"
    ]
  };
}
