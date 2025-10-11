import { z } from "zod";

const TODO_MESSAGE =
  "Profile IPC contract schemas are not implemented yet. Complete Phase 3.3 to satisfy tests.";

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

const LOCALE_REGEX = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;

export const ProfileIpcChannelSchema = z.enum(PROFILE_IPC_CHANNELS);
export type ProfileIpcChannel = z.infer<typeof ProfileIpcChannelSchema>;

export const OperatorContextSchema = z.object({
  operatorId: z.string().uuid(),
  operatorRole: z.enum(OPERATOR_ROLES),
  locale: z
    .string()
    .regex(LOCALE_REGEX, "locale must be a valid BCP-47 tag (e.g. en-US)")
    .default("en-US")
});
export type OperatorContext = z.infer<typeof OperatorContextSchema>;

export const ProfileIpcRequestEnvelopeSchema = z.object({
  channel: ProfileIpcChannelSchema,
  requestId: z.string().uuid(),
  timestamp: z
    .number()
    .int()
    .min(0, "timestamp must be a positive epoch value")
    .refine(
      (value) => Math.abs(Date.now() - value) <= FIVE_MINUTES_IN_MS,
      "timestamp must be within ±5 minutes of current time"
    ),
  context: OperatorContextSchema,
  payload: z.unknown()
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

const debugDetailsSchema = z
  .object({
    message: z.string(),
    stack: z.string().optional()
  })
  .nullable()
  .optional();

export const ProfileIpcResponseEnvelopeSchema = z
  .object({
    requestId: z.string().uuid(),
    channel: ProfileIpcChannelSchema,
    success: z.boolean(),
    code: ProfileErrorCodeSchema,
    data: z.unknown().nullable(),
    userMessage: z.string().min(1).max(200),
    remediation: z.string().min(1).nullable().optional(),
    debug: debugDetailsSchema,
    correlationId: z.string().uuid(),
    durationMs: z.number().int().min(0),
    safeStorageStatus: z.enum(["available", "unavailable"])
  })
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

export const ProfileListFilterSchema = z.object({
  providerTypes: z.array(z.string()).optional(),
  includeDiagnostics: z.boolean().optional(),
});
export type ProfileListFilter = z.infer<typeof ProfileListFilterSchema>;

export const DraftProfileSchema = z.object({
  name: z.string(),
  providerType: z.string(),
  endpointUrl: z.string(),
  apiKey: z.string(),
  modelId: z.string().nullable().optional(),
  consentTimestamp: z.number().nullable().optional(),
});
export type DraftProfile = z.infer<typeof DraftProfileSchema>;

export const DiscoveryScopeSchema = z.object({
  strategy: z.enum(["local", "remote"]).catch("local"),
  timeoutMs: z.number().default(3000),
});
export type DiscoveryScope = z.infer<typeof DiscoveryScopeSchema>;

export const ProfileOperationRequestSchema = z.any();
export type ProfileOperationRequest = z.infer<typeof ProfileOperationRequestSchema>;

export const ProfileSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  providerType: z.string(),
  endpointUrl: z.string(),
  isActive: z.boolean().default(false),
  consentTimestamp: z.number().nullable().optional(),
  lastModified: z.number().optional(),
});
export type ProfileSummary = z.infer<typeof ProfileSummarySchema>;

export const ProfileDiagnosticsSummarySchema = z.object({
  profileId: z.string(),
  lastErrorCode: ProfileErrorCodeSchema.nullable().optional(),
  lastErrorAt: z.number().nullable().optional(),
});
export type ProfileDiagnosticsSummary = z.infer<typeof ProfileDiagnosticsSummarySchema>;

export const ListProfilesResponseSchema = z.object({
  profiles: z.array(ProfileSummarySchema),
  diagnostics: z.array(ProfileDiagnosticsSummarySchema).optional(),
});
export type ListProfilesResponse = z.infer<typeof ListProfilesResponseSchema>;

export const CreateProfileResponseSchema = z.object({
  profile: ProfileSummarySchema,
});
export type CreateProfileResponse = z.infer<typeof CreateProfileResponseSchema>;

export const DeleteProfileResponseSchema = z.object({
  deletedId: z.string(),
  successorProfileId: z.string().nullable().optional(),
});
export type DeleteProfileResponse = z.infer<typeof DeleteProfileResponseSchema>;

export const ActivateProfileResponseSchema = z.object({
  activeProfile: ProfileSummarySchema,
  previousProfileId: z.string().nullable().optional(),
});
export type ActivateProfileResponse = z.infer<typeof ActivateProfileResponseSchema>;

export const TestProfileResponseSchema = z.object({
  profileId: z.string(),
  success: z.boolean(),
  latencyMs: z.number().nullable().optional(),
  totalTimeMs: z.number().optional(),
  modelName: z.string().nullable().optional(),
  truncatedResponse: z.string().nullable().optional(),
});
export type TestProfileResponse = z.infer<typeof TestProfileResponseSchema>;

export const DiscoverProfileResponseSchema = z.object({
  providers: z.array(
    z.object({
      providerType: z.string(),
      endpointUrl: z.string(),
      latencyMs: z.number().nullable().optional(),
      requiresConsent: z.boolean().optional(),
    })
  ),
});
export type DiscoverProfileResponse = z.infer<typeof DiscoverProfileResponseSchema>;

export const DiagnosticsBreadcrumbSchema = z.object({
  id: z.string(),
  channel: ProfileIpcChannelSchema,
  requestId: z.string(),
  correlationId: z.string(),
  operatorRole: z.string(),
  durationMs: z.number(),
  resultCode: ProfileErrorCodeSchema,
  safeStorageStatus: z.enum(["available", "unavailable"]),
  createdAt: z.number(),
  metadata: z.record(z.unknown()).optional(),
});
export type DiagnosticsBreadcrumb = z.infer<typeof DiagnosticsBreadcrumbSchema>;

export const SafeStorageOutageStateSchema = z.object({
  isActive: z.boolean().default(false),
  startedAt: z.number().nullable().optional(),
  resolvedAt: z.number().nullable().optional(),
  blockedRequestIds: z.array(z.string()).default([]),
});
export type SafeStorageOutageState = z.infer<typeof SafeStorageOutageStateSchema>;

export const TODO = () => {
  throw new Error(TODO_MESSAGE);
};
