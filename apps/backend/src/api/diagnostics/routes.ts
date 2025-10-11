import {
  serializeDiagnosticsSnapshot,
  type DiagnosticsPreferenceRecordPayload,
  type DiagnosticsSnapshot
} from "@metaverse-systems/llm-tutor-shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { registerDiagnosticsPreferenceRoutes } from "./preferences/routes.js";
import { createDiagnosticsExport, DIAGNOSTICS_EVENTS_FILE_NAME } from "../../infra/logging/index.js";
import {
  type DiagnosticsPreferenceAdapter
} from "../../infra/preferences/index.js";
import type {
  DiagnosticsSnapshotRepository,
  DiagnosticsSnapshotService
} from "../../services/diagnostics/index.js";

export type BackendLifecycleState = "ready" | "warming" | "error";

export interface RefreshRateLimiter {
  getRetryAfterSeconds(now: Date): number;
  recordSuccessfulRefresh(now: Date): void;
}

export interface DiagnosticsSnapshotStore extends DiagnosticsSnapshotRepository {
  save(snapshot: DiagnosticsSnapshot): Promise<void>;
  getLatest(): Promise<DiagnosticsSnapshot | null>;
  clear(): Promise<void>;
  countSnapshotsSince(date: Date): Promise<number>;
}

export interface DiagnosticsRoutesOptions {
  store: DiagnosticsSnapshotStore;
  snapshotService: DiagnosticsSnapshotService;
  refreshLimiter: RefreshRateLimiter;
  getBackendLifecycleState: () => BackendLifecycleState;
  now: () => Date;
  retentionWindowDays?: number;
  preferences: {
	adapter: DiagnosticsPreferenceAdapter;
	onRecordUpdated: (payload: DiagnosticsPreferenceRecordPayload) => void;
  };
}

export async function registerDiagnosticsRoutes(
  app: FastifyInstance,
  options: DiagnosticsRoutesOptions
): Promise<void> {
  const { store, snapshotService, refreshLimiter, getBackendLifecycleState, now } = options;

  await registerDiagnosticsPreferenceRoutes(app, {
    adapter: options.preferences.adapter,
    onRecordUpdated: options.preferences.onRecordUpdated,
    refreshSnapshot: async () => {
      const snapshot = await snapshotService.generateSnapshot();
      await store.save(snapshot);
    }
  });

  app.get(
    "/internal/diagnostics/summary",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const latest = await store.getLatest();

      if (!latest) {
        const lifecycleState = getBackendLifecycleState();
        if (lifecycleState === "warming") {
          return reply.code(503).send({
            errorCode: "DIAGNOSTICS_NOT_READY",
            message: "Diagnostics subsystem is warming up"
          });
        }

        return reply.code(404).send({
          errorCode: "DIAGNOSTICS_NOT_FOUND",
          message: "No diagnostics snapshots are available yet"
        });
      }

      return reply.code(200).send(serializeDiagnosticsSnapshot(latest));
    }
  );

  app.post(
    "/internal/diagnostics/refresh",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const effectiveNow = now();
      const retryAfter = refreshLimiter.getRetryAfterSeconds(effectiveNow);

      if (retryAfter > 0) {
        return reply
          .code(429)
          .send({
            errorCode: "DIAGNOSTICS_REFRESH_RATE_LIMITED",
            message: "Diagnostics snapshot refresh is on cooldown",
            retryAfterSeconds: retryAfter
          });
      }

      const pendingSnapshot = await snapshotService.generateSnapshot();

      await store.save(pendingSnapshot);
      refreshLimiter.recordSuccessfulRefresh(effectiveNow);

      return reply.code(202).send(serializeDiagnosticsSnapshot(pendingSnapshot));
    }
  );

  app.get(
    "/internal/diagnostics/export",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const exportResult = await createDiagnosticsExport({
        store,
        now,
        eventsDirectory: process.env.LLM_TUTOR_DIAGNOSTICS_DIR ?? null,
        eventsFileName: DIAGNOSTICS_EVENTS_FILE_NAME
      });

      if (!exportResult) {
        return reply.code(204).send();
      }

      return reply
        .header("content-type", exportResult.contentType)
        .header("content-disposition", `attachment; filename="${exportResult.filename}"`)
        .code(200)
        .send(exportResult.body);
    }
  );
}
