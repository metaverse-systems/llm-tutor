import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";

type DiagnosticsSnapshotSeed = {
  id: string;
  generatedAt: string;
  backendStatus: "running" | "stopped" | "error";
  backendMessage?: string;
  rendererUrl: string;
  llmStatus: "connected" | "unreachable" | "disabled";
  llmEndpoint?: string;
  logDirectory: string;
  snapshotCountLast30d?: number;
  diskUsageBytes: number;
  warnings?: string[];
  activePreferences: {
    highContrast: boolean;
    reduceMotion: boolean;
    updatedAt: string;
  };
};

interface DiagnosticsTestHarness {
  app: DiagnosticsTestServer;
  seedSnapshot(seed: DiagnosticsSnapshotSeed): Promise<void>;
  clearSnapshots(): Promise<void>;
  setBackendState(state: "ready" | "warming" | "error", message?: string): Promise<void>;
  setRefreshCooldown(seconds: number): void;
  advanceTime(milliseconds: number): void;
  close(): Promise<void>;
}

interface DiagnosticsTestServer {
  inject(request: {
    method: "GET" | "POST";
    url: string;
    payload?: unknown;
  }): Promise<DiagnosticsTestResponse>;
  close(): Promise<void>;
}

interface DiagnosticsTestResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

interface DiagnosticsApiModule {
  createDiagnosticsTestHarness?: (options?: {
    initialSnapshot?: DiagnosticsSnapshotSeed | null;
  }) => Promise<DiagnosticsTestHarness>;
}

const diagnosticsSnapshotSchema = z.object({
  id: z.string().uuid(),
  generatedAt: z.string().datetime(),
  backendStatus: z.enum(["running", "stopped", "error"]),
  backendMessage: z.string().optional(),
  rendererUrl: z.string().url(),
  llmStatus: z.enum(["connected", "unreachable", "disabled"]),
  llmEndpoint: z.string().optional(),
  logDirectory: z.string().min(1),
  snapshotCountLast30d: z.number().int().nonnegative().optional(),
  diskUsageBytes: z.number().int().nonnegative(),
  warnings: z.array(z.string()).optional(),
  activePreferences: z.object({
    highContrast: z.boolean(),
    reduceMotion: z.boolean(),
    updatedAt: z.string().datetime()
  })
});

const errorResponseSchema = z.object({
  errorCode: z.string(),
  message: z.string(),
  retryAfterSeconds: z.number().int().nonnegative().optional()
});

let harness: DiagnosticsTestHarness | null = null;

async function loadHarness(initialSnapshot?: DiagnosticsSnapshotSeed | null) {
  const module = (await import("../../src/api/diagnostics/index")) as DiagnosticsApiModule;
  const factory = module.createDiagnosticsTestHarness;

  expect(factory, "Expected createDiagnosticsTestHarness to be exported from apps/backend/src/api/diagnostics").toBeTypeOf("function");

  const instance = await factory!(
    initialSnapshot === undefined ? undefined : { initialSnapshot }
  );

  assertDiagnosticsHarness(instance);
  harness = instance;
  return instance;
}

function assertDiagnosticsHarness(value: unknown): asserts value is DiagnosticsTestHarness {
  if (!value || typeof value !== "object") {
    throw new Error("Diagnostics test harness must be an object with testing utilities");
  }

  const candidate = value as DiagnosticsTestHarness;
  const missingMethod = [
    "app",
    "seedSnapshot",
    "clearSnapshots",
    "setBackendState",
    "setRefreshCooldown",
    "advanceTime",
    "close"
  ].find((method) => !(method in candidate));

  if (missingMethod) {
    throw new Error(
      `Diagnostics test harness must implement ${missingMethod}() to satisfy contract coverage`
    );
  }

  if (
    typeof candidate.app !== "object" ||
    typeof candidate.app?.inject !== "function" ||
    typeof candidate.app?.close !== "function"
  ) {
    throw new Error(
      "Diagnostics test harness must expose a Fastify-like app with inject() and close() helpers"
    );
  }
}

async function parseJson<T>(response: DiagnosticsTestResponse, schema: z.ZodSchema<T>) {
  const contentType = response.headers["content-type"] ?? "";
  expect(contentType).toContain("application/json");
  const payload = JSON.parse(response.body) as unknown;
  return schema.parse(payload);
}

describe("Diagnostics API contract", () => {
  beforeEach(async () => {
    if (harness) {
      await harness.clearSnapshots();
      await harness.setBackendState("ready");
    }
  });

  afterEach(async () => {
    if (harness) {
      await harness.app.close();
      await harness.close();
      harness = null;
    }
  });

  describe("GET /internal/diagnostics/summary", () => {
    it("responds with the most recent diagnostics snapshot", async () => {
      const testHarness = await loadHarness();

      const seed: DiagnosticsSnapshotSeed = {
        id: "d2ac06f8-3586-4a05-9f11-612e8849fdc6",
        generatedAt: "2025-10-07T10:00:00.000Z",
        backendStatus: "running",
        backendMessage: "Backend online",
        rendererUrl: "http://localhost:5173",
        llmStatus: "disabled",
        logDirectory: "/tmp/llm-tutor/diagnostics",
        diskUsageBytes: 42_000,
        snapshotCountLast30d: 3,
        warnings: ["Disk usage at 8% of quota"],
        activePreferences: {
          highContrast: true,
          reduceMotion: false,
          updatedAt: "2025-10-07T09:45:00.000Z"
        }
      };

      await testHarness.seedSnapshot(seed);

      const response = await testHarness.app.inject({
        method: "GET",
        url: "/internal/diagnostics/summary"
      });

      expect(response.statusCode).toBe(200);
      const snapshot = await parseJson(response, diagnosticsSnapshotSchema);
      expect(snapshot.id).toBe(seed.id);
      expect(snapshot.backendStatus).toBe("running");
      expect(snapshot.activePreferences.highContrast).toBe(true);
    });

    it("surfaces backend warm-up state as 503 while no snapshot exists", async () => {
      const testHarness = await loadHarness(null);
      await testHarness.clearSnapshots();
      await testHarness.setBackendState("warming");

      const response = await testHarness.app.inject({
        method: "GET",
        url: "/internal/diagnostics/summary"
      });

      expect(response.statusCode).toBe(503);
      const error = await parseJson(response, errorResponseSchema);
      expect(error.errorCode).toBe("DIAGNOSTICS_NOT_READY");
    });

    it("returns the latest error snapshot details when backend crashed", async () => {
      const testHarness = await loadHarness();

      const crashSnapshot: DiagnosticsSnapshotSeed = {
        id: "5a13a4eb-22c1-4b43-9fd9-6c82f90f2af0",
        generatedAt: "2025-10-07T11:00:00.000Z",
        backendStatus: "error",
        backendMessage: "Process exited unexpectedly with code 9",
        rendererUrl: "http://localhost:5173",
        llmStatus: "unreachable",
        llmEndpoint: "http://127.0.0.1:11434",
        logDirectory: "/tmp/llm-tutor/diagnostics",
        diskUsageBytes: 200_000,
        snapshotCountLast30d: 7,
        warnings: ["Backend recently crashed"],
        activePreferences: {
          highContrast: false,
          reduceMotion: true,
          updatedAt: "2025-10-07T10:58:00.000Z"
        }
      };

      await testHarness.seedSnapshot(crashSnapshot);
      await testHarness.setBackendState("error", crashSnapshot.backendMessage);

      const response = await testHarness.app.inject({
        method: "GET",
        url: "/internal/diagnostics/summary"
      });

      expect(response.statusCode).toBe(200);
      const parsed = await parseJson(response, diagnosticsSnapshotSchema);
      expect(parsed.backendStatus).toBe("error");
      expect(parsed.backendMessage).toBe(crashSnapshot.backendMessage);
      expect(parsed.warnings).toContain("Backend recently crashed");
    });
  });

  describe("POST /internal/diagnostics/refresh", () => {
    it("creates a fresh snapshot and returns it to the caller", async () => {
      const testHarness = await loadHarness();
      const existing: DiagnosticsSnapshotSeed = {
        id: "293e1da6-3be4-41b9-8a1e-7fe5d9782a0b",
        generatedAt: "2025-10-07T08:30:00.000Z",
        backendStatus: "running",
        rendererUrl: "http://localhost:5173",
        llmStatus: "disabled",
        logDirectory: "/tmp/llm-tutor/diagnostics",
        diskUsageBytes: 100_000,
        activePreferences: {
          highContrast: false,
          reduceMotion: false,
          updatedAt: "2025-10-07T08:00:00.000Z"
        }
      };

      await testHarness.seedSnapshot(existing);

      const response = await testHarness.app.inject({
        method: "POST",
        url: "/internal/diagnostics/refresh"
      });

      expect(response.statusCode).toBe(202);
      const snapshot = await parseJson(response, diagnosticsSnapshotSchema);
      expect(snapshot.generatedAt).not.toBe(existing.generatedAt);
      expect(snapshot.id).not.toBe(existing.id);
    });

    it("enforces refresh cooldown and responds with retry instructions", async () => {
      const testHarness = await loadHarness();
      testHarness.setRefreshCooldown(300);

      const firstResponse = await testHarness.app.inject({
        method: "POST",
        url: "/internal/diagnostics/refresh"
      });

      expect(firstResponse.statusCode).toBe(202);

      const secondResponse = await testHarness.app.inject({
        method: "POST",
        url: "/internal/diagnostics/refresh"
      });

      expect(secondResponse.statusCode).toBe(429);
      const error = await parseJson(secondResponse, errorResponseSchema);
      expect(error.errorCode).toBe("DIAGNOSTICS_REFRESH_RATE_LIMITED");
      expect(error.retryAfterSeconds).toBeGreaterThan(0);

      testHarness.advanceTime(error.retryAfterSeconds! * 1000);

      const thirdResponse = await testHarness.app.inject({
        method: "POST",
        url: "/internal/diagnostics/refresh"
      });

      expect(thirdResponse.statusCode).toBe(202);
    });
  });
});
