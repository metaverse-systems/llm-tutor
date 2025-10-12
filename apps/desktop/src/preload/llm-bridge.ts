import { ipcRenderer } from "electron";

import type { TelemetryPreference } from "../../../../packages/shared/src/contracts/preferences";
import type { TestPromptResult } from "../../../../packages/shared/src/llm/schemas";
import type {
	ActivateProfilePayload,
	ActivateProfileResult,
	CreateProfilePayload,
	CreateProfileResult,
	DeleteProfilePayload,
	DeleteProfileResult,
	ListProfilesResult,
	UpdateProfilePayload,
	UpdateProfileResult
} from "../../../backend/src/services/llm/profile.service";
import type { TestPromptRequest } from "../../../backend/src/services/llm/test-prompt.service";
import type { DiscoveryResult } from "../main/llm/auto-discovery";

export const LLM_IPC_CHANNELS = Object.freeze({
	list: "llm:profiles:list",
	create: "llm:profiles:create",
	update: "llm:profiles:update",
	delete: "llm:profiles:delete",
	activate: "llm:profiles:activate",
	testPrompt: "llm:profiles:test",
	discover: "llm:profiles:discover"
});

export const SETTINGS_IPC_CHANNELS = Object.freeze({
	navigate: "settings:navigate",
	telemetryGet: "settings:telemetry:get",
	telemetrySet: "settings:telemetry:set"
});

export interface SuccessResponse<T> {
	success: true;
	data: T;
	timestamp: number;
}

export interface ErrorResponse {
	error: string;
	message: string;
	details?: unknown;
	timestamp: number;
}

export type InvokeResult<T> = SuccessResponse<T> | ErrorResponse;

export interface DiscoverProfilesPayload {
	force?: boolean;
}

export interface LlmRendererBridge {
	listProfiles(): Promise<InvokeResult<ListProfilesResult>>;
	createProfile(payload: CreateProfilePayload): Promise<InvokeResult<CreateProfileResult>>;
	updateProfile(payload: UpdateProfilePayload): Promise<InvokeResult<UpdateProfileResult>>;
	deleteProfile(payload: DeleteProfilePayload): Promise<InvokeResult<DeleteProfileResult>>;
	activateProfile(payload: ActivateProfilePayload): Promise<InvokeResult<ActivateProfileResult>>;
	testPrompt(payload?: TestPromptRequest): Promise<InvokeResult<TestPromptResult>>;
	discoverProfiles(payload?: DiscoverProfilesPayload): Promise<InvokeResult<DiscoveryResult>>;
}

export interface SettingsRendererBridge {
	navigateToSettings(): Promise<void>;
	telemetry: {
		getState(): Promise<TelemetryPreference>;
		setState(update: { enabled: boolean }): Promise<TelemetryPreference>;
	};
}

export const LLM_BRIDGE_KEY = "llmAPI" as const;

export function createLlmBridge(): LlmRendererBridge {
	return {
		listProfiles(): Promise<InvokeResult<ListProfilesResult>> {
			return ipcRenderer.invoke(LLM_IPC_CHANNELS.list) as Promise<InvokeResult<ListProfilesResult>>;
		},
		createProfile(payload: CreateProfilePayload): Promise<InvokeResult<CreateProfileResult>> {
			return ipcRenderer.invoke(
				LLM_IPC_CHANNELS.create,
				normalizePayload(payload)
			) as Promise<InvokeResult<CreateProfileResult>>;
		},
		updateProfile(payload: UpdateProfilePayload): Promise<InvokeResult<UpdateProfileResult>> {
			return ipcRenderer.invoke(
				LLM_IPC_CHANNELS.update,
				normalizePayload(payload)
			) as Promise<InvokeResult<UpdateProfileResult>>;
		},
		deleteProfile(payload: DeleteProfilePayload): Promise<InvokeResult<DeleteProfileResult>> {
			return ipcRenderer.invoke(
				LLM_IPC_CHANNELS.delete,
				normalizePayload(payload)
			) as Promise<InvokeResult<DeleteProfileResult>>;
		},
		activateProfile(payload: ActivateProfilePayload): Promise<InvokeResult<ActivateProfileResult>> {
			return ipcRenderer.invoke(
				LLM_IPC_CHANNELS.activate,
				normalizePayload(payload)
			) as Promise<InvokeResult<ActivateProfileResult>>;
		},
		testPrompt(payload?: TestPromptRequest): Promise<InvokeResult<TestPromptResult>> {
			return ipcRenderer.invoke(
				LLM_IPC_CHANNELS.testPrompt,
				normalizeOptionalPayload(payload)
			) as Promise<InvokeResult<TestPromptResult>>;
		},
		discoverProfiles(payload?: DiscoverProfilesPayload): Promise<InvokeResult<DiscoveryResult>> {
			return ipcRenderer.invoke(
				LLM_IPC_CHANNELS.discover,
				normalizeDiscoverPayload(payload)
			) as Promise<InvokeResult<DiscoveryResult>>;
		}
	};
}

function normalizePayload<T extends Record<string, unknown>>(payload: T): Record<string, unknown> {
	return { ...payload };
}

function normalizeOptionalPayload(payload?: TestPromptRequest): Record<string, unknown> {
	if (!payload) {
		return {};
	}

	const normalized: Record<string, unknown> = {};

	if (typeof payload.profileId === "string") {
		normalized.profileId = payload.profileId;
	}

	if (typeof payload.promptText === "string") {
		normalized.promptText = payload.promptText;
	}

	return normalized;
}

function normalizeDiscoverPayload(payload?: DiscoverProfilesPayload): Record<string, unknown> {
	if (!payload) {
		return {};
	}

	return payload.force === true ? { force: true } : {};
}

export function createSettingsBridge(): SettingsRendererBridge {
	return {
		navigateToSettings(): Promise<void> {
			return ipcRenderer.invoke(SETTINGS_IPC_CHANNELS.navigate) as Promise<void>;
		},
		telemetry: {
			getState(): Promise<TelemetryPreference> {
				return ipcRenderer.invoke(SETTINGS_IPC_CHANNELS.telemetryGet) as Promise<TelemetryPreference>;
			},
			setState(update: { enabled: boolean }): Promise<TelemetryPreference> {
				return ipcRenderer.invoke(SETTINGS_IPC_CHANNELS.telemetrySet, update) as Promise<TelemetryPreference>;
			}
		}
	};
}

export const LLM_TUTOR_KEY = "llmTutor" as const;

declare global {
	interface Window {
		llmAPI?: LlmRendererBridge;
	}
}
