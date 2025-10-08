import { describeProject } from "@metaverse-systems/llm-tutor-shared";
import { createDiagnosticsApp, type DiagnosticsAppOptions } from "./api/diagnostics";
import { createLlmProbe } from "./services/diagnostics";

const DEFAULT_PORT = 4319;
const DEFAULT_HOST = "127.0.0.1";

async function main(): Promise<void> {
  const summary = describeProject();
  console.log("LLM Tutor backend starting...", summary);

  const port = Number.parseInt(process.env.DIAGNOSTICS_PORT ?? "", 10);
  const host = process.env.DIAGNOSTICS_HOST?.trim() || DEFAULT_HOST;
  const rendererUrl = process.env.DIAGNOSTICS_RENDERER_URL ?? "http://localhost:5173";
  const llmEndpoint = process.env.LLM_TUTOR_LLM_ENDPOINT ?? null;

  const snapshotServiceOverrides: DiagnosticsAppOptions["snapshotServiceOverrides"] = {
    rendererUrlProvider: () => rendererUrl,
    llmProbe: createLlmProbe({ endpoint: llmEndpoint ?? undefined })
  };

  const app = await createDiagnosticsApp({ snapshotServiceOverrides });

  const effectivePort = Number.isFinite(port) ? port : DEFAULT_PORT;

  try {
    await app.listen({ port: effectivePort, host });
    console.log(`Diagnostics API listening at http://${host}:${effectivePort}`);
  } catch (error) {
    console.error("Failed to start diagnostics backend", error);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}. Shutting down diagnostics backend.`);
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
