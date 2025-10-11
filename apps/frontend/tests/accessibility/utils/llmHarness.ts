import type { Page } from "@playwright/test";

type ProfileFixture = {
  id: string;
  name: string;
  providerType: "llama.cpp" | "azure" | "custom";
  endpointUrl: string;
  apiKey: string;
  modelId: string | null;
  isActive: boolean;
  consentTimestamp: number | null;
  createdAt: number;
  modifiedAt: number;
};

type HarnessOptions = {
  encryptionAvailable: boolean;
  profiles: ProfileFixture[];
};

const defaultNow = Date.now();

const DEFAULT_FIXTURES: HarnessOptions = {
  encryptionAvailable: true,
  profiles: [
    {
      id: "profile-local",
      name: "Local llama.cpp",
      providerType: "llama.cpp",
      endpointUrl: "http://localhost:11434",
      apiKey: "***REDACTED***",
      modelId: null,
      isActive: true,
      consentTimestamp: null,
      createdAt: defaultNow - 86_400_000,
      modifiedAt: defaultNow - 3_600_000
    },
    {
      id: "profile-azure",
      name: "Azure Production",
      providerType: "azure",
      endpointUrl: "https://workspace.openai.azure.com",
      apiKey: "***REDACTED***",
      modelId: "gpt-4",
      isActive: false,
      consentTimestamp: defaultNow - 172_800_000,
      createdAt: defaultNow - 172_800_000,
      modifiedAt: defaultNow - 86_400_000
    }
  ]
};

export async function installLLMSettingsHarness(page: Page, overrides: Partial<HarnessOptions> = {}): Promise<void> {
  const fixtures: HarnessOptions = {
    encryptionAvailable: overrides.encryptionAvailable ?? DEFAULT_FIXTURES.encryptionAvailable,
    profiles: overrides.profiles ?? DEFAULT_FIXTURES.profiles
  };

  await page.addInitScript((initialFixtures) => {
    const state = {
      encryptionAvailable: initialFixtures.encryptionAvailable,
      profiles: initialFixtures.profiles.map((profile) => ({ ...profile }))
    };

    const success = (data: unknown) => ({
      success: true,
      data,
      timestamp: Date.now()
    });

    const error = (message: string) => ({
      error: "HARNESS_ERROR",
      message,
      timestamp: Date.now()
    });

    const cloneProfiles = () => state.profiles.map((profile) => ({ ...profile }));

    const getActiveProfileId = () => {
      const active = state.profiles.find((profile) => profile.isActive);
      return active ? active.id : null;
    };

    const adoptProfile = (profile: typeof state.profiles[number]) => ({
      ...profile,
      apiKey: "***REDACTED***"
    });

    const setActiveProfile = (id: string | null) => {
      state.profiles = state.profiles.map((profile) => ({
        ...profile,
        isActive: id ? profile.id === id : false
      }));
    };

    const ensureProfileExists = (id: string) => {
      if (!state.profiles.some((profile) => profile.id === id)) {
        throw new Error(`Profile ${id} not found`);
      }
    };

    const createProfileFromPayload = (payload: any) => {
      const id = payload.id ?? `profile-${Math.random().toString(36).slice(2, 10)}`;
      const timestamp = Date.now();
      return {
        id,
        name: payload.name,
        providerType: payload.providerType,
        endpointUrl: payload.endpointUrl,
        apiKey: payload.apiKey ?? "***REDACTED***",
        modelId: payload.modelId ?? null,
        isActive: payload.isActive ?? false,
        consentTimestamp: payload.consentTimestamp ?? (payload.providerType === "llama.cpp" ? null : timestamp),
        createdAt: timestamp,
        modifiedAt: timestamp
      };
    };

    const testPromptSuccess = {
      profileId: getActiveProfileId(),
      success: true,
      promptText: "Hello!",
      responseText: "Harness response",
      latencyMs: 128,
      ttfbMs: 42,
      occurredAt: Date.now(),
      providerType: "llama.cpp",
      errorCode: null,
      errorMessage: null
    };

    (window as any).llmAPI = {
      async listProfiles() {
        return success({
          profiles: cloneProfiles().map(adoptProfile),
          encryptionAvailable: state.encryptionAvailable,
          activeProfileId: getActiveProfileId()
        });
      },
      async createProfile(payload: any) {
        const profile = createProfileFromPayload(payload);
        const isFirstProfile = state.profiles.length === 0;

        state.profiles = [
          profile,
          ...state.profiles.map((existing) => ({
            ...existing,
            isActive: profile.isActive ? false : existing.isActive
          }))
        ];

        if (isFirstProfile || profile.isActive) {
          setActiveProfile(profile.id);
        }

        const storedProfile = state.profiles.find((candidate) => candidate.id === profile.id) ?? profile;
        return success({ profile: adoptProfile({ ...storedProfile }) });
      },
      async updateProfile(payload: any) {
        ensureProfileExists(payload.id);
        state.profiles = state.profiles.map((profile) => {
          if (profile.id !== payload.id) {
            return { ...profile };
          }

          const updated = {
            ...profile,
            ...payload,
            modelId: payload.modelId ?? profile.modelId,
            consentTimestamp: payload.consentTimestamp ?? profile.consentTimestamp,
            modifiedAt: Date.now()
          };

          return updated;
        });

        const updatedProfile = state.profiles.find((profile) => profile.id === payload.id)!;
        return success({ profile: adoptProfile(updatedProfile) });
      },
      async deleteProfile(payload: any) {
        ensureProfileExists(payload.id);
        state.profiles = state.profiles.filter((profile) => profile.id !== payload.id);
        const nextActiveId = payload.activateAlternateId ?? getActiveProfileId();
        setActiveProfile(nextActiveId ?? null);
        return success({
          deletedId: payload.id,
          newActiveProfileId: getActiveProfileId(),
          requiresUserSelection: state.profiles.length > 0 && !getActiveProfileId()
        });
      },
      async activateProfile(payload: any) {
        ensureProfileExists(payload.id);
        setActiveProfile(payload.id);
        const activeProfile = state.profiles.find((profile) => profile.id === payload.id)!;
        return success({
          activeProfile: adoptProfile({ ...activeProfile, isActive: true }),
          deactivatedProfileId: null
        });
      },
      async testPrompt() {
        return success({ ...testPromptSuccess, occurredAt: Date.now() });
      },
      async discoverProfiles() {
        return success({
          discovered: false,
          discoveredUrl: null,
          profileCreated: false,
          profileId: null,
          probedPorts: [11434, 8080, 8000]
        });
      }
    };
  }, fixtures);
}
