import type {
  LLMProfile,
  ProviderType,
  TestPromptResult
} from "@metaverse-systems/llm-tutor-shared";

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

export interface DiscoveryResult {
  discovered: boolean;
  discoveredUrl: string | null;
  profileCreated: boolean;
  profileId: string | null;
  probedPorts: number[];
}

export interface ListProfilesResult {
  profiles: LLMProfile[];
  encryptionAvailable: boolean;
  activeProfileId: string | null;
}

export interface CreateProfilePayload {
  name: string;
  providerType: ProviderType;
  endpointUrl: string;
  apiKey: string;
  modelId: string | null;
  consentTimestamp: number | null;
}

export interface UpdateProfilePayload {
  id: string;
  name?: string;
  providerType?: ProviderType;
  endpointUrl?: string;
  apiKey?: string;
  modelId?: string | null;
  consentTimestamp?: number | null;
}

export interface DeleteProfilePayload {
  id: string;
  activateAlternateId?: string;
}

export interface ActivateProfilePayload {
  id: string;
}

export interface CreateProfileResult {
  profile: LLMProfile;
  warning?: string | null;
}

export interface UpdateProfileResult {
  profile: LLMProfile;
  warning?: string | null;
}

export interface DeleteProfileResult {
  deletedId: string;
  newActiveProfileId: string | null;
  requiresUserSelection: boolean;
}

export interface ActivateProfileResult {
  activeProfile: LLMProfile;
  deactivatedProfileId: string | null;
}

export interface TestPromptRequest {
  profileId?: string;
  promptText?: string;
}

export interface DiscoverProfilesPayload {
  force?: boolean;
}

export interface LlmApiBridge {
  listProfiles(): Promise<InvokeResult<ListProfilesResult>>;
  createProfile(payload: CreateProfilePayload): Promise<InvokeResult<CreateProfileResult>>;
  updateProfile(payload: UpdateProfilePayload): Promise<InvokeResult<UpdateProfileResult>>;
  deleteProfile(payload: DeleteProfilePayload): Promise<InvokeResult<DeleteProfileResult>>;
  activateProfile(payload: ActivateProfilePayload): Promise<InvokeResult<ActivateProfileResult>>;
  testPrompt(payload?: TestPromptRequest): Promise<InvokeResult<TestPromptResult>>;
  discoverProfiles(payload?: DiscoverProfilesPayload): Promise<InvokeResult<DiscoveryResult>>;
}
