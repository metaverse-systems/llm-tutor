import {
	consentEventLogSchema,
	type DiagnosticsPreferenceRecordPayload
} from "@metaverse-systems/llm-tutor-shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import {
	PreferenceConcurrencyError,
	PreferenceVaultUnavailableError,
	type DiagnosticsPreferenceAdapter
} from "../../../infra/preferences/index.js";

const preferenceUpdateSchema = z.object({
	highContrastEnabled: z.boolean(),
	reducedMotionEnabled: z.boolean(),
	remoteProvidersEnabled: z.boolean(),
	consentSummary: z.string().min(1).max(240),
	expectedLastUpdatedAt: z.string().datetime().optional(),
	consentEvent: consentEventLogSchema.optional()
});

export interface DiagnosticsPreferenceRoutesOptions {
	adapter: DiagnosticsPreferenceAdapter;
	onRecordUpdated: (payload: DiagnosticsPreferenceRecordPayload) => void;
	refreshSnapshot?: () => Promise<void>;
}

export function registerDiagnosticsPreferenceRoutes(
	app: FastifyInstance,
	options: DiagnosticsPreferenceRoutesOptions
): Promise<void> {
	const { adapter, onRecordUpdated, refreshSnapshot } = options;

	app.get(
		"/internal/diagnostics/preferences",
		async (_request: FastifyRequest, reply: FastifyReply) => {
			try {
				const record = await adapter.load();
				return reply.code(200).send(record);
			} catch (error) {
				if (error instanceof PreferenceVaultUnavailableError) {
					return reply.code(503).send({
						status: "session-only" as const,
						storageHealth: error.storageHealth
					});
				}

				throw error;
			}
		}
	);

	app.put(
		"/internal/diagnostics/preferences",
		async (request: FastifyRequest, reply: FastifyReply) => {
			const payload = preferenceUpdateSchema.parse(request.body);

			try {
				const result = await adapter.update({
					highContrastEnabled: payload.highContrastEnabled,
					reducedMotionEnabled: payload.reducedMotionEnabled,
					remoteProvidersEnabled: payload.remoteProvidersEnabled,
					consentSummary: payload.consentSummary,
					expectedLastUpdatedAt: payload.expectedLastUpdatedAt,
					consentEvent: payload.consentEvent,
					updatedBy: "backend"
				});

				onRecordUpdated(result.record);
				if (refreshSnapshot) {
					await refreshSnapshot();
				}

				return reply.code(200).send(result.record);
			} catch (error) {
				if (error instanceof PreferenceConcurrencyError) {
					return reply.code(409).send({
						error: error.code,
						message: error.message
					});
				}

				if (error instanceof PreferenceVaultUnavailableError) {
					return reply.code(503).send({
						status: "session-only" as const,
						storageHealth: error.storageHealth
					});
				}

				throw error;
			}
		}
	);

	return Promise.resolve();
}
