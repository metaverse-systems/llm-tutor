import { describe, expect, it } from "vitest";

import { consentEventLogSchema, parseConsentEventLog } from "../consent-event";
import {
	diagnosticsPreferenceRecordSchema,
	parseDiagnosticsPreferenceRecord
} from "../preference-record";
import { parseStorageHealthAlert, storageHealthAlertSchema } from "../storage-health";

describe("diagnostics preference schemas", () => {
	const baseConsentEvent = {
		eventId: "28f338c7-8a5f-464a-86ff-d8b7a2a48c2c",
		occurredAt: "2025-10-07T09:45:00.000Z",
		actor: "learner" as const,
		previousState: "disabled" as const,
		nextState: "enabled" as const,
		noticeVersion: "v1",
		channel: "ui-toggle" as const
	};

	const baseStorageAlert = {
		status: "degraded" as const,
		detectedAt: "2025-10-07T09:46:00.000Z",
		reason: "disk-full" as const,
		message: "Disk nearly full",
		recommendedAction: "Free 500MB and retry",
		retryAvailableAt: "2025-10-07T10:00:00.000Z"
	};

	const basePreferencePayload = {
		id: "f8345500-7461-47b1-8f10-4e7b46ec8f75",
		highContrastEnabled: true,
		reducedMotionEnabled: false,
		remoteProvidersEnabled: false,
		lastUpdatedAt: "2025-10-07T09:45:30.000Z",
		updatedBy: "renderer" as const,
		consentSummary: "High contrast enabled during onboarding",
		consentEvents: [baseConsentEvent],
		storageHealth: baseStorageAlert
	};

	it("parses a valid diagnostics preference record and normalises datetimes", () => {
		const parsed = diagnosticsPreferenceRecordSchema.parse(basePreferencePayload);
		expect(parsed.highContrastEnabled).toBe(true);

		const normalised = parseDiagnosticsPreferenceRecord(basePreferencePayload);
		expect(normalised.lastUpdatedAt).toBeInstanceOf(Date);
		expect(normalised.consentEvents[0]?.occurredAt).toBeInstanceOf(Date);
		expect(normalised.storageHealth?.detectedAt).toBeInstanceOf(Date);
		expect(normalised.storageHealth?.retryAvailableAt).toBeInstanceOf(Date);
	});

	it("rejects preference records with more than three consent events", () => {
		const payload = {
			...basePreferencePayload,
			consentEvents: [
				baseConsentEvent,
				{ ...baseConsentEvent, eventId: "441bfbdb-ef21-49bc-a61a-6f0fdf99d494", occurredAt: "2025-10-07T09:46:00.000Z" },
				{ ...baseConsentEvent, eventId: "aaec8c6d-a9c4-4ba5-9d49-6b8ef48237cc", occurredAt: "2025-10-07T09:47:00.000Z" },
				{ ...baseConsentEvent, eventId: "6e06a37a-784f-4091-9ac0-755abe2186c3", occurredAt: "2025-10-07T09:48:00.000Z" }
			]
		};

		expect(() => diagnosticsPreferenceRecordSchema.parse(payload)).toThrowError();
	});

	it("rejects consent events that do not change state", () => {
		expect(() =>
			consentEventLogSchema.parse({
				...baseConsentEvent,
				nextState: "disabled"
			})
		).toThrowError();
	});

	it("normalises consent events into domain objects", () => {
		const consent = parseConsentEventLog(baseConsentEvent);
		expect(consent.occurredAt).toBeInstanceOf(Date);
		expect(consent.previousState).toBe("disabled");
	});

	it("rejects storage alerts with unsupported reason values", () => {
		expect(() =>
			storageHealthAlertSchema.parse({
				...baseStorageAlert,
				reason: "unexpected"
			})
		).toThrowError();
	});

	it("parses storage alerts and converts retry timestamps when present", () => {
		const alert = parseStorageHealthAlert(baseStorageAlert);
		expect(alert.retryAvailableAt).toBeInstanceOf(Date);
	});
});
