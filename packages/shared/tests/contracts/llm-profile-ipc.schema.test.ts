import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ProfileIpcChannelSchema,
  OperatorContextSchema,
  ProfileListFilterSchema,
  DraftProfileSchema,
  DiscoveryScopeSchema,
  ProfileErrorCodeSchema,
  SafeStorageStatusSchema,
  SafeStorageOutageStateSchema,
  DiagnosticsBreadcrumbSchema,
  ProfileIpcRequestEnvelopeSchema,
  sanitizeProfileSummaries,
  sanitizePromptPreview,
  ensureProfileCorrelationId,
  type ProfileIpcChannel,
  type OperatorContext,
  type DraftProfile,
  type DiscoveryScope
} from "../../src/contracts/llm-profile-ipc";

describe("ProfileIpcChannelSchema", () => {
  it("accepts valid channel names", () => {
    const validChannels: ProfileIpcChannel[] = [
      "llmProfile:list",
      "llmProfile:create",
      "llmProfile:update",
      "llmProfile:delete",
      "llmProfile:activate",
      "llmProfile:test",
      "llmProfile:discover"
    ];

    validChannels.forEach((channel) => {
      expect(ProfileIpcChannelSchema.parse(channel)).toBe(channel);
    });
  });

  it("rejects invalid channel names", () => {
    expect(() => ProfileIpcChannelSchema.parse("llmProfile:invalid")).toThrow();
    expect(() => ProfileIpcChannelSchema.parse("other:list")).toThrow();
  });
});

describe("OperatorContextSchema", () => {
  const validContext: OperatorContext = {
    operatorId: "9f1a4a1a-7b11-4a12-a9f0-0a6f4ce04f65",
    operatorRole: "support_engineer",
    locale: "en-US"
  };

  it("validates complete operator context", () => {
    const result = OperatorContextSchema.parse(validContext);
    expect(result).toEqual(validContext);
  });

  it("accepts all valid operator roles", () => {
    ["instructional_technologist", "curriculum_lead", "support_engineer"].forEach((role) => {
      const context = { ...validContext, operatorRole: role };
      expect(() => OperatorContextSchema.parse(context)).not.toThrow();
    });
  });

  it("defaults locale to en-US when not provided", () => {
    const context = {
      operatorId: validContext.operatorId,
      operatorRole: validContext.operatorRole
    };
    const result = OperatorContextSchema.parse(context);
    expect(result.locale).toBe("en-US");
  });

  it("accepts valid BCP-47 locales", () => {
    const validLocales = ["en", "en-US", "es", "es-MX", "fr-CA", "zh"];
    validLocales.forEach((locale) => {
      const context = { ...validContext, locale };
      expect(() => OperatorContextSchema.parse(context)).not.toThrow();
    });
  });

  it("rejects invalid locales", () => {
    const invalidLocales = ["english", "en_US", "123", "EN-us"];
    invalidLocales.forEach((locale) => {
      const context = { ...validContext, locale };
      expect(() => OperatorContextSchema.parse(context)).toThrow(/locale must be a valid BCP-47 tag/);
    });
  });

  it("rejects invalid operator ID", () => {
    const context = { ...validContext, operatorId: "not-a-uuid" };
    expect(() => OperatorContextSchema.parse(context)).toThrow();
  });

  it("rejects invalid operator role", () => {
    const context = { ...validContext, operatorRole: "admin" };
    expect(() => OperatorContextSchema.parse(context)).toThrow();
  });

  it("rejects extra fields", () => {
    const context = { ...validContext, extra: "field" };
    expect(() => OperatorContextSchema.parse(context)).toThrow();
  });
});

describe("ProfileListFilterSchema", () => {
  it("accepts empty filter", () => {
    const result = ProfileListFilterSchema.parse({});
    expect(result).toEqual({});
  });

  it("accepts includeDiagnostics flag", () => {
    const filter = { includeDiagnostics: true };
    expect(ProfileListFilterSchema.parse(filter)).toEqual(filter);
  });

  it("accepts providerTypes array", () => {
    const filter = { providerTypes: ["llama.cpp", "azure"] };
    expect(ProfileListFilterSchema.parse(filter)).toEqual(filter);
  });

  it("rejects empty providerTypes array", () => {
    const filter = { providerTypes: [] };
    expect(() => ProfileListFilterSchema.parse(filter)).toThrow(/at least one entry/);
  });

  it("rejects duplicate providerTypes", () => {
    const filter = { providerTypes: ["llama.cpp", "llama.cpp"] };
    expect(() => ProfileListFilterSchema.parse(filter)).toThrow(/duplicate entries/);
  });

  it("rejects too many providerTypes", () => {
    const filter = { providerTypes: Array(11).fill("llama.cpp") };
    expect(() => ProfileListFilterSchema.parse(filter)).toThrow(/cannot exceed 10 entries/);
  });
});

describe("DraftProfileSchema", () => {
  const validLocalProfile: DraftProfile = {
    name: "Local Model",
    providerType: "llama.cpp",
    endpointUrl: "http://localhost:8080",
    apiKey: "test-key",
    modelId: null,
    consentTimestamp: null
  };

  const validRemoteProfile: DraftProfile = {
    name: "Azure Model",
    providerType: "azure",
    endpointUrl: "https://example.openai.azure.com",
    apiKey: "azure-key-123",
    modelId: "gpt-4",
    consentTimestamp: Date.now()
  };

  it("validates local llama.cpp profile", () => {
    const result = DraftProfileSchema.parse(validLocalProfile);
    expect(result.name).toBe("Local Model");
    expect(result.providerType).toBe("llama.cpp");
  });

  it("validates remote Azure profile", () => {
    const result = DraftProfileSchema.parse(validRemoteProfile);
    expect(result.providerType).toBe("azure");
    expect(result.endpointUrl).toContain("https://");
  });

  it("trims whitespace from name", () => {
    const profile = { ...validLocalProfile, name: "  Trimmed  " };
    const result = DraftProfileSchema.parse(profile);
    expect(result.name).toBe("Trimmed");
  });

  it("rejects empty name", () => {
    const profile = { ...validLocalProfile, name: "" };
    expect(() => DraftProfileSchema.parse(profile)).toThrow();
  });

  it("rejects name exceeding max length", () => {
    const profile = { ...validLocalProfile, name: "a".repeat(101) };
    expect(() => DraftProfileSchema.parse(profile)).toThrow();
  });

  it("requires HTTPS for remote providers", () => {
    const profile = { ...validRemoteProfile, endpointUrl: "http://example.openai.azure.com" };
    expect(() => DraftProfileSchema.parse(profile)).toThrow(/must use HTTPS for remote providers/);
  });

  it("allows HTTP for llama.cpp", () => {
    const profile = { ...validLocalProfile, endpointUrl: "http://localhost:8080" };
    expect(() => DraftProfileSchema.parse(profile)).not.toThrow();
  });

  it("rejects invalid URL", () => {
    const profile = { ...validLocalProfile, endpointUrl: "not-a-url" };
    expect(() => DraftProfileSchema.parse(profile)).toThrow(/must be a valid URL/);
  });

  it("rejects URL without hostname", () => {
    const profile = { ...validLocalProfile, endpointUrl: "http://" };
    expect(() => DraftProfileSchema.parse(profile)).toThrow(/must include a valid hostname/);
  });

  it("accepts null modelId", () => {
    const profile = { ...validLocalProfile, modelId: null };
    expect(() => DraftProfileSchema.parse(profile)).not.toThrow();
  });

  it("accepts undefined modelId", () => {
    const { modelId, ...profileWithout } = validLocalProfile;
    expect(() => DraftProfileSchema.parse(profileWithout)).not.toThrow();
  });

  it("rejects invalid consentTimestamp", () => {
    const profile = { ...validRemoteProfile, consentTimestamp: -100 };
    expect(() => DraftProfileSchema.parse(profile)).toThrow(/positive epoch value/);
  });
});

describe("DiscoveryScopeSchema", () => {
  it("defaults strategy to local", () => {
    const result = DiscoveryScopeSchema.parse({});
    expect(result.strategy).toBe("local");
  });

  it("defaults includeExisting to false", () => {
    const result = DiscoveryScopeSchema.parse({});
    expect(result.includeExisting).toBe(false);
  });

  it("accepts valid strategies", () => {
    ["local", "remote"].forEach((strategy) => {
      const scope = { strategy };
      const result = DiscoveryScopeSchema.parse(scope);
      expect(result.strategy).toBe(strategy);
    });
  });

  it("clamps timeoutMs to valid range", () => {
    expect(DiscoveryScopeSchema.parse({ timeoutMs: 100 }).timeoutMs).toBe(500);
    expect(DiscoveryScopeSchema.parse({ timeoutMs: 10000 }).timeoutMs).toBe(5000);
    expect(DiscoveryScopeSchema.parse({ timeoutMs: 2000 }).timeoutMs).toBe(2000);
  });

  it("defaults timeoutMs when not provided", () => {
    const result = DiscoveryScopeSchema.parse({});
    expect(result.timeoutMs).toBe(3000);
  });
});

describe("ProfileErrorCodeSchema", () => {
  it("accepts valid error codes", () => {
    const validCodes = [
      "OK",
      "VALIDATION_ERROR",
      "PROFILE_NOT_FOUND",
      "VAULT_READ_ERROR",
      "VAULT_WRITE_ERROR",
      "SAFE_STORAGE_UNAVAILABLE",
      "TIMEOUT",
      "NETWORK_ERROR",
      "UNKNOWN_ERROR"
    ];

    validCodes.forEach((code) => {
      expect(ProfileErrorCodeSchema.parse(code)).toBe(code);
    });
  });

  it("rejects invalid error codes", () => {
    expect(() => ProfileErrorCodeSchema.parse("INVALID_CODE")).toThrow();
  });
});

describe("SafeStorageStatusSchema", () => {
  it("accepts available status", () => {
    expect(SafeStorageStatusSchema.parse("available")).toBe("available");
  });

  it("accepts unavailable status", () => {
    expect(SafeStorageStatusSchema.parse("unavailable")).toBe("unavailable");
  });

  it("rejects invalid status", () => {
    expect(() => SafeStorageStatusSchema.parse("unknown")).toThrow();
  });
});

describe("SafeStorageOutageStateSchema", () => {
  it("validates complete outage state", () => {
    const state = {
      isActive: true,
      startedAt: Date.now(),
      resolvedAt: null,
      blockedRequestIds: ["req-1", "req-2"]
    };
    const result = SafeStorageOutageStateSchema.parse(state);
    expect(result.isActive).toBe(true);
    expect(result.blockedRequestIds).toHaveLength(2);
  });

  it("accepts inactive state with no timestamps", () => {
    const state = {
      isActive: false,
      startedAt: null,
      resolvedAt: null,
      blockedRequestIds: []
    };
    expect(() => SafeStorageOutageStateSchema.parse(state)).not.toThrow();
  });

  it("limits blocked request IDs", () => {
    const state = {
      isActive: true,
      startedAt: Date.now(),
      resolvedAt: null,
      blockedRequestIds: Array(51).fill("req")
    };
    expect(() => SafeStorageOutageStateSchema.parse(state)).toThrow(/cannot exceed 50 entries/);
  });
});

describe("DiagnosticsBreadcrumbSchema", () => {
  const validBreadcrumb = {
    id: "9f1a4a1a-7b11-4a12-a9f0-0a6f4ce04f65",
    channel: "llmProfile:list" as const,
    requestId: "8e1a3a1a-6b11-4a12-a9f0-0a6f4ce04f64",
    correlationId: "7d1a2a1a-5b11-4a12-a9f0-0a6f4ce04f63",
    operatorRole: "support_engineer" as const,
    durationMs: 250,
    resultCode: "OK" as const,
    safeStorageStatus: "available" as const,
    createdAt: Date.now()
  };

  it("validates complete breadcrumb", () => {
    const result = DiagnosticsBreadcrumbSchema.parse(validBreadcrumb);
    expect(result.channel).toBe("llmProfile:list");
    expect(result.resultCode).toBe("OK");
  });

  it("accepts breadcrumb with metadata", () => {
    const breadcrumb = { ...validBreadcrumb, metadata: { profileCount: 5 } };
    expect(() => DiagnosticsBreadcrumbSchema.parse(breadcrumb)).not.toThrow();
  });

  it("rejects negative duration", () => {
    const breadcrumb = { ...validBreadcrumb, durationMs: -10 };
    expect(() => DiagnosticsBreadcrumbSchema.parse(breadcrumb)).toThrow();
  });
});

describe("ProfileIpcRequestEnvelopeSchema", () => {
  const validEnvelope = {
    channel: "llmProfile:list" as const,
    requestId: "9f1a4a1a-7b11-4a12-a9f0-0a6f4ce04f65",
    timestamp: Date.now(),
    context: {
      operatorId: "8e1a3a1a-6b11-4a12-a9f0-0a6f4ce04f64",
      operatorRole: "support_engineer" as const,
      locale: "en-US"
    },
    payload: { type: "list" as const }
  };

  it("validates complete request envelope", () => {
    const result = ProfileIpcRequestEnvelopeSchema.parse(validEnvelope);
    expect(result.channel).toBe("llmProfile:list");
    expect(result.payload.type).toBe("list");
  });

  it("rejects timestamp outside tolerance", () => {
    const envelope = { ...validEnvelope, timestamp: Date.now() + 10 * 60 * 1000 };
    expect(() => ProfileIpcRequestEnvelopeSchema.parse(envelope)).toThrow(/stale or future/);
  });
});

describe("sanitizeProfileSummaries", () => {
  it("redacts API keys", () => {
    const profiles = [
      {
        id: "9f1a4a1a-7b11-4a12-a9f0-0a6f4ce04f65",
        name: "Test",
        providerType: "llama.cpp" as const,
        endpointUrl: "http://localhost:8080",
        apiKey: "secret-key",
        isActive: true
      }
    ];

    const sanitized = sanitizeProfileSummaries(profiles);
    expect(sanitized[0].apiKey).toBe("***REDACTED***");
  });

  it("preserves other fields", () => {
    const profiles = [
      {
        id: "9f1a4a1a-7b11-4a12-a9f0-0a6f4ce04f65",
        name: "Test Profile",
        providerType: "azure" as const,
        endpointUrl: "https://example.com",
        apiKey: "secret",
        isActive: false
      }
    ];

    const sanitized = sanitizeProfileSummaries(profiles);
    expect(sanitized[0].name).toBe("Test Profile");
    expect(sanitized[0].providerType).toBe("azure");
    expect(sanitized[0].isActive).toBe(false);
  });
});

describe("sanitizePromptPreview", () => {
  it("truncates long prompts", () => {
    const longPrompt = "a".repeat(600);
    const sanitized = sanitizePromptPreview(longPrompt);
    expect(sanitized.length).toBeLessThanOrEqual(500);
  });

  it("preserves short prompts", () => {
    const shortPrompt = "Hello, world!";
    const sanitized = sanitizePromptPreview(shortPrompt);
    expect(sanitized).toBe(shortPrompt);
  });

  it("normalizes whitespace", () => {
    const messyPrompt = "Hello    \n\n  world  \t  test";
    const sanitized = sanitizePromptPreview(messyPrompt);
    expect(sanitized).toBe("Hello world test");
  });
});

describe("ensureProfileCorrelationId", () => {
  it("preserves valid UUID correlation ID", () => {
    const uuid = "9f1a4a1a-7b11-4a12-a9f0-0a6f4ce04f65";
    expect(ensureProfileCorrelationId(uuid)).toBe(uuid);
  });

  it("generates UUID when correlation ID is null", () => {
    const result = ensureProfileCorrelationId(null);
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("generates UUID when correlation ID is undefined", () => {
    const result = ensureProfileCorrelationId(undefined);
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("generates UUID for invalid correlation ID", () => {
    const result = ensureProfileCorrelationId("not-a-uuid");
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
