import { describeProject } from "@metaverse-systems/llm-tutor-shared";

export function main(): void {
  const summary = describeProject();
  console.log("LLM Tutor backend starting...", summary);
}

main();
