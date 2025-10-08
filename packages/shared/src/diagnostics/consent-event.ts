import { z } from "zod";

export const consentEventLogSchema = z.any();

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

export function parseConsentEventLog(_input: unknown): ConsentEventLog {
	throw new Error("parseConsentEventLog not implemented");
}
