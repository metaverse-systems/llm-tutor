import { z } from "zod";

import { ProviderTypeSchema, type ProviderType } from "../llm/schemas.js";
import { generateUUID } from "../utils/uuid.js";

const PROFILE_IPC_CHANNELS = [
  "llmProfile:list",
  "llmProfile:create",
  "llmProfile:update",
  "llmProfile:delete",
  "llmProfile:activate",
  "llmProfile:test",
  "llmProfile:discover"
] as const;

const OPERATOR_ROLES = [
  "instructional_technologist",
  "curriculum_lead",
  "support_engineer"
] as const;

const SAFE_STORAGE_STATUSES = ["available", "unavailable"] as const;
const DISCOVERY_STRATEGIES = ["local", "remote"] as const;

const LOCALE_REGEX = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;

const MAX_PROFILE_NAME_LENGTH = 100;
const MAX_API_KEY_LENGTH = 256;
const MAX_MODEL_ID_LENGTH = 120;
const MAX_USER_MESSAGE_LENGTH = 200;
const MAX_REMEDIATION_LENGTH = 200;
const MAX_PROMPT_PREVIEW_LENGTH = 500;
const MAX_DISCOVERED_PROVIDERS = 25;
const MAX_BLOCKED_REQUEST_IDS = 50;

const MIN_DISCOVERY_TIMEOUT_MS = 500;
const MAX_DISCOVERY_TIMEOUT_MS = 5000;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 3000;

const MIN_TEST_TIMEOUT_MS = 1000;
const MAX_TEST_TIMEOUT_MS = 10000;
const DEFAULT_TEST_TIMEOUT_MS = 10000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function hasUniqueValues<T>(values: readonly T[] | undefined): boolean {
  if (!values) {
    return true;
  }
  return new Set(values).size === values.length;
}

function sanitizeSpaces(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeUrl(value: string): string {
  return value.trim();
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function ensureRemediation(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const sanitised = sanitizeSpaces(value, MAX_REMEDIATION_LENGTH);
  return sanitised.length > 0 ? sanitised : null;
}

function sanitizeMetadata(metadata: Record<string, unknown> | undefined | null): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object") {
    return { sanitized: true };
  }

  const forbiddenKeys = ["apikey", "api_key", "prompt", "rawprompt", "raw_prompt"];
  const entries = Object.entries(metadata).filter(([key]) => {
    const lowerKey = key.toLowerCase();
    return !forbiddenKeys.some((forbidden) => lowerKey.includes(forbidden));
  });

  return { sanitized: true, ...Object.fromEntries(entries) };
}

function normalizeDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return 0;
  }
  return Math.round(durationMs);
}

export const SafeStorageStatusSchema = z.enum(SAFE_STORAGE_STATUSES);
export type SafeStorageStatus = z.infer<typeof SafeStorageStatusSchema>;

export const ProfileIpcChannelSchema = z.enum(PROFILE_IPC_CHANNELS);
export type ProfileIpcChannel = z.infer<typeof ProfileIpcChannelSchema>;

export const OperatorContextSchema = z
  .object({
    operatorId: z.string().uuid(),
    operatorRole: z.enum(OPERATOR_ROLES),
    locale: z
      .string()
      .regex(LOCALE_REGEX, "locale must be a valid BCP-47 tag (e.g. en-US)")
      .default("en-US")
  })
  .strict();
export type OperatorContext = z.infer<typeof OperatorContextSchema>;

const ProviderTypesSchema = z
  .array(ProviderTypeSchema)
  .min(1, "providerTypes must include at least one entry")
  .max(10, "providerTypes cannot exceed 10 entries")
  .superRefine((providerTypes, ctx) => {
    if (!hasUniqueValues(providerTypes)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "providerTypes must not contain duplicate entries",
        path: []
      });
    }
  });

export const ProfileListFilterSchema = z
  .object({
    providerTypes: ProviderTypesSchema.optional(),
    includeDiagnostics: z.boolean().optional()
  })
  .strict();
export type ProfileListFilter = z.infer<typeof ProfileListFilterSchema>;

const DraftProfileCoreSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_PROFILE_NAME_LENGTH),
    providerType: ProviderTypeSchema,
    endpointUrl: z.string().trim().url(),
    apiKey: z.string().trim().min(1).max(MAX_API_KEY_LENGTH),
    modelId: z.string().trim().min(1).max(MAX_MODEL_ID_LENGTH).nullable().optional(),
    consentTimestamp: z
      .number()
      .int("consentTimestamp must be an integer")
      .min(0, "consentTimestamp must be a positive epoch value")
      .nullable()
      .optional()
  })
  .strict();

export const DraftProfileSchema = DraftProfileCoreSchema.superRefine((draft, ctx) => {
  try {
    const parsedUrl = new URL(draft.endpointUrl);
    const requiresHttps = draft.providerType !== "llama.cpp";
    if (requiresHttps && parsedUrl.protocol !== "https:") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endpointUrl must use HTTPS for remote providers",
        path: ["endpointUrl"]
      });
    }
    if (!parsedUrl.hostname) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endpointUrl must include a valid hostname",
        path: ["endpointUrl"]
      });
    }
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "endpointUrl must be a valid URL",
      path: ["endpointUrl"]
    });
  }
});
export type DraftProfile = z.infer<typeof DraftProfileSchema>;

const DraftProfileUpdateSchema = DraftProfileCoreSchema.partial().strict();

export const DiscoveryScopeSchema = z
  .object({
    strategy: z.enum(DISCOVERY_STRATEGIES).default("local"),
    timeoutMs: z
      .number()
      .int("timeoutMs must be an integer")
      .optional()
      .transform((value) => {
        if (typeof value !== "number") {
          return DEFAULT_DISCOVERY_TIMEOUT_MS;
        }
        return clamp(value, MIN_DISCOVERY_TIMEOUT_MS, MAX_DISCOVERY_TIMEOUT_MS);
      }),
    includeExisting: z.boolean().optional().default(false)
  })
  .strict();
export type DiscoveryScope = z.infer<typeof DiscoveryScopeSchema>;

const ListProfilesRequestSchema = z
  .object({
    type: z.literal("list"),
    filter: ProfileListFilterSchema.optional()
  })
  .strict();

const CreateProfileRequestSchema = z
  .object({
    type: z.literal("create"),
    profile: DraftProfileSchema
  })
  .strict();

const UpdateProfileRequestSchema = z
  .object({
    type: z.literal("update"),
    profileId: z.string().uuid(),
    changes: DraftProfileUpdateSchema
  })
  .strict()
  .superRefine((request, ctx) => {
    if (Object.keys(request.changes).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "changes must include at least one field",
        path: ["changes"]
      });
    }

    if (request.changes.endpointUrl) {
      try {
        const parsedUrl = new URL(request.changes.endpointUrl);
        const providerType: ProviderType | undefined = request.changes.providerType;
        const requiresHttps = providerType ? providerType !== "llama.cpp" : false;
        if (requiresHttps && parsedUrl.protocol !== "https:") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "endpointUrl must use HTTPS for remote providers",
            path: ["changes", "endpointUrl"]
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "endpointUrl must be a valid URL",
          path: ["changes", "endpointUrl"]
        });
      }
    }
  });

const DeleteProfileRequestSchema = z
  .object({
    type: z.literal("delete"),
    profileId: z.string().uuid(),
    successorProfileId: z.string().uuid().nullable().optional()
  })
  .strict();

const ActivateProfileRequestSchema = z
  .object({
    type: z.literal("activate"),
    profileId: z.string().uuid(),
    force: z.boolean().optional()
  })
  .strict();

const TestProfileRequestSchema = z
  .object({
    type: z.literal("test"),
    profileId: z.string().uuid(),
    promptOverride: z.string().trim().min(1).max(2000).optional(),
    timeoutMs: z
      .number()
      .int("timeoutMs must be an integer")
      .optional()
      .transform((value) => {
        if (typeof value !== "number") {
          return DEFAULT_TEST_TIMEOUT_MS;
        }
        return clamp(value, MIN_TEST_TIMEOUT_MS, MAX_TEST_TIMEOUT_MS);
      })
  })
  .strict();

const DiscoverProfileRequestSchema = z
  .object({
    type: z.literal("discover"),
    scope: DiscoveryScopeSchema
  })
  .strict();

export const ProfileOperationRequestSchema = z.union([
  ListProfilesRequestSchema,
  CreateProfileRequestSchema,
  UpdateProfileRequestSchema,
  DeleteProfileRequestSchema,
  ActivateProfileRequestSchema,
  TestProfileRequestSchema,
  DiscoverProfileRequestSchema
]);
export type ProfileOperationRequest = z.infer<typeof ProfileOperationRequestSchema>;
export type ProfileOperationRequestType = ProfileOperationRequest["type"];

const CHANNEL_TO_OPERATION_TYPE: Record<ProfileIpcChannel, ProfileOperationRequestType> = {
  "llmProfile:list": "list",
  "llmProfile:create": "create",
  "llmProfile:update": "update",
  "llmProfile:delete": "delete",
  "llmProfile:activate": "activate",
  "llmProfile:test": "test",
  "llmProfile:discover": "discover"
};

export const ProfileIpcRequestEnvelopeSchema = z
  .object({
    channel: ProfileIpcChannelSchema,
    requestId: z.string().uuid(),
    timestamp: z
      .number()
      .int("timestamp must be an integer")
      .min(0, "timestamp must be a positive epoch value")
      .refine(
        (value) => Math.abs(Date.now() - value) <= FIVE_MINUTES_IN_MS,
        "timestamp must be within ±5 minutes of current time"
      ),
    context: OperatorContextSchema,
    payload: ProfileOperationRequestSchema
  })
  .strict()
  .superRefine((envelope, ctx) => {
    const expectedType = CHANNEL_TO_OPERATION_TYPE[envelope.channel];
    if (envelope.payload.type !== expectedType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `payload type '${envelope.payload.type}' does not match channel '${envelope.channel}'`,
        path: ["payload", "type"]
      });
    }
  });
export type ProfileIpcRequestEnvelope = z.infer<typeof ProfileIpcRequestEnvelopeSchema>;

export const ProfileErrorCodeSchema = z.enum([
  "OK",
  "PROFILE_NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT_ACTIVE_PROFILE",
  "SAFE_STORAGE_UNAVAILABLE",
  "SERVICE_FAILURE",
  "DISCOVERY_CONFLICT",
  "VAULT_READ_ERROR",
  "RATE_LIMITED",
  "TIMEOUT"
]);
export type ProfileErrorCode = z.infer<typeof ProfileErrorCodeSchema>;

export const DebugDetailsSchema = z
  .object({
    message: z.string().min(1).max(500),
    stack: z.string().min(1).max(4000).optional()
  })
  .strict();
export type DebugDetails = z.infer<typeof DebugDetailsSchema>;

export const ProfileIpcResponseEnvelopeSchema = z
  .object({
    requestId: z.string().uuid(),
    channel: ProfileIpcChannelSchema,
    success: z.boolean(),
    code: ProfileErrorCodeSchema,
    data: z.unknown().nullable(),
    userMessage: z.string().min(1).max(MAX_USER_MESSAGE_LENGTH),
    remediation: z.string().min(1).max(MAX_REMEDIATION_LENGTH).nullable().optional(),
    debug: DebugDetailsSchema.nullable().optional().default(null),
    correlationId: z.string().uuid(),
    durationMs: z.number().int().min(0),
    safeStorageStatus: SafeStorageStatusSchema
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.success && value.code !== "OK") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "success responses must use code 'OK'",
        path: ["code"]
      });
    }
    if (!value.success && value.code === "OK") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "non-success responses must use an error code",
        path: ["code"]
      });
    }
  });
export type ProfileIpcResponseEnvelope = z.infer<typeof ProfileIpcResponseEnvelopeSchema>;
export type ProfileOperationResponse<TData = unknown> = Omit<ProfileIpcResponseEnvelope, "data"> & {
  data: TData | null;
};

export const ProfileSummarySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(MAX_PROFILE_NAME_LENGTH),
    providerType: ProviderTypeSchema,
    endpointUrl: z.string().trim().url(),
    isActive: z.boolean(),
    consentTimestamp: z
      .number()
      .int("consentTimestamp must be an integer")
      .min(0, "consentTimestamp must be a positive epoch value")
      .nullable()
      .optional()
      .default(null),
    lastModified: z
      .number()
      .int("lastModified must be an integer")
      .min(0, "lastModified must be a positive epoch value")
  })
  .strict();
export type ProfileSummary = z.infer<typeof ProfileSummarySchema>;

export const ProfileDiagnosticsSummarySchema = z
  .object({
    profileId: z.string().uuid(),
    lastErrorCode: ProfileErrorCodeSchema.nullable().optional(),
    lastErrorAt: z
      .number()
      .int("lastErrorAt must be an integer")
      .min(0, "lastErrorAt must be a positive epoch value")
      .nullable()
      .optional()
  })
  .strict();
export type ProfileDiagnosticsSummary = z.infer<typeof ProfileDiagnosticsSummarySchema>;

export const ListProfilesResponseSchema = z
  .object({
    profiles: z.array(ProfileSummarySchema),
    diagnostics: z.array(ProfileDiagnosticsSummarySchema).optional()
  })
  .strict();
export type ListProfilesResponse = z.infer<typeof ListProfilesResponseSchema>;

export const CreateProfileResponseSchema = z
  .object({
    profile: ProfileSummarySchema
  })
  .strict();
export type CreateProfileResponse = z.infer<typeof CreateProfileResponseSchema>;

export const UpdateProfileResponseSchema = z
  .object({
    profile: ProfileSummarySchema
  })
  .strict();
export type UpdateProfileResponse = z.infer<typeof UpdateProfileResponseSchema>;

export const DeleteProfileResponseSchema = z
  .object({
    deletedId: z.string().uuid(),
    successorProfileId: z.string().uuid().nullable().optional()
  })
  .strict();
export type DeleteProfileResponse = z.infer<typeof DeleteProfileResponseSchema>;

export const ActivateProfileResponseSchema = z
  .object({
    activeProfile: ProfileSummarySchema,
    previousProfileId: z.string().uuid().nullable().optional()
  })
  .strict();
export type ActivateProfileResponse = z.infer<typeof ActivateProfileResponseSchema>;

export const TestProfileResponseSchema = z
  .object({
    profileId: z.string().uuid(),
    success: z.boolean(),
    latencyMs: z
      .number()
      .int("latencyMs must be an integer")
      .min(0, "latencyMs must be non-negative")
      .nullable()
      .optional(),
    totalTimeMs: z
      .number()
      .int("totalTimeMs must be an integer")
      .min(0, "totalTimeMs must be non-negative"),
    modelName: z.string().trim().min(1).max(120).nullable().optional(),
    truncatedResponse: z.string().trim().max(MAX_PROMPT_PREVIEW_LENGTH).nullable().optional()
  })
  .strict();
export type TestProfileResponse = z.infer<typeof TestProfileResponseSchema>;

const DiscoveredProviderSchema = z
  .object({
    providerType: ProviderTypeSchema,
    endpointUrl: z.string().trim().url(),
    latencyMs: z
      .number()
      .int("latencyMs must be an integer")
      .min(0, "latencyMs must be non-negative")
      .nullable()
      .optional(),
    requiresConsent: z.boolean().optional()
  })
  .strict();
export type DiscoveredProvider = z.infer<typeof DiscoveredProviderSchema>;

export const DiscoverProfileResponseSchema = z
  .object({
    providers: z.array(DiscoveredProviderSchema).max(MAX_DISCOVERED_PROVIDERS)
  })
  .strict();
export type DiscoverProfileResponse = z.infer<typeof DiscoverProfileResponseSchema>;

const DiagnosticsMetadataSchema = z
  .record(z.unknown())
  .optional()
  .transform((metadata) => sanitizeMetadata(metadata ?? null));

export const DiagnosticsBreadcrumbSchema = z
  .object({
    id: z.string().uuid(),
    channel: ProfileIpcChannelSchema,
    requestId: z.string().uuid(),
    correlationId: z.string().uuid(),
    operatorRole: z.enum(OPERATOR_ROLES),
    durationMs: z.number().int().min(0),
    resultCode: ProfileErrorCodeSchema,
    safeStorageStatus: SafeStorageStatusSchema,
    createdAt: z.number().int().min(0),
    metadata: DiagnosticsMetadataSchema
  })
  .strict();
export type DiagnosticsBreadcrumb = z.infer<typeof DiagnosticsBreadcrumbSchema>;

export const SafeStorageOutageStateSchema = z
  .object({
    isActive: z.boolean(),
    startedAt: z.number().int().min(0).nullable().optional(),
    resolvedAt: z.number().int().min(0).nullable().optional(),
    blockedRequestIds: z
      .array(z.string().uuid())
      .default([])
      .transform((ids) => ids.slice(-MAX_BLOCKED_REQUEST_IDS))
  })
  .strict();
export type SafeStorageOutageState = z.infer<typeof SafeStorageOutageStateSchema>;

export function sanitizeProfileSummary(summary: ProfileSummary): ProfileSummary {
  return {
    ...summary,
    name: sanitizeSpaces(summary.name, MAX_PROFILE_NAME_LENGTH),
    endpointUrl: sanitizeUrl(summary.endpointUrl)
  };
}

export function sanitizeProfileSummaries(summaries: readonly ProfileSummary[]): ProfileSummary[] {
  return summaries.map((summary) => sanitizeProfileSummary(summary));
}

export function sanitizeDiagnosticsMetadata(metadata?: Record<string, unknown> | null): Record<string, unknown> {
  return sanitizeMetadata(metadata);
}

export function sanitizePromptPreview(preview: string | null | undefined): string | null {
  if (preview === undefined || preview === null) {
    return null;
  }
  const sanitised = sanitizeSpaces(preview, MAX_PROMPT_PREVIEW_LENGTH);
  return sanitised.length > 0 ? sanitised : null;
}

interface BuildResponseParams<TData> {
  requestId: string;
  channel: ProfileIpcChannel;
  success: boolean;
  code: ProfileErrorCode;
  data: TData | null;
  userMessage: string;
  remediation?: string | null;
  debug?: DebugDetails | null;
  correlationId?: string | null;
  durationMs: number;
  safeStorageStatus: SafeStorageStatus;
}

function buildProfileResponse<TData>(params: BuildResponseParams<TData>): ProfileOperationResponse<TData> {
  const correlationId = isUuid(params.correlationId) ? params.correlationId : generateProfileCorrelationId();
  const remediation = ensureRemediation(params.remediation ?? null);

  return {
    requestId: params.requestId,
    channel: params.channel,
    success: params.success,
    code: params.code,
    data: params.data,
    userMessage: sanitizeSpaces(params.userMessage, MAX_USER_MESSAGE_LENGTH),
    remediation,
    debug: params.debug ?? null,
    correlationId,
    durationMs: normalizeDuration(params.durationMs),
    safeStorageStatus: params.safeStorageStatus
  };
}

export interface ProfileSuccessResponseParams<TData> {
  requestId: string;
  channel: ProfileIpcChannel;
  data: TData;
  userMessage: string;
  remediation?: string | null;
  debug?: DebugDetails | null;
  correlationId?: string | null;
  durationMs: number;
  safeStorageStatus: SafeStorageStatus;
}

export function createProfileSuccessResponse<TData>(
  params: ProfileSuccessResponseParams<TData>
): ProfileOperationResponse<TData> {
  return buildProfileResponse<TData>({
    ...params,
    success: true,
    code: "OK",
    data: params.data
  });
}

export interface ProfileErrorResponseParams<TData = unknown> {
  requestId: string;
  channel: ProfileIpcChannel;
  code: Exclude<ProfileErrorCode, "OK">;
  userMessage: string;
  data?: TData | null;
  remediation?: string | null;
  debug?: DebugDetails | null;
  correlationId?: string | null;
  durationMs: number;
  safeStorageStatus: SafeStorageStatus;
}

export function createProfileErrorResponse<TData = unknown>(
  params: ProfileErrorResponseParams<TData>
): ProfileOperationResponse<TData> {
  return buildProfileResponse<TData>({
    ...params,
    success: false,
    data: params.data ?? null
  });
}

export function isProfileCorrelationId(value: unknown): value is string {
  return isUuid(value);
}

export function generateProfileCorrelationId(): string {
  return generateUUID();
}

export function ensureProfileCorrelationId(value?: string | null): string {
  return isProfileCorrelationId(value) ? value : generateProfileCorrelationId();
}
