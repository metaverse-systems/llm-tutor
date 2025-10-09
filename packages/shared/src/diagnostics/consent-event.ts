import { z } from "zod";

export const CONSENT_EVENT_WINDOW = 3;

export const consentEventLogSchema = z
	.object({
		eventId: z.string().uuid(),
		occurredAt: z.string().datetime(),
		actor: z.enum(["learner", "maintainer"]),
		previousState: z.enum(["disabled", "enabled"]),
		nextState: z.enum(["disabled", "enabled"]),
		noticeVersion: z.string().min(1).max(120),
		channel: z.enum(["ui-toggle", "config-migration"])
	})
	.refine((payload) => payload.previousState !== payload.nextState, {
		message: "Consent transition must change state",
		path: ["nextState"]
	});

export type ConsentEventLogPayload = z.infer<typeof consentEventLogSchema>;

export interface ConsentEventLog {
	eventId: string;
	occurredAt: Date;
	actor: "learner" | "maintainer";
	previousState: "disabled" | "enabled";
	nextState: "disabled" | "enabled";
	noticeVersion: string;
	channel: "ui-toggle" | "config-migration";
}

export function parseConsentEventLog(input: unknown): ConsentEventLog {
	const payload = consentEventLogSchema.parse(input);
	return {
		eventId: payload.eventId,
		occurredAt: new Date(payload.occurredAt),
		actor: payload.actor,
		previousState: payload.previousState,
		nextState: payload.nextState,
		noticeVersion: payload.noticeVersion,
		channel: payload.channel
	};
}

export function serializeConsentEventLog(event: ConsentEventLog): ConsentEventLogPayload {
	return {
		eventId: event.eventId,
		occurredAt: event.occurredAt.toISOString(),
		actor: event.actor,
		previousState: event.previousState,
		nextState: event.nextState,
		noticeVersion: event.noticeVersion,
		channel: event.channel
	};
}

export function normalizeConsentEvents(
	events: readonly (ConsentEventLog | ConsentEventLogPayload)[]
): ConsentEventLog[] {
	return events
		.map((event) => {
			if (event && event.occurredAt instanceof Date) {
				return event as ConsentEventLog;
			}
			return parseConsentEventLog(event);
		})
		.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
		.slice(-CONSENT_EVENT_WINDOW);
}

export function appendConsentEvent(
	events: readonly (ConsentEventLog | ConsentEventLogPayload)[],
	additional: ConsentEventLog | ConsentEventLogPayload
): ConsentEventLog[] {
	const normalized = normalizeConsentEvents([...events, additional]);
	return normalized;
}
