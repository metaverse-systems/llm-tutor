import {
  createProfileErrorResponse,
  createProfileSuccessResponse,
  sanitizeProfileSummaries,
  sanitizePromptPreview,
  ProfileIpcRequestEnvelopeSchema,
  type CreateProfileResponse,
  type DeleteProfileResponse,
  type ActivateProfileResponse,
  type UpdateProfileResponse,
  type TestProfileResponse,
  type DiscoverProfileResponse,
  type DraftProfile,
  type ListProfilesResponse,
  type OperatorContext,
  type ProfileErrorCode,
  type ProfileIpcChannel,
  type ProfileIpcRequestEnvelope,
  type ProfileOperationRequest,
  type ProfileOperationResponse,
  type ProfileOperationRequestType,
  type ProfileSummary,
  type DiscoveredProvider
} from "@metaverse-systems/llm-tutor-shared/src/contracts/llm-profile-ipc";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";

import type { ProfileIpcDiagnosticsRecorder } from "../diagnostics/profile-ipc.recorder";
import type { SafeStorageOutageService } from "../services/safe-storage-outage.service";

class RequestTimeoutError extends Error {
  constructor(
    public readonly channel: ProfileIpcChannel,
    public readonly timeoutMs: number
  ) {
    super(`IPC handler for ${channel} exceeded ${timeoutMs}ms budget`);
    this.name = "RequestTimeoutError";
  }
}

type IpcMainLike = Pick<IpcMain, "handle" | "removeHandler">;

export interface ProfileServiceHandlers {
  listProfiles?: (filter?: ListFilter) => Promise<ListProfilesResponse> | ListProfilesResponse;
  createProfile?: (
    profile: DraftProfile
  ) => Promise<CreateProfileResponse & { warning?: string | null }> | (CreateProfileResponse & { warning?: string | null });
  updateProfile?: (
    profileId: string,
    changes: Partial<DraftProfile>
  ) => Promise<UpdateProfileResponse & { warning?: string | null }> | (UpdateProfileResponse & { warning?: string | null });
  deleteProfile?: (
    profileId: string,
    successorProfileId?: string | null
  ) => Promise<DeleteProfileResponse> | DeleteProfileResponse;
  activateProfile?: (
    profileId: string,
    force?: boolean
  ) => Promise<ActivateProfileResponse> | ActivateProfileResponse;
}

export interface TestPromptServiceHandlers {
  execute?: (
    profileId: string,
    promptOverride?: string,
    timeoutMs?: number
  ) => Promise<TestProfileResponse> | TestProfileResponse;
}

export interface AutoDiscoveryServiceHandlers {
  discover?: (
    scope: DiscoveryScope
  ) => Promise<{ providers: DiscoveredProvider[] }> | { providers: DiscoveredProvider[] };
}

type DiscoveryScope = Extract<ProfileOperationRequest, { type: "discover" }>["scope"];

export interface ProfileIpcRouterOptions {
  ipcMain?: IpcMainLike | null;
  profileService: ProfileServiceHandlers;
  testPromptService?: TestPromptServiceHandlers;
  autoDiscoveryService?: AutoDiscoveryServiceHandlers;
  diagnosticsRecorder: ProfileIpcDiagnosticsRecorder;
  safeStorageOutageService: SafeStorageOutageService;
  now?: () => number;
  logger?: Pick<Console, "info" | "warn" | "error">;
  onPerformanceWarning?: (warning: { channel: ProfileIpcChannel; durationMs: number; budgetMs: number }) => void;
}

interface RegisteredHandler {
  channel: ProfileIpcChannel;
  handler: (event: IpcMainInvokeEvent, payload: unknown) => Promise<ProfileOperationResponse>;
}

type ProfileIpcHandler = (envelope: ProfileIpcRequestEnvelope) => Promise<ProfileOperationResponse>;
type ListFilter = Extract<ProfileOperationRequest, { type: "list" }>[
  "filter"
];

const CHANNEL_OPERATION_MAP: Record<ProfileIpcChannel, ProfileOperationRequestType> = {
  "llmProfile:list": "list",
  "llmProfile:create": "create",
  "llmProfile:update": "update",
  "llmProfile:delete": "delete",
  "llmProfile:activate": "activate",
  "llmProfile:test": "test",
  "llmProfile:discover": "discover"
};

const REQUEST_BUDGET_MS: Partial<Record<ProfileIpcChannel, number>> = {
  "llmProfile:list": 500
};

const DEFAULT_OPERATOR_CONTEXT: OperatorContext = {
  operatorId: randomUUID(),
  operatorRole: "support_engineer",
  locale: "en-US"
};

interface BuildErrorOptions {
  envelope: ProfileIpcRequestEnvelope;
  error: unknown;
  startedAt: number;
  metadata?: Record<string, unknown> | null;
}

export interface ProfileIpcRouterRegistration {
  dispose(): void;
  invoke(envelope: ProfileIpcRequestEnvelope): Promise<ProfileOperationResponse>;
  isChannelRegistered(channel: ProfileIpcChannel): boolean;
}

export function createProfileIpcRouter(options: ProfileIpcRouterOptions): ProfileIpcRouterRegistration {
  const router = new ProfileIpcRouter(options);
  return {
    dispose: () => router.dispose(),
    invoke: async (envelope) => await router.execute(envelope.channel, envelope),
    isChannelRegistered: (channel) => router.isRegistered(channel)
  };
}

class ProfileIpcRouter {
  private readonly ipcMain: IpcMainLike | null;
  private readonly profileService: ProfileServiceHandlers;
  private readonly testPromptService?: TestPromptServiceHandlers;
  private readonly autoDiscoveryService?: AutoDiscoveryServiceHandlers;
  private readonly diagnosticsRecorder: ProfileIpcDiagnosticsRecorder;
  private readonly safeStorageOutageService: SafeStorageOutageService;
  private readonly now: () => number;
  private readonly logger?: Pick<Console, "info" | "warn" | "error">;
  private readonly onPerformanceWarning?: (warning: { channel: ProfileIpcChannel; durationMs: number; budgetMs: number }) => void;
  private readonly registeredHandlers: RegisteredHandler[] = [];
  private readonly handlers = new Map<ProfileIpcChannel, ProfileIpcHandler>();

  constructor(options: ProfileIpcRouterOptions) {
    this.ipcMain = options.ipcMain ?? null;
    this.profileService = options.profileService;
    this.testPromptService = options.testPromptService;
    this.autoDiscoveryService = options.autoDiscoveryService;
    this.diagnosticsRecorder = options.diagnosticsRecorder;
    this.safeStorageOutageService = options.safeStorageOutageService;
    this.now = options.now ?? (() => Date.now());
    this.logger = options.logger;
    this.onPerformanceWarning = options.onPerformanceWarning;

    this.handlers.set("llmProfile:list", (envelope) => this.handleList(envelope));
    this.handlers.set("llmProfile:create", (envelope) => this.handleCreate(envelope));
    this.handlers.set("llmProfile:update", (envelope) => this.handleUpdate(envelope));
    this.handlers.set("llmProfile:delete", (envelope) => this.handleDelete(envelope));
    this.handlers.set("llmProfile:activate", (envelope) => this.handleActivate(envelope));
    this.handlers.set("llmProfile:test", (envelope) => this.handleTest(envelope));
    this.handlers.set("llmProfile:discover", (envelope) => this.handleDiscover(envelope));

    this.registerIpcHandlers();
  }

  dispose(): void {
    for (const { channel } of this.registeredHandlers) {
      this.ipcMain?.removeHandler(channel);
    }
    this.registeredHandlers.length = 0;
    this.handlers.clear();
  }

  isRegistered(channel: ProfileIpcChannel): boolean {
    return this.handlers.has(channel);
  }

  async execute(channel: ProfileIpcChannel, payload: unknown): Promise<ProfileOperationResponse> {
    const startedAt = this.now();
    let envelope: ProfileIpcRequestEnvelope | null = null;

    try {
      envelope = this.normalizeEnvelope(channel, payload);
    } catch (error) {
      // Log Zod validation errors for debugging
      if (isZodError(error) && this.logger) {
        this.logger.error("Envelope validation failed:", error);
      }
      const requestId = this.extractRequestId(payload) ?? randomUUID();
      const fallbackEnvelope: ProfileIpcRequestEnvelope = {
        channel,
        requestId,
        timestamp: this.now(),
        context: DEFAULT_OPERATOR_CONTEXT,
        payload: this.coercePayload(channel, {})
      };
      return this.buildErrorResponse({
        envelope: fallbackEnvelope,
        error,
        startedAt,
        metadata: { invalidEnvelope: true }
      });
    }

    const handler = this.handlers.get(channel);
    if (!handler) {
      return this.buildErrorResponse({
        envelope,
        error: new Error(`No handler registered for ${channel}`),
        startedAt,
        metadata: { missingHandler: true }
      });
    }

    try {
      return await handler(envelope);
    } catch (error) {
      return this.buildErrorResponse({ envelope, error, startedAt });
    }
  }

  private registerIpcHandlers(): void {
    if (!this.ipcMain) {
      return;
    }

    for (const channel of this.handlers.keys()) {
      const handler = async (_event: IpcMainInvokeEvent, payload: unknown) =>
        await this.execute(channel, payload);
      this.ipcMain.handle(channel, handler);
      this.registeredHandlers.push({ channel, handler });
    }
  }

  private async handleList(envelope: ProfileIpcRequestEnvelope): Promise<ProfileOperationResponse> {
    const startedAt = this.now();
    const safeStorageStatus = this.safeStorageOutageService.getStatus();
    const budget = REQUEST_BUDGET_MS[envelope.channel];
    const filter = envelope.payload.type === "list" ? envelope.payload.filter : undefined;

    try {
      const result = await this.executeWithBudget(
        () => this.invokeListProfiles(filter),
        envelope.channel,
        budget
      );

      const sanitizedProfiles = sanitizeProfileSummaries(result.profiles ?? []);
      const payload: ListProfilesResponse = {
        profiles: sanitizedProfiles,
        diagnostics: result.diagnostics ? [...result.diagnostics] : undefined
      };

      const durationMs = this.now() - startedAt;

      const response = createProfileSuccessResponse<ListProfilesResponse>({
        requestId: envelope.requestId,
        channel: envelope.channel,
        data: payload,
        userMessage: "Profiles retrieved successfully.",
        durationMs,
        safeStorageStatus
      });

      this.recordBreadcrumb(envelope, response, {
        profileCount: payload.profiles.length,
        includeDiagnostics: Boolean(filter?.includeDiagnostics)
      });

      return response;
    } catch (error) {
      if (error instanceof RequestTimeoutError) {
        const durationMs = this.now() - startedAt;
        const response = createProfileErrorResponse({
          requestId: envelope.requestId,
          channel: envelope.channel,
          code: "TIMEOUT",
          userMessage: "Profile list request timed out.",
          remediation: "Retry after closing other heavy tasks.",
          durationMs,
          safeStorageStatus
        });

        this.recordBreadcrumb(envelope, response, {
          timedOut: true,
          budgetMs: budget
        });

        return response;
      }

      throw error;
    }
  }

  private async handleCreate(envelope: ProfileIpcRequestEnvelope): Promise<ProfileOperationResponse> {
    const startedAt = this.now();
    const safeStorageStatus = this.safeStorageOutageService.getStatus();

    if (this.safeStorageOutageService.isOutageActive()) {
      this.safeStorageOutageService.recordBlockedRequest(envelope.requestId);
      const durationMs = this.now() - startedAt;
      const response = createProfileErrorResponse({
        requestId: envelope.requestId,
        channel: envelope.channel,
        code: "SAFE_STORAGE_UNAVAILABLE",
        userMessage: "Secure profile storage is unavailable.",
        remediation: "Unlock or restore safe storage before retrying.",
        durationMs,
        safeStorageStatus: this.safeStorageOutageService.getStatus(),
        data: null
      });

      this.recordBreadcrumb(envelope, response, {
        outageActive: true,
        blockedWrite: true
      });

      return response;
    }

    const profile = this.extractCreateProfilePayload(envelope.payload);

    try {
      const result = await this.invokeCreateProfile(profile);
      const sanitizedProfile = this.sanitizeProfileSummary(result.profile);
      const durationMs = this.now() - startedAt;

      const response = createProfileSuccessResponse<CreateProfileResponse>({
        requestId: envelope.requestId,
        channel: envelope.channel,
        data: { profile: sanitizedProfile },
        userMessage: "Profile created successfully.",
        remediation: result.warning ?? null,
        durationMs,
        safeStorageStatus
      });

      this.recordBreadcrumb(envelope, response, {
        sanitized: true,
        warning: result.warning ?? null
      });

      return response;
    } catch (error) {
      return this.buildErrorResponse({
        envelope,
        error,
        startedAt,
        metadata: { operation: "create" }
      });
    }
  }

  private async handleUpdate(envelope: ProfileIpcRequestEnvelope): Promise<ProfileOperationResponse> {
    const startedAt = this.now();
    const safeStorageStatus = this.safeStorageOutageService.getStatus();

    if (this.safeStorageOutageService.isOutageActive()) {
      this.safeStorageOutageService.recordBlockedRequest(envelope.requestId);
      const durationMs = this.now() - startedAt;
      const response = createProfileErrorResponse({
        requestId: envelope.requestId,
        channel: envelope.channel,
        code: "SAFE_STORAGE_UNAVAILABLE",
        userMessage: "Secure profile storage is unavailable.",
        remediation: "Unlock or restore safe storage before retrying.",
        durationMs,
        safeStorageStatus: this.safeStorageOutageService.getStatus(),
        data: null
      });

      this.recordBreadcrumb(envelope, response, {
        outageActive: true,
        blockedWrite: true
      });

      return response;
    }

    if (!this.profileService.updateProfile) {
      return this.handleNotImplemented(envelope);
    }

    const { profileId, changes } = this.extractUpdateProfilePayload(envelope.payload);

    try {
      const result = await this.invokeUpdateProfile(profileId, changes);
      const sanitizedProfile = this.sanitizeProfileSummary(result.profile);
      const durationMs = this.now() - startedAt;

      const response = createProfileSuccessResponse<UpdateProfileResponse>({
        requestId: envelope.requestId,
        channel: envelope.channel,
        data: { profile: sanitizedProfile },
        userMessage: "Profile updated successfully.",
        remediation: result.warning ?? null,
        durationMs,
        safeStorageStatus
      });

      this.recordBreadcrumb(envelope, response, {
        sanitized: true,
        warning: result.warning ?? null,
        changedFields: Object.keys(changes)
      });

      return response;
    } catch (error) {
      return this.buildErrorResponse({
        envelope,
        error,
        startedAt,
        metadata: { operation: "update", profileId }
      });
    }
  }

  private async handleDelete(envelope: ProfileIpcRequestEnvelope): Promise<ProfileOperationResponse> {
    const startedAt = this.now();
    const safeStorageStatus = this.safeStorageOutageService.getStatus();

    if (!this.profileService.deleteProfile) {
      return this.handleNotImplemented(envelope);
    }

    const { profileId, successorProfileId } = this.extractDeleteProfilePayload(envelope.payload);

    try {
      const result = await this.invokeDeleteProfile(profileId, successorProfileId);
      const durationMs = this.now() - startedAt;

      const response = createProfileSuccessResponse<DeleteProfileResponse>({
        requestId: envelope.requestId,
        channel: envelope.channel,
        data: {
          deletedId: result.deletedId,
          successorProfileId: result.successorProfileId ?? null
        },
        userMessage: "Profile deleted successfully.",
        durationMs,
        safeStorageStatus
      });

      this.recordBreadcrumb(envelope, response, {
        deletedId: result.deletedId,
        successorProfileId: result.successorProfileId ?? null
      });

      return response;
    } catch (error) {
      return this.buildErrorResponse({
        envelope,
        error,
        startedAt,
        metadata: { operation: "delete", profileId }
      });
    }
  }

  private async handleActivate(envelope: ProfileIpcRequestEnvelope): Promise<ProfileOperationResponse> {
    const startedAt = this.now();
    const safeStorageStatus = this.safeStorageOutageService.getStatus();

    if (!this.profileService.activateProfile) {
      return this.handleNotImplemented(envelope);
    }

    const { profileId, force } = this.extractActivateProfilePayload(envelope.payload);

    try {
      const result = await this.invokeActivateProfile(profileId, force);
      const sanitizedProfile = this.sanitizeProfileSummary(result.activeProfile);
      const durationMs = this.now() - startedAt;

      const response = createProfileSuccessResponse<ActivateProfileResponse>({
        requestId: envelope.requestId,
        channel: envelope.channel,
        data: {
          activeProfile: sanitizedProfile,
          previousProfileId: result.previousProfileId ?? null
        },
        userMessage: "Profile activated successfully.",
        durationMs,
        safeStorageStatus
      });

      this.recordBreadcrumb(envelope, response, {
        activatedProfileId: result.activeProfile.id,
        previousProfileId: result.previousProfileId ?? null
      });

      return response;
    } catch (error) {
      return this.buildErrorResponse({
        envelope,
        error,
        startedAt,
        metadata: { operation: "activate", profileId }
      });
    }
  }

  private async handleTest(envelope: ProfileIpcRequestEnvelope): Promise<ProfileOperationResponse> {
    const startedAt = this.now();
    const safeStorageStatus = this.safeStorageOutageService.getStatus();

    if (!this.testPromptService?.execute) {
      return this.handleNotImplemented(envelope);
    }

    const { profileId, promptOverride, timeoutMs } = this.extractTestProfilePayload(envelope.payload);

    try {
      const result = await this.invokeTestPrompt(profileId, promptOverride, timeoutMs);
      const durationMs = this.now() - startedAt;

      const sanitizedResponse = sanitizePromptPreview(result.truncatedResponse);

      // Calculate historyDepth from transcript messages (number of exchanges)
      const historyDepth = Math.floor(result.transcript.messages.length / 2);
      
      // Get messagePreview from first user message (already truncated in transcript)
      const messagePreview = result.transcript.messages.find(m => m.role === 'user')?.text || '';

      const response = createProfileSuccessResponse<TestProfileResponse>({
        requestId: envelope.requestId,
        channel: envelope.channel,
        data: {
          profileId: result.profileId,
          success: result.success,
          latencyMs: result.latencyMs ?? null,
          totalTimeMs: result.totalTimeMs,
          modelName: result.modelName ?? null,
          truncatedResponse: sanitizedResponse,
          transcript: result.transcript
        },
        userMessage: result.success ? "Profile test successful." : "Profile test failed.",
        durationMs,
        safeStorageStatus
      });

      this.recordBreadcrumb(envelope, response, {
        latencyMs: result.latencyMs ?? null,
        totalTimeMs: result.totalTimeMs,
        success: result.success,
        historyDepth,
        messagePreview
      });

      return response;
    } catch (error) {
      return this.buildErrorResponse({
        envelope,
        error,
        startedAt,
        metadata: { operation: "test", profileId }
      });
    }
  }

  private async handleDiscover(envelope: ProfileIpcRequestEnvelope): Promise<ProfileOperationResponse> {
    const startedAt = this.now();
    const safeStorageStatus = this.safeStorageOutageService.getStatus();

    if (!this.autoDiscoveryService?.discover) {
      return this.handleNotImplemented(envelope);
    }

    const { scope } = this.extractDiscoverPayload(envelope.payload);

    try {
      const result = await this.invokeDiscover(scope);
      
      // Check for duplicates
      const duplicates = this.findDuplicateProviders(result.providers);
      if (duplicates.length > 0) {
        const durationMs = this.now() - startedAt;
        const response = createProfileErrorResponse({
          requestId: envelope.requestId,
          channel: envelope.channel,
          code: "DISCOVERY_CONFLICT",
          userMessage: "Duplicate providers detected during discovery.",
          remediation: "Resolve conflicting providers before proceeding.",
          durationMs,
          safeStorageStatus,
          data: null
        });

        this.recordBreadcrumb(envelope, response, {
          duplicateCount: duplicates.length,
          totalProviders: result.providers.length
        });

        return response;
      }

      const durationMs = this.now() - startedAt;

      const response = createProfileSuccessResponse<DiscoverProfileResponse>({
        requestId: envelope.requestId,
        channel: envelope.channel,
        data: {
          providers: result.providers
        },
        userMessage: "Profile discovery completed successfully.",
        durationMs,
        safeStorageStatus
      });

      this.recordBreadcrumb(envelope, response, {
        providerCount: result.providers.length,
        strategy: scope.strategy
      });

      return response;
    } catch (error) {
      return this.buildErrorResponse({
        envelope,
        error,
        startedAt,
        metadata: { operation: "discover" }
      });
    }
  }

  private handleNotImplemented(envelope: ProfileIpcRequestEnvelope): Promise<ProfileOperationResponse> {
    const durationMs = 0;
    const safeStorageStatus = this.safeStorageOutageService.getStatus();
    const response = createProfileErrorResponse({
      requestId: envelope.requestId,
      channel: envelope.channel,
      code: "SERVICE_FAILURE",
      userMessage: "This profile operation is not yet implemented.",
      remediation: "Update to the latest version or check back soon.",
      durationMs,
      safeStorageStatus
    });

    this.recordBreadcrumb(envelope, response, {
      notImplemented: true
    });

    return Promise.resolve(response);
  }

  private buildErrorResponse(options: BuildErrorOptions): ProfileOperationResponse {
    const { envelope, error, startedAt, metadata } = options;
    const durationMs = this.now() - startedAt;
    const safeStorageStatus = this.safeStorageOutageService.getStatus();

    const { code, userMessage, remediation } = this.mapErrorToResponse(error);

    const response = createProfileErrorResponse({
      requestId: envelope.requestId,
      channel: envelope.channel,
      code,
      userMessage,
      remediation,
      durationMs,
      safeStorageStatus
    });

    this.recordBreadcrumb(envelope, response, {
      ...metadata,
      errorName: error instanceof Error ? error.name : undefined
    });

    return response;
  }

  private recordBreadcrumb(
    envelope: ProfileIpcRequestEnvelope,
    response: ProfileOperationResponse,
    metadata?: Record<string, unknown> | null
  ): void {
    this.diagnosticsRecorder.recordBreadcrumb({
      channel: envelope.channel,
      requestId: envelope.requestId,
      correlationId: response.correlationId,
      operatorContext: envelope.context ?? DEFAULT_OPERATOR_CONTEXT,
      durationMs: response.durationMs,
      resultCode: response.code,
      safeStorageStatus: response.safeStorageStatus,
      metadata: metadata ?? undefined
    });

    // Emit performance warning if budget exceeded
    const budget = REQUEST_BUDGET_MS[envelope.channel];
    if (budget && response.durationMs > budget && this.onPerformanceWarning) {
      this.onPerformanceWarning({
        channel: envelope.channel,
        durationMs: response.durationMs,
        budgetMs: budget
      });
    }
  }

  private async executeWithBudget<T>(
    operation: () => Promise<T>,
    channel: ProfileIpcChannel,
    budgetMs?: number
  ): Promise<T> {
    if (!budgetMs || budgetMs <= 0) {
      return await operation();
    }

    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new RequestTimeoutError(channel, budgetMs));
      }, budgetMs);
      timer.unref?.();

      Promise.resolve()
        .then(operation)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  private async invokeListProfiles(filter?: ListFilter): Promise<ListProfilesResponse> {
    if (!this.profileService.listProfiles) {
      throw new Error("Profile service does not implement listProfiles");
    }
    return await Promise.resolve(this.profileService.listProfiles(filter));
  }

  private async invokeCreateProfile(
    profile: DraftProfile
  ): Promise<CreateProfileResponse & { warning?: string | null }> {
    if (!this.profileService.createProfile) {
      throw new Error("Profile service does not implement createProfile");
    }
    return await Promise.resolve(this.profileService.createProfile(profile));
  }

  private extractCreateProfilePayload(payload: ProfileOperationRequest): DraftProfile {
    if (payload.type !== "create") {
      throw new Error("Expected create payload for handler");
    }
    return payload.profile;
  }

  private extractUpdateProfilePayload(payload: ProfileOperationRequest): {
    profileId: string;
    changes: Partial<DraftProfile>;
  } {
    if (payload.type !== "update") {
      throw new Error("Expected update payload for handler");
    }
    return {
      profileId: payload.profileId,
      changes: payload.changes
    };
  }

  private extractDeleteProfilePayload(payload: ProfileOperationRequest): {
    profileId: string;
    successorProfileId?: string | null;
  } {
    if (payload.type !== "delete") {
      throw new Error("Expected delete payload for handler");
    }
    return {
      profileId: payload.profileId,
      successorProfileId: payload.successorProfileId
    };
  }

  private extractActivateProfilePayload(payload: ProfileOperationRequest): {
    profileId: string;
    force?: boolean;
  } {
    if (payload.type !== "activate") {
      throw new Error("Expected activate payload for handler");
    }
    return {
      profileId: payload.profileId,
      force: payload.force
    };
  }

  private extractTestProfilePayload(payload: ProfileOperationRequest): {
    profileId: string;
    promptOverride?: string;
    timeoutMs?: number;
  } {
    if (payload.type !== "test") {
      throw new Error("Expected test payload for handler");
    }
    return {
      profileId: payload.profileId,
      promptOverride: payload.promptOverride,
      timeoutMs: payload.timeoutMs
    };
  }

  private extractDiscoverPayload(payload: ProfileOperationRequest): {
    scope: DiscoveryScope;
  } {
    if (payload.type !== "discover") {
      throw new Error("Expected discover payload for handler");
    }
    return {
      scope: payload.scope
    };
  }

  private async invokeUpdateProfile(
    profileId: string,
    changes: Partial<DraftProfile>
  ): Promise<UpdateProfileResponse & { warning?: string | null }> {
    if (!this.profileService.updateProfile) {
      throw new Error("Profile service does not implement updateProfile");
    }
    return await Promise.resolve(this.profileService.updateProfile(profileId, changes));
  }

  private async invokeDeleteProfile(
    profileId: string,
    successorProfileId?: string | null
  ): Promise<DeleteProfileResponse> {
    if (!this.profileService.deleteProfile) {
      throw new Error("Profile service does not implement deleteProfile");
    }
    return await Promise.resolve(this.profileService.deleteProfile(profileId, successorProfileId));
  }

  private async invokeActivateProfile(
    profileId: string,
    force?: boolean
  ): Promise<ActivateProfileResponse> {
    if (!this.profileService.activateProfile) {
      throw new Error("Profile service does not implement activateProfile");
    }
    return await Promise.resolve(this.profileService.activateProfile(profileId, force));
  }

  private async invokeTestPrompt(
    profileId: string,
    promptOverride?: string,
    timeoutMs?: number
  ): Promise<TestProfileResponse> {
    if (!this.testPromptService?.execute) {
      throw new Error("Test prompt service does not implement execute");
    }
    return await Promise.resolve(this.testPromptService.execute(profileId, promptOverride, timeoutMs));
  }

  private async invokeDiscover(scope: DiscoveryScope): Promise<{ providers: DiscoveredProvider[] }> {
    if (!this.autoDiscoveryService?.discover) {
      throw new Error("Auto discovery service does not implement discover");
    }
    return await Promise.resolve(this.autoDiscoveryService.discover(scope));
  }

  private findDuplicateProviders(providers: DiscoveredProvider[]): DiscoveredProvider[] {
    const seen = new Map<string, DiscoveredProvider>();
    const duplicates: DiscoveredProvider[] = [];

    for (const provider of providers) {
      const key = `${provider.providerType}:${provider.endpointUrl}`;
      if (seen.has(key)) {
        duplicates.push(provider);
      } else {
        seen.set(key, provider);
      }
    }

    return duplicates;
  }

  private sanitizeProfileSummary(summary: ProfileSummary): ProfileSummary {
    return sanitizeProfileSummaries([summary])[0] ?? summary;
  }

  private mapErrorToResponse(error: unknown): {
    code: Exclude<ProfileErrorCode, "OK">;
    userMessage: string;
    remediation: string | null;
  } {
    if (error instanceof RequestTimeoutError) {
      return {
        code: "TIMEOUT",
        userMessage: "Operation timed out.",
        remediation: "Retry after ensuring the system is responsive."
      };
    }

    if (isZodError(error)) {
      return {
        code: "VALIDATION_ERROR",
        userMessage: "Invalid request payload.",
        remediation: "Review the provided data and try again."
      };
    }

    if (typeof error === "object" && error !== null && "code" in error) {
      const rawCode = (error as { code?: unknown }).code;
      const code = typeof rawCode === "string" ? rawCode : "";
      if (code === "PROFILE_NOT_FOUND") {
        return {
          code: "PROFILE_NOT_FOUND",
          userMessage: "The requested profile could not be found.",
          remediation: "Refresh your profiles and try again."
        };
      }
      if (code === "VALIDATION_ERROR") {
        return {
          code: "VALIDATION_ERROR",
          userMessage: error instanceof Error ? error.message : "Validation failed.",
          remediation: "Update the highlighted fields and retry."
        };
      }
      if (code === "VAULT_READ_ERROR") {
        return {
          code: "VAULT_READ_ERROR",
          userMessage: "Profile vault could not be read.",
          remediation: "Check disk permissions and retry."
        };
      }
      if (code === "SAFE_STORAGE_UNAVAILABLE") {
        return {
          code: "SAFE_STORAGE_UNAVAILABLE",
          userMessage: "Secure storage is unavailable.",
          remediation: "Unlock safe storage and retry."
        };
      }
    }

    return {
      code: "SERVICE_FAILURE",
      userMessage: "Profile operation failed due to an unexpected error.",
      remediation: "Retry or check logs for additional details."
    };
  }

  private normalizeEnvelope(channel: ProfileIpcChannel, payload: unknown): ProfileIpcRequestEnvelope {
    // Check if payload is already a valid envelope
    if (payload && typeof payload === "object") {
      const candidate = payload as Record<string, unknown>;
      if (
        "channel" in candidate &&
        "requestId" in candidate &&
        "timestamp" in candidate &&
        "context" in candidate &&
        "payload" in candidate
      ) {
        // Already an envelope, just validate it
        return ProfileIpcRequestEnvelopeSchema.parse(payload);
      }
    }

    // Build envelope from payload
    const base: Record<string, unknown> =
      payload && typeof payload === "object" ? { ...(payload as Record<string, unknown>) } : {};
    if (!base.channel) {
      base.channel = channel;
    }
    return ProfileIpcRequestEnvelopeSchema.parse(base);
  }

  private coercePayload(channel: ProfileIpcChannel, input: unknown): ProfileOperationRequest {
    const type = CHANNEL_OPERATION_MAP[channel];
    return { type, ...(input as Record<string, unknown>) } as ProfileOperationRequest;
  }

  private extractRequestId(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    const candidate = (payload as Record<string, unknown>).requestId;
    return typeof candidate === "string" ? candidate : null;
  }
}

function isZodError(error: unknown): boolean {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    (error as { name?: unknown }).name === "ZodError"
  );
}
