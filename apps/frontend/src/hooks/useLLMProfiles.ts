import type {
  LLMProfile,
  ProviderType,
  TestPromptResult
} from "@metaverse-systems/llm-tutor-shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CreateProfilePayload,
  DeleteProfilePayload,
  DiscoverProfilesPayload,
  DiscoveryResult,
  ErrorResponse,
  InvokeResult,
  LlmApiBridge,
  SuccessResponse,
  TestPromptRequest,
  UpdateProfilePayload
} from "../types/llm-api";

const API_KEY_PLACEHOLDER = "***REDACTED***" as const;
const BRIDGE_UNAVAILABLE_ERROR = "LLM bridge unavailable" as const;

type NullableNumber = number | null | undefined;

interface HookState {
  profiles: LLMProfile[];
  encryptionAvailable: boolean;
  activeProfileId: string | null;
  loading: boolean;
  error: string | null;
  transcriptHistory: Map<string, TestPromptResult[]>;
}

export interface CreateProfileInput {
  name: string;
  providerType: ProviderType;
  endpointUrl: string;
  apiKey: string;
  modelId?: string | null;
  consentTimestamp?: NullableNumber;
}

export interface UpdateProfileInput {
  name?: string;
  providerType?: ProviderType;
  endpointUrl?: string;
  apiKey?: string;
  modelId?: string | null;
  consentTimestamp?: NullableNumber;
}

export interface UseLLMProfilesResult {
  profiles: LLMProfile[];
  activeProfile: LLMProfile | null;
  loading: boolean;
  error: string | null;
  encryptionAvailable: boolean;
  fetchProfiles: () => Promise<void>;
  createProfile: (payload: CreateProfileInput) => Promise<LLMProfile>;
  updateProfile: (id: string, payload: UpdateProfileInput) => Promise<LLMProfile>;
  deleteProfile: (id: string, alternateId?: string) => Promise<void>;
  activateProfile: (id: string) => Promise<void>;
  testPrompt: (profileId?: string, promptText?: string) => Promise<TestPromptResult>;
  discoverProfiles: (force?: boolean) => Promise<DiscoveryResult>;
  getTranscriptHistory: (profileId: string) => TestPromptResult[];
  clearTranscriptHistory: (profileId: string) => void;
  getLastTranscript: (profileId: string) => TestPromptResult | null;
}

interface BridgeError extends Error {
  code?: string;
  details?: unknown;
}

const INITIAL_STATE: HookState = {
  profiles: [],
  encryptionAvailable: false,
  activeProfileId: null,
  loading: true,
  error: null,
  transcriptHistory: new Map()
};

function isInvokeSuccess<T>(result: InvokeResult<T>): result is SuccessResponse<T> {
  return typeof result === "object" && result !== null && (result as SuccessResponse<T>).success === true;
}

function createBridgeError(result: ErrorResponse, fallbackMessage: string): BridgeError {
  const message = result.message || result.error || fallbackMessage;
  const error = new Error(message) as BridgeError;
  error.code = result.error;
  error.details = result.details;
  return error;
}

function getErrorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message || "Unexpected error";
  }

  if (typeof value === "string") {
    return value || "Unexpected error";
  }

  return "Unexpected error";
}

function cloneProfile(profile: LLMProfile): LLMProfile {
  return { ...profile };
}

function cloneProfiles(profiles: LLMProfile[]): LLMProfile[] {
  return profiles.map(cloneProfile);
}

function cloneState(state: HookState): HookState {
  return {
    profiles: cloneProfiles(state.profiles),
    encryptionAvailable: state.encryptionAvailable,
    activeProfileId: state.activeProfileId,
    loading: state.loading,
    error: state.error
  };
}

function normalizeCreatePayload(payload: CreateProfileInput): CreateProfilePayload {
  return {
    name: payload.name,
    providerType: payload.providerType,
    endpointUrl: payload.endpointUrl,
    apiKey: payload.apiKey,
    modelId: payload.modelId ?? null,
    consentTimestamp: payload.consentTimestamp ?? null
  };
}

function normalizeUpdatePayload(id: string, payload: UpdateProfileInput): UpdateProfilePayload {
  const normalized: UpdateProfilePayload = { id };

  if (payload.name !== undefined) {
    normalized.name = payload.name;
  }

  if (payload.providerType !== undefined) {
    normalized.providerType = payload.providerType;
  }

  if (payload.endpointUrl !== undefined) {
    normalized.endpointUrl = payload.endpointUrl;
  }

  if (payload.apiKey !== undefined) {
    normalized.apiKey = payload.apiKey;
  }

  if (payload.modelId !== undefined) {
    normalized.modelId = payload.modelId;
  }

  if (payload.consentTimestamp !== undefined) {
    normalized.consentTimestamp = payload.consentTimestamp;
  }

  return normalized;
}

function normalizeDeletePayload(id: string, alternateId?: string): DeleteProfilePayload {
  return alternateId ? { id, activateAlternateId: alternateId } : { id };
}

function normalizeTestPromptRequest(profileId?: string, promptText?: string): TestPromptRequest | undefined {
  const hasProfile = typeof profileId === "string" && profileId.length > 0;
  const hasPrompt = typeof promptText === "string" && promptText.length > 0;

  if (!hasProfile && !hasPrompt) {
    return undefined;
  }

  const payload: TestPromptRequest = {};

  if (hasProfile) {
    payload.profileId = profileId;
  }

  if (hasPrompt) {
    payload.promptText = promptText;
  }

  return payload;
}

function normalizeDiscoverPayload(force?: boolean): DiscoverProfilesPayload | undefined {
  return force ? { force: true } : undefined;
}

function getBridge(): LlmApiBridge | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.llmAPI ?? null;
}

function ensureBridge(): LlmApiBridge {
  const bridge = getBridge();

  if (!bridge) {
    throw new Error(BRIDGE_UNAVAILABLE_ERROR);
  }

  return bridge;
}

function createOptimisticProfile(
  payload: CreateProfileInput,
  state: HookState,
  timestamp: number
): LLMProfile {
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `pending-${Math.random().toString(36).slice(2, 11)}`;

  const shouldActivate = !state.activeProfileId;

  return {
    id,
    name: payload.name,
    providerType: payload.providerType,
    endpointUrl: payload.endpointUrl,
    apiKey: API_KEY_PLACEHOLDER,
    modelId: payload.modelId ?? null,
    isActive: shouldActivate,
    consentTimestamp: payload.consentTimestamp ?? null,
    createdAt: timestamp,
    modifiedAt: timestamp
  };
}

function replaceProfileById(profiles: LLMProfile[], profile: LLMProfile): LLMProfile[] {
  return profiles.map((existing) => (existing.id === profile.id ? cloneProfile(profile) : existing));
}

function removeProfileById(profiles: LLMProfile[], id: string): LLMProfile[] {
  return profiles.filter((profile) => profile.id !== id);
}

export function useLLMProfiles(): UseLLMProfilesResult {
  const [state, setState] = useState<HookState>(INITIAL_STATE);
  const stateRef = useRef<HookState>(INITIAL_STATE);
  const isMountedRef = useRef<boolean>(true);
  const bridgeRetryCountRef = useRef<number>(0);
  const bridgeRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBridgeRetryTimer = useCallback(() => {
    if (bridgeRetryTimerRef.current !== null) {
      clearTimeout(bridgeRetryTimerRef.current);
      bridgeRetryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      clearBridgeRetryTimer();
    };
  }, [clearBridgeRetryTimer]);

  const updateState = useCallback(
    (updater: HookState | ((previous: HookState) => HookState)) => {
      setState((previous) => {
        if (!isMountedRef.current) {
          return previous;
        }

        const next = typeof updater === "function" ? (updater as (prev: HookState) => HookState)(previous) : updater;
        stateRef.current = next;
        return next;
      });
    },
    []
  );

  const fetchProfiles = useCallback(async () => {
    const bridge = getBridge();

    if (!bridge) {
      const nextRetry = bridgeRetryCountRef.current + 1;
      bridgeRetryCountRef.current = nextRetry;
      const shouldRetry = nextRetry <= 20;

      updateState((previous) => ({
        ...previous,
        loading: shouldRetry,
        error: shouldRetry ? null : BRIDGE_UNAVAILABLE_ERROR
      }));

      if (shouldRetry && typeof window !== "undefined") {
        clearBridgeRetryTimer();
        bridgeRetryTimerRef.current = setTimeout(() => {
          bridgeRetryTimerRef.current = null;
          void fetchProfiles();
        }, 200);
      }

      return;
    }

    bridgeRetryCountRef.current = 0;
    clearBridgeRetryTimer();

    updateState((previous) => ({
      ...previous,
      loading: true,
      error: null
    }));

    try {
      const result = await bridge.listProfiles();

      if (!isInvokeSuccess(result)) {
        throw createBridgeError(result, "Failed to load LLM profiles");
      }

      const { profiles, encryptionAvailable, activeProfileId } = result.data;

      updateState({
        profiles: cloneProfiles(profiles),
        encryptionAvailable,
        activeProfileId,
        loading: false,
        error: null
      });
    } catch (error) {
      updateState((previous) => ({
        ...previous,
        loading: false,
        error: getErrorMessage(error)
      }));
    }
  }, [clearBridgeRetryTimer, updateState]);

  useEffect(() => {
    void fetchProfiles();
  }, [fetchProfiles]);

  const createProfile = useCallback(
    async (payload: CreateProfileInput): Promise<LLMProfile> => {
      const bridge = ensureBridge();
      const snapshot = cloneState(stateRef.current);
      const timestamp = Date.now();
      const optimisticProfile = createOptimisticProfile(payload, snapshot, timestamp);

      updateState((previous) => ({
        ...previous,
        loading: true,
        error: null,
        profiles: [optimisticProfile, ...removeProfileById(previous.profiles, optimisticProfile.id)],
        activeProfileId: optimisticProfile.isActive ? optimisticProfile.id : previous.activeProfileId
      }));

      try {
        const result = await bridge.createProfile(normalizeCreatePayload(payload));

        if (!isInvokeSuccess(result)) {
          throw createBridgeError(result, "Failed to create profile");
        }

        const createdProfile = cloneProfile(result.data.profile);

        updateState((previous) => ({
          ...previous,
          profiles: [createdProfile, ...removeProfileById(previous.profiles, optimisticProfile.id)],
          activeProfileId: createdProfile.isActive ? createdProfile.id : previous.activeProfileId,
          error: null
        }));

        await fetchProfiles();
        return createdProfile;
      } catch (error) {
        const message = getErrorMessage(error);
        updateState({
          ...snapshot,
          loading: false,
          error: message
        });
        throw error;
      }
    },
    [fetchProfiles, updateState]
  );

  const updateProfile = useCallback(
    async (id: string, payload: UpdateProfileInput): Promise<LLMProfile> => {
      const bridge = ensureBridge();
      const snapshot = cloneState(stateRef.current);
      const target = snapshot.profiles.find((profile) => profile.id === id);

      if (!target) {
        throw new Error(`Profile with id ${id} not found`);
      }

      const optimisticProfile: LLMProfile = {
        ...target,
        ...payload,
        modelId: payload.modelId ?? target.modelId,
        consentTimestamp: payload.consentTimestamp ?? target.consentTimestamp,
        modifiedAt: Date.now()
      };

      updateState((previous) => ({
        ...previous,
        loading: true,
        error: null,
        profiles: replaceProfileById(previous.profiles, optimisticProfile)
      }));

      try {
        const result = await bridge.updateProfile(normalizeUpdatePayload(id, payload));

        if (!isInvokeSuccess(result)) {
          throw createBridgeError(result, "Failed to update profile");
        }

        const updatedProfile = cloneProfile(result.data.profile);

        updateState((previous) => ({
          ...previous,
          profiles: replaceProfileById(previous.profiles, updatedProfile),
          activeProfileId: updatedProfile.isActive ? updatedProfile.id : previous.activeProfileId,
          error: null
        }));

        await fetchProfiles();
        return updatedProfile;
      } catch (error) {
        const message = getErrorMessage(error);
        updateState({
          ...snapshot,
          loading: false,
          error: message
        });
        throw error;
      }
    },
    [fetchProfiles, updateState]
  );

  const deleteProfile = useCallback(
    async (id: string, alternateId?: string): Promise<void> => {
      const bridge = ensureBridge();
      const snapshot = cloneState(stateRef.current);
      const hasTarget = snapshot.profiles.some((profile) => profile.id === id);

      if (!hasTarget) {
        throw new Error(`Profile with id ${id} not found`);
      }

      updateState((previous) => ({
        ...previous,
        loading: true,
        error: null,
        profiles: removeProfileById(previous.profiles, id),
        activeProfileId: previous.activeProfileId === id ? null : previous.activeProfileId
      }));

      try {
        const result = await bridge.deleteProfile(normalizeDeletePayload(id, alternateId));

        if (!isInvokeSuccess(result)) {
          throw createBridgeError(result, "Failed to delete profile");
        }

        updateState((previous) => ({
          ...previous,
          activeProfileId: result.data.newActiveProfileId,
          error: null
        }));

        await fetchProfiles();
      } catch (error) {
        const message = getErrorMessage(error);
        updateState({
          ...snapshot,
          loading: false,
          error: message
        });
        throw error;
      }
    },
    [fetchProfiles, updateState]
  );

  const activateProfile = useCallback(
    async (id: string): Promise<void> => {
      const bridge = ensureBridge();
      const snapshot = cloneState(stateRef.current);
      const target = snapshot.profiles.find((profile) => profile.id === id);

      if (!target) {
        throw new Error(`Profile with id ${id} not found`);
      }

      updateState((previous) => ({
        ...previous,
        loading: true,
        error: null,
        profiles: previous.profiles.map((profile) =>
          profile.id === id ? { ...profile, isActive: true } : { ...profile, isActive: false }
        ),
        activeProfileId: id
      }));

      try {
        const result = await bridge.activateProfile({ id });

        if (!isInvokeSuccess(result)) {
          throw createBridgeError(result, "Failed to activate profile");
        }

        const activeProfile = cloneProfile(result.data.activeProfile);

        updateState((previous) => ({
          ...previous,
          profiles: replaceProfileById(previous.profiles, activeProfile).map((profile) =>
            profile.id === activeProfile.id ? profile : { ...profile, isActive: false }
          ),
          activeProfileId: activeProfile.id,
          error: null
        }));

        await fetchProfiles();
      } catch (error) {
        const message = getErrorMessage(error);
        updateState({
          ...snapshot,
          loading: false,
          error: message
        });
        throw error;
      }
    },
    [fetchProfiles, updateState]
  );

  const testPrompt = useCallback(async (profileId?: string, promptText?: string): Promise<TestPromptResult> => {
    const bridge = ensureBridge();

    try {
      const result = await bridge.testPrompt(normalizeTestPromptRequest(profileId, promptText));

      if (!isInvokeSuccess(result)) {
        throw createBridgeError(result, "Failed to test prompt");
      }

      const testResult = result.data;
      const targetProfileId = profileId || state.activeProfileId;

      // Store transcript in history (max 3 per profile)
      if (targetProfileId) {
        updateState((previous) => {
          const newHistory = new Map(previous.transcriptHistory);
          const profileHistory = newHistory.get(targetProfileId) || [];
          
          // Add new result at beginning and keep only last 3
          const updatedHistory = [testResult, ...profileHistory].slice(0, 3);
          newHistory.set(targetProfileId, updatedHistory);

          return {
            ...previous,
            error: null,
            transcriptHistory: newHistory
          };
        });
      } else {
        updateState((previous) => ({
          ...previous,
          error: null
        }));
      }

      return testResult;
    } catch (error) {
      const message = getErrorMessage(error);
      updateState((previous) => ({
        ...previous,
        error: message
      }));
      throw error;
    }
  }, [updateState, state.activeProfileId]);

  const discoverProfiles = useCallback(async (force?: boolean): Promise<DiscoveryResult> => {
    const bridge = ensureBridge();
    const snapshot = cloneState(stateRef.current);

    updateState((previous) => ({
      ...previous,
      loading: true,
      error: null
    }));

    try {
      const result = await bridge.discoverProfiles(normalizeDiscoverPayload(force));

      if (!isInvokeSuccess(result)) {
        throw createBridgeError(result, "Failed to run discovery");
      }

      updateState((previous) => ({
        ...previous,
        error: null
      }));

      await fetchProfiles();
      return result.data;
    } catch (error) {
      const message = getErrorMessage(error);
      updateState({
        ...snapshot,
        loading: false,
        error: message
      });
      throw error;
    }
  }, [fetchProfiles, updateState]);

  const activeProfile = useMemo(() => {
    if (!state.activeProfileId) {
      return null;
    }

    return state.profiles.find((profile) => profile.id === state.activeProfileId) ?? null;
  }, [state.activeProfileId, state.profiles]);

  const getTranscriptHistory = useCallback((profileId: string): TestPromptResult[] => {
    return state.transcriptHistory.get(profileId) || [];
  }, [state.transcriptHistory]);

  const clearTranscriptHistory = useCallback((profileId: string): void => {
    updateState((previous) => {
      const newHistory = new Map(previous.transcriptHistory);
      newHistory.delete(profileId);
      return {
        ...previous,
        transcriptHistory: newHistory
      };
    });
  }, [updateState]);

  const getLastTranscript = useCallback((profileId: string): TestPromptResult | null => {
    const history = state.transcriptHistory.get(profileId);
    return history && history.length > 0 ? history[0] : null;
  }, [state.transcriptHistory]);

  return {
    profiles: state.profiles,
    activeProfile,
    loading: state.loading,
    error: state.error,
    encryptionAvailable: state.encryptionAvailable,
    fetchProfiles,
    createProfile,
    updateProfile,
    deleteProfile,
    activateProfile,
    testPrompt,
    discoverProfiles,
    getTranscriptHistory,
    clearTranscriptHistory,
    getLastTranscript
  };
}

export type { DiscoveryResult } from "../types/llm-api";
