import * as ContractModule from "@metaverse-systems/llm-tutor-shared/src/contracts/llm-profile-ipc";
import { describe, expect, it } from "vitest";
import type { ZodIssue } from "zod";

describe("LLM Profile IPC contract", () => {
  it("exposes all seven channel enums", () => {
    expect(ContractModule.ProfileIpcChannelSchema.options).toEqual([
      "llmProfile:list",
      "llmProfile:create",
      "llmProfile:update",
      "llmProfile:delete",
      "llmProfile:activate",
      "llmProfile:test",
      "llmProfile:discover",
    ]);
  });

  it("validates request envelopes with operator context", () => {
    const valid = {
      channel: "llmProfile:list",
      requestId: "9d5b1c49-6579-476a-b8f1-f6cc35654820",
      timestamp: Date.now(),
      context: {
        operatorId: "6bb8f510-6c79-4c86-b6c3-5f21eb2aaf05",
        operatorRole: "instructional_technologist",
        locale: "en-US",
      },
      payload: {
        type: "list",
        filter: {
          includeDiagnostics: true,
        },
      },
    };

  const parsed = ContractModule.ProfileIpcRequestEnvelopeSchema.safeParse(valid);
    expect(parsed.success).toBe(true);

    const invalid = {
      ...valid,
      requestId: "not-a-uuid",
      timestamp: -10,
    };

  const invalidResult = ContractModule.ProfileIpcRequestEnvelopeSchema.safeParse(invalid);
    expect(invalidResult.success).toBe(false);
    expect(
      invalidResult.error?.issues.map((issue: ZodIssue) => issue.path.join(".")) ?? []
    ).toEqual(
      expect.arrayContaining(["requestId", "timestamp"])
    );
  });

  it("enforces response envelope and error codes", () => {
    expect(ContractModule.ProfileErrorCodeSchema.options).toEqual([
      "OK",
      "PROFILE_NOT_FOUND",
      "VALIDATION_ERROR",
      "CONFLICT_ACTIVE_PROFILE",
      "SAFE_STORAGE_UNAVAILABLE",
      "SERVICE_FAILURE",
      "DISCOVERY_CONFLICT",
      "VAULT_READ_ERROR",
      "RATE_LIMITED",
      "TIMEOUT",
    ]);

    const okEnvelope = {
      requestId: "aa75ad7a-6f36-4fbe-88ab-3a7c044c4550",
      channel: "llmProfile:create",
      success: true,
      code: "OK",
      data: {
        profile: {
          id: "7aab6f68-3541-4c60-a10d-11472edb4a38",
          name: "Azure GPT-4",
          providerType: "azure",
          endpointUrl: "https://example.contoso.ai",
          isActive: false,
          consentTimestamp: null,
          lastModified: Date.now(),
        },
      },
      userMessage: "Profile saved successfully.",
      remediation: null,
      debug: null,
      correlationId: "5a830afa-b9fe-4ac4-8a3d-59feca20f536",
      durationMs: 140,
      safeStorageStatus: "available",
    };

    expect(ContractModule.ProfileIpcResponseEnvelopeSchema.safeParse(okEnvelope).success).toBe(
      true
    );

    const brokenEnvelope = {
      ...okEnvelope,
      success: true,
      code: "VALIDATION_ERROR",
    };

  const brokenResult = ContractModule.ProfileIpcResponseEnvelopeSchema.safeParse(brokenEnvelope);
    expect(brokenResult.success).toBe(false);
  });

  it("defines channel-specific payload schemas", () => {
    const listPayload = {
      type: "list",
      filter: { includeDiagnostics: true, providerTypes: ["azure"] },
    };
    expect(ContractModule.ProfileOperationRequestSchema.safeParse(listPayload).success).toBe(
      true
    );

    const createPayload = {
      type: "create",
      profile: {
        name: "LLM Tutor QA",
        providerType: "openai",
        endpointUrl: "https://api.openai.com/v1",
        apiKey: "sk-test",
        modelId: "gpt-4o",
      },
    };
    expect(ContractModule.ProfileOperationRequestSchema.safeParse(createPayload).success).toBe(
      true
    );

    const listResponse = {
      profiles: [
        {
          id: "aa9d55d3-2b11-4a61-a3ef-8d474f0f9f3e",
          name: "Prod",
          providerType: "azure",
          endpointUrl: "https://azure.openai.net",
          isActive: true,
          consentTimestamp: null,
          lastModified: Date.now(),
        },
      ],
      diagnostics: [
        {
          profileId: "aa9d55d3-2b11-4a61-a3ef-8d474f0f9f3e",
          lastErrorCode: "SERVICE_FAILURE",
          lastErrorAt: Date.now(),
        },
      ],
    };
  expect(ContractModule.ListProfilesResponseSchema.safeParse(listResponse).success).toBe(true);

    const createResponse = {
      profile: listResponse.profiles[0],
    };
  expect(ContractModule.CreateProfileResponseSchema.safeParse(createResponse).success).toBe(true);

    const testResponse = {
      profileId: listResponse.profiles[0].id,
      success: true,
      latencyMs: 120,
      totalTimeMs: 180,
      modelName: "gpt-4o",
      truncatedResponse: "Hello",
    };
  expect(ContractModule.TestProfileResponseSchema.safeParse(testResponse).success).toBe(true);

    const discoverResponse = {
      providers: [
        {
          providerType: "azure",
          endpointUrl: "https://azure.example.com",
          latencyMs: 200,
          requiresConsent: true,
        },
      ],
    };
    expect(ContractModule.DiscoverProfileResponseSchema.safeParse(discoverResponse).success).toBe(
      true
    );
  });

  it("exposes diagnostics and safe storage outage schemas", () => {
  const breadcrumbResult = ContractModule.DiagnosticsBreadcrumbSchema.safeParse({
      id: "acb5401a-dac9-4b71-8206-f7f16b9a3c9a",
      channel: "llmProfile:test",
      requestId: "68ba6f47-5320-48fb-9fdf-eceae67255b0",
      correlationId: "8131ae9e-7b61-4677-90ab-ccad4b90bf52",
      operatorRole: "instructional_technologist",
      durationMs: 480,
      resultCode: "SAFE_STORAGE_UNAVAILABLE",
      safeStorageStatus: "unavailable",
      createdAt: Date.now(),
      metadata: { blockedWrite: true },
    });
    expect(breadcrumbResult.success).toBe(true);

    expect(
      ContractModule.SafeStorageOutageStateSchema.safeParse({
        isActive: true,
        startedAt: Date.now(),
        resolvedAt: null,
        blockedRequestIds: ["9c08a1b0-6da2-4d65-9635-73824cb92f4e"],
      }).success
    ).toBe(true);
  });
});
