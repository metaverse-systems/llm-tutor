import { z } from "zod";

const TODO_MESSAGE =
  "Profile IPC contract schemas are not implemented yet. Complete Phase 3.3 to satisfy tests.";

export const ProfileIpcChannelSchema = z.enum(["__todo__"]);
export type ProfileIpcChannel = z.infer<typeof ProfileIpcChannelSchema>;

export const OperatorContextSchema = z.object({
  operatorId: z.string(),
  operatorRole: z.string(),
  locale: z.string().default("en-US"),
});
export type OperatorContext = z.infer<typeof OperatorContextSchema>;

export const ProfileIpcRequestEnvelopeSchema = z.object({
  channel: ProfileIpcChannelSchema,
  requestId: z.string(),
  timestamp: z.number(),
  context: OperatorContextSchema,
  payload: z.unknown(),
});
export type ProfileIpcRequestEnvelope = z.infer<typeof ProfileIpcRequestEnvelopeSchema>;

export const ProfileErrorCodeSchema = z.enum(["OK"]);
export type ProfileErrorCode = z.infer<typeof ProfileErrorCodeSchema>;

export const ProfileIpcResponseEnvelopeSchema = z.object({
  requestId: z.string(),
  channel: ProfileIpcChannelSchema,
  success: z.boolean(),
  code: ProfileErrorCodeSchema,
  data: z.unknown().nullable(),
  userMessage: z.string(),
  remediation: z.string().nullable().optional(),
  debug: z.unknown().nullable().optional(),
  correlationId: z.string(),
  durationMs: z.number(),
  safeStorageStatus: z.enum(["available", "unavailable"]),
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
