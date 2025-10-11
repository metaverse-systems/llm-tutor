import {
  type DraftProfile,
  type ProfileIpcChannel,
  type ProfileOperationRequest,
  type ProfileOperationResponse,
  type ProfileSummary,
  type ProfileDiagnosticsSummary
} from "@metaverse-systems/llm-tutor-shared/src/contracts/llm-profile-ipc";
import { randomUUID } from "node:crypto";

import { ProfileIpcDiagnosticsRecorder } from "../../src/main/diagnostics/profile-ipc.recorder";
import {
  createProfileIpcRouter,
  type ProfileIpcRouterRegistration,
  type ProfileServiceHandlers
} from "../../src/main/ipc/profile-ipc.router";
import { SafeStorageOutageService } from "../../src/main/services/safe-storage-outage.service";

interface ProfileServiceOverrides {
  list?: (filter?: unknown) => unknown;
  create?: (draft: DraftProfile) => unknown;
  update?: (profileId: string, changes: Partial<DraftProfile>) => unknown;
  delete?: (profileId: string, successorProfileId?: string | null) => unknown;
  activate?: (profileId: string, force?: boolean) => unknown;
}

export interface ProfileIpcHarnessOptions {
  profileService?: ProfileServiceOverrides;
  testPromptService?: {
    execute?: (profileId: string, promptOverride?: string, timeoutMs?: number) => unknown;
  };
  autoDiscoveryService?: {
    discover?: (scope: unknown) => unknown;
  };
  safeStorageAvailable?: boolean;
}

export interface ProfileIpcHarnessInvocation<TResponse = ProfileOperationResponse> {
  response: TResponse;
  diagnostics: unknown[];
  durationMs: number;
}

export interface ProfileIpcHarness {
  invoke<TResponse = ProfileOperationResponse>(
    channel: ProfileIpcChannel,
    payload: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Promise<ProfileIpcHarnessInvocation<TResponse>>;
  setSafeStorageAvailability(isAvailable: boolean): void;
  isChannelRegistered(channel: ProfileIpcChannel): boolean;
  diagnostics: {
    events: unknown[];
  };
  dispose(): Promise<void>;
}

const CHANNEL_OPERATION_MAP: Record<ProfileIpcChannel, ProfileOperationRequest["type"]> = {
  "llmProfile:list": "list",
  "llmProfile:create": "create",
  "llmProfile:update": "update",
  "llmProfile:delete": "delete",
  "llmProfile:activate": "activate",
  "llmProfile:test": "test",
  "llmProfile:discover": "discover"
};

const DEFAULT_OPERATOR_CONTEXT = {
  operatorId: randomUUID(),
  operatorRole: "instructional_technologist" as const,
  locale: "en-US"
};

export function createProfileIpcHarness(
  options: ProfileIpcHarnessOptions = {}
): Promise<ProfileIpcHarness> {
  const outageService = new SafeStorageOutageService();
  outageService.setAvailability(options.safeStorageAvailable !== false);
  const diagnosticsRecorder = new ProfileIpcDiagnosticsRecorder();

  const profileServiceOverrides = options.profileService ?? {};
  const profileServiceHandlers: ProfileServiceHandlers = {
    listProfiles: async (filter) => {
      if (typeof profileServiceOverrides.list === "function") {
        const result = await Promise.resolve(profileServiceOverrides.list(filter));
        return normalizeListResult(result, filter?.includeDiagnostics === true);
      }

      return {
        profiles: [],
        diagnostics: filter?.includeDiagnostics ? [] : undefined
      };
    },
    createProfile: async (draftProfile) => {
      if (typeof profileServiceOverrides.create === "function") {
        const result = await Promise.resolve(profileServiceOverrides.create(draftProfile));
        return normalizeCreateResult(result);
      }

      throw new Error("Profile service create handler not provided");
    },
    updateProfile: async (profileId, changes) => {
      if (typeof profileServiceOverrides.update === "function") {
        const result = await Promise.resolve(profileServiceOverrides.update(profileId, changes));
        return normalizeUpdateResult(result);
      }

      throw new Error("Profile service update handler not provided");
    },
    deleteProfile: async (profileId, successorProfileId) => {
      if (typeof profileServiceOverrides.delete === "function") {
        const result = await Promise.resolve(profileServiceOverrides.delete(profileId, successorProfileId));
        return normalizeDeleteResult(result);
      }

      throw new Error("Profile service delete handler not provided");
    },
    activateProfile: async (profileId, force) => {
      if (typeof profileServiceOverrides.activate === "function") {
        const result = await Promise.resolve(profileServiceOverrides.activate(profileId, force));
        return normalizeActivateResult(result);
      }

      throw new Error("Profile service activate handler not provided");
    }
  };

  const testPromptServiceOverrides = options.testPromptService ?? {};
  const testPromptServiceHandlers = testPromptServiceOverrides.execute
    ? {
        execute: async (profileId: string, promptOverride?: string, timeoutMs?: number) => {
          const result = await Promise.resolve(
            testPromptServiceOverrides.execute!(profileId, promptOverride, timeoutMs)
          );
          return normalizeTestPromptResult(result);
        }
      }
    : undefined;

  const autoDiscoveryServiceOverrides = options.autoDiscoveryService ?? {};
  const autoDiscoveryServiceHandlers = autoDiscoveryServiceOverrides.discover
    ? {
        discover: async (scope: unknown) => {
          const result = await Promise.resolve(autoDiscoveryServiceOverrides.discover!(scope));
          return normalizeDiscoveryResult(result);
        }
      }
    : undefined;

  const router: ProfileIpcRouterRegistration = createProfileIpcRouter({
    profileService: profileServiceHandlers,
    testPromptService: testPromptServiceHandlers,
    autoDiscoveryService: autoDiscoveryServiceHandlers,
    diagnosticsRecorder,
    safeStorageOutageService: outageService,
    ipcMain: null,
    logger: console
  });

  return {
    async invoke<TResponse = ProfileOperationResponse>(
      channel: ProfileIpcChannel,
      payload: Record<string, unknown>,
      _metadata?: Record<string, unknown>
    ): Promise<ProfileIpcHarnessInvocation<TResponse>> {
      const envelope = buildEnvelope(channel, payload);
      const started = Date.now();
      const response = (await router.invoke(envelope)) as TResponse & ProfileOperationResponse;
      const finished = Date.now();
      return {
        response,
        diagnostics: diagnosticsRecorder.getBreadcrumbs(),
        durationMs: Math.max(response.durationMs ?? finished - started, finished - started)
      };
    },
    setSafeStorageAvailability(isAvailable: boolean): void {
      outageService.setAvailability(isAvailable);
    },
    isChannelRegistered(channel: ProfileIpcChannel): boolean {
      return router.isChannelRegistered(channel);
    },
    diagnostics: {
      get events(): unknown[] {
        return diagnosticsRecorder.getBreadcrumbs();
      }
    },
    dispose(): Promise<void> {
      router.dispose();
      return Promise.resolve();
    }
  };
}

function buildEnvelope(
  channel: ProfileIpcChannel,
  payload: Record<string, unknown>
): ProfileOperationRequestEnvelope {
  const type = CHANNEL_OPERATION_MAP[channel];
  const requestPayload = buildOperationPayload(type, payload);
  return {
    channel,
    requestId: randomUUID(),
    timestamp: Date.now(),
    context: { ...DEFAULT_OPERATOR_CONTEXT },
    payload: requestPayload
  };
}

interface ProfileOperationRequestEnvelope {
  channel: ProfileIpcChannel;
  requestId: string;
  timestamp: number;
  context: typeof DEFAULT_OPERATOR_CONTEXT;
  payload: ProfileOperationRequest;
}

function buildOperationPayload(
  type: ProfileOperationRequest["type"],
  payload: Record<string, unknown>
): ProfileOperationRequest {
  switch (type) {
    case "list":
      return {
        type,
        filter: payload.filter as (ProfileOperationRequest & { type: "list" }) extends { filter?: infer T }
          ? T
          : undefined
      } as ProfileOperationRequest;
    case "create":
      return {
        type,
        profile: payload.profile as DraftProfile
      };
    case "update":
      return {
        type,
        profileId: payload.profileId as string,
        changes: (payload.changes ?? {}) as DraftProfile
      } as ProfileOperationRequest;
    case "delete":
      return {
        type,
        profileId: payload.profileId as string,
        successorProfileId: (payload.successorProfileId as string | null | undefined) ?? null
      };
    case "activate":
      return {
        type,
        profileId: payload.profileId as string,
        force: payload.force as boolean | undefined
      };
    case "test":
      return {
        type,
        profileId: payload.profileId as string,
        promptOverride: payload.promptOverride as string | undefined,
        timeoutMs:
          typeof payload.timeoutMs === "number"
            ? payload.timeoutMs
            : 10000
      };
    case "discover":
      return {
        type,
        scope: payload.scope as (ProfileOperationRequest & { type: "discover" }) extends { scope: infer T }
          ? T
          : // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            never
      } as ProfileOperationRequest;
    default:
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`Unsupported operation type: ${type}`);
  }
}

function normalizeListResult(result: unknown, includeDiagnostics: boolean): {
  profiles: ProfileSummary[];
  diagnostics?: ProfileDiagnosticsSummary[];
} {
  if (!result || typeof result !== "object") {
    return {
      profiles: [],
      diagnostics: includeDiagnostics ? [] : undefined
    };
  }

  const candidate = result as {
    profiles?: unknown;
    diagnostics?: unknown;
  };

  const profiles = Array.isArray(candidate.profiles)
    ? (candidate.profiles as ProfileSummary[])
    : [];

  const diagnostics = includeDiagnostics && Array.isArray(candidate.diagnostics)
    ? (candidate.diagnostics as ProfileDiagnosticsSummary[])
    : includeDiagnostics
      ? []
      : undefined;

  return {
    profiles,
    diagnostics
  };
}

function normalizeCreateResult(result: unknown): { profile: ProfileSummary; warning?: string | null } {
  if (!result || typeof result !== "object") {
    throw new Error("Create profile override must return an object");
  }

  const candidate = result as {
    profile?: ProfileSummary;
    warning?: string | null;
  };

  if (!candidate.profile) {
    throw new Error("Create profile override must include a profile");
  }

  return {
    profile: candidate.profile,
    warning: candidate.warning ?? null
  };
}

function normalizeUpdateResult(result: unknown): { profile: ProfileSummary; warning?: string | null } {
  if (!result || typeof result !== "object") {
    throw new Error("Update profile override must return an object");
  }

  const candidate = result as {
    profile?: ProfileSummary;
    warning?: string | null;
  };

  if (!candidate.profile) {
    throw new Error("Update profile override must include a profile");
  }

  return {
    profile: candidate.profile,
    warning: candidate.warning ?? null
  };
}

function normalizeDeleteResult(result: unknown): { deletedId: string; successorProfileId?: string | null } {
  if (!result || typeof result !== "object") {
    throw new Error("Delete profile override must return an object");
  }

  const candidate = result as {
    deletedId?: string;
    successorProfileId?: string | null;
  };

  if (!candidate.deletedId) {
    throw new Error("Delete profile override must include deletedId");
  }

  return {
    deletedId: candidate.deletedId,
    successorProfileId: candidate.successorProfileId ?? null
  };
}

function normalizeActivateResult(result: unknown): {
  activeProfile: ProfileSummary;
  previousProfileId?: string | null;
} {
  if (!result || typeof result !== "object") {
    throw new Error("Activate profile override must return an object");
  }

  const candidate = result as {
    activeProfile?: ProfileSummary;
    previousProfileId?: string | null;
  };

  if (!candidate.activeProfile) {
    throw new Error("Activate profile override must include activeProfile");
  }

  return {
    activeProfile: candidate.activeProfile,
    previousProfileId: candidate.previousProfileId ?? null
  };
}

function normalizeTestPromptResult(result: unknown): {
  profileId: string;
  success: boolean;
  latencyMs?: number | null;
  totalTimeMs: number;
  modelName?: string | null;
  truncatedResponse?: string | null;
} {
  if (!result || typeof result !== "object") {
    throw new Error("Test prompt override must return an object");
  }

  const candidate = result as {
    profileId?: string;
    success?: boolean;
    latencyMs?: number | null;
    totalTimeMs?: number;
    modelName?: string | null;
    truncatedResponse?: string | null;
  };

  if (!candidate.profileId) {
    throw new Error("Test prompt override must include profileId");
  }

  return {
    profileId: candidate.profileId,
    success: candidate.success ?? false,
    latencyMs: candidate.latencyMs ?? null,
    totalTimeMs: candidate.totalTimeMs ?? 0,
    modelName: candidate.modelName ?? null,
    truncatedResponse: candidate.truncatedResponse ?? null
  };
}

function normalizeDiscoveryResult(result: unknown): {
  providers: {
    providerType: string;
    endpointUrl: string;
    latencyMs?: number | null;
    requiresConsent?: boolean;
  }[];
} {
  if (!result || typeof result !== "object") {
    throw new Error("Discovery override must return an object");
  }

  const candidate = result as {
    providers?: unknown;
  };

  if (!Array.isArray(candidate.providers)) {
    throw new Error("Discovery override must include providers array");
  }

  return {
    providers: candidate.providers as {
      providerType: string;
      endpointUrl: string;
      latencyMs?: number | null;
      requiresConsent?: boolean;
    }[]
  };
}
