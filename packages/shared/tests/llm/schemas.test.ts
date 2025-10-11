import { describe, expect, it } from 'vitest';
import {
  ConsentRecordSchema,
  LLMProfileSchema,
  ProfileVaultSchema,
  ProviderTypeSchema,
  TestPromptResultSchema,
} from '../../src/llm/schemas.js';

const validProfile = {
  id: '9f1a4a1a-7b11-4a12-a9f0-0a6f4ce04f65',
  name: 'Local Model',
  providerType: 'llama.cpp',
  endpointUrl: 'http://localhost:8080',
  apiKey: 'dummy-key',
  modelId: null,
  isActive: true,
  consentTimestamp: null,
  createdAt: Date.now(),
  modifiedAt: Date.now(),
} as const;

describe('ProviderTypeSchema', () => {
  it('accepts supported providers', () => {
    expect(ProviderTypeSchema.parse('llama.cpp')).toBe('llama.cpp');
    expect(ProviderTypeSchema.parse('azure')).toBe('azure');
    expect(ProviderTypeSchema.parse('custom')).toBe('custom');
  });

  it('rejects unsupported providers', () => {
    expect(() => ProviderTypeSchema.parse('openai')).toThrow(/Invalid enum value/);
  });
});

describe('LLMProfileSchema', () => {
  it('validates a local profile', () => {
    expect(() => LLMProfileSchema.parse(validProfile)).not.toThrow();
  });

  it('allows llama.cpp profiles without API keys', () => {
    const profile = {
      ...validProfile,
      apiKey: '',
    };

    expect(() => LLMProfileSchema.parse(profile)).not.toThrow();
  });

  it('rejects invalid UUID', () => {
    const profile = { ...validProfile, id: 'not-a-uuid' };
    expect(() => LLMProfileSchema.parse(profile)).toThrow(/uuid/i);
  });

  it('rejects remote provider without consent', () => {
    const profile = {
      ...validProfile,
      providerType: 'azure' as const,
      endpointUrl: 'https://example.openai.azure.com',
      consentTimestamp: null,
      modelId: 'gpt-4',
    };
    expect(() => LLMProfileSchema.parse(profile)).toThrow(/Remote providers require consentTimestamp/);
  });

  it('rejects llama.cpp profiles pointing to non-localhost', () => {
    const profile = {
      ...validProfile,
      endpointUrl: 'http://example.com',
    };
    expect(() => LLMProfileSchema.parse(profile)).toThrow(/llama\.cpp endpoints must point to localhost/);
  });

  it('rejects llama.cpp profiles using unsupported protocols', () => {
    const profile = {
      ...validProfile,
      endpointUrl: 'ftp://localhost',
    };
    expect(() => LLMProfileSchema.parse(profile)).toThrow(/Local providers must use http:\/\/ or https:\/\//);
  });

  it('rejects profiles with invalid URL format', () => {
    const profile = {
      ...validProfile,
      endpointUrl: 'not-a-url',
    };
    expect(() => LLMProfileSchema.parse(profile)).toThrow(/endpointUrl must be a valid URL/);
  });

  it('rejects azure profiles without https endpoint', () => {
    const profile = {
      ...validProfile,
      providerType: 'azure' as const,
      endpointUrl: 'http://example.openai.azure.com',
      consentTimestamp: Date.now(),
      modelId: 'gpt-4',
    };
    expect(() => LLMProfileSchema.parse(profile)).toThrow(/https:\/\/ endpoints/);
  });

  it('rejects azure profiles with non Azure domain', () => {
    const profile = {
      ...validProfile,
      providerType: 'azure' as const,
      endpointUrl: 'https://notazure.example.com',
      consentTimestamp: Date.now(),
      modelId: 'gpt-4',
    };
    expect(() => LLMProfileSchema.parse(profile)).toThrow(/must use a \*\.openai\.azure\.com endpoint/);
  });

  it('rejects remote profiles without API keys', () => {
    const profile = {
      ...validProfile,
      providerType: 'custom' as const,
      endpointUrl: 'https://custom.example.com',
      consentTimestamp: Date.now(),
      apiKey: '   ',
    };

    expect(() => LLMProfileSchema.parse(profile)).toThrow(/remote providers require an api key/i);
  });

  it('rejects profiles with blank modelId strings', () => {
    const profile = {
      ...validProfile,
      providerType: 'custom' as const,
      endpointUrl: 'https://custom.example.com',
      consentTimestamp: Date.now(),
      modelId: '   ',
    };
    expect(() => LLMProfileSchema.parse(profile)).toThrow(/modelId cannot be blank/);
  });

  it('validates an azure profile with consent and https domain', () => {
    const profile = {
      ...validProfile,
      providerType: 'azure' as const,
      endpointUrl: 'https://example.openai.azure.com',
      consentTimestamp: Date.now(),
      modelId: 'gpt-4',
    };
    expect(() => LLMProfileSchema.parse(profile)).not.toThrow();
  });

  it('rejects azure profiles without modelId', () => {
    const profile = {
      ...validProfile,
      providerType: 'azure' as const,
      endpointUrl: 'https://example.openai.azure.com',
      consentTimestamp: Date.now(),
      modelId: null,
    };
    expect(() => LLMProfileSchema.parse(profile)).toThrow(/Azure profiles require modelId/);
  });

  it('rejects whitespace names', () => {
    const profile = {
      ...validProfile,
      name: '   ',
    };
    expect(() => LLMProfileSchema.parse(profile)).toThrow(/name must be at least 1 characters/);
  });

  it('rejects modifiedAt earlier than createdAt', () => {
    const profile = {
      ...validProfile,
      createdAt: 10,
      modifiedAt: 5,
    };
    expect(() => LLMProfileSchema.parse(profile)).toThrow(/modifiedAt must be greater than or equal to createdAt/);
  });
});

describe('ProfileVaultSchema', () => {
  it('accepts vaults with zero or one active profile', () => {
    const inactiveVault = {
      profiles: [
        { ...validProfile, isActive: false },
      ],
      encryptionAvailable: true,
      version: '1.0.0',
    };
    const activeVault = {
      profiles: [validProfile],
      encryptionAvailable: true,
      version: '1.0.0',
    };

    expect(() => ProfileVaultSchema.parse(inactiveVault)).not.toThrow();
    expect(() => ProfileVaultSchema.parse(activeVault)).not.toThrow();
  });

  it('rejects vaults with multiple active profiles', () => {
    const vault = {
      profiles: [validProfile, { ...validProfile, id: 'c1c1a1f5-2a5b-4c3d-80d8-83c412c1d6a0' }],
      encryptionAvailable: true,
      version: '1.0.0',
    };
    expect(() => ProfileVaultSchema.parse(vault)).toThrow(/At most one profile can be active/);
  });

  it('rejects duplicate profile IDs', () => {
    const vault = {
      profiles: [validProfile, { ...validProfile }],
      encryptionAvailable: true,
      version: '1.0.0',
    };
    expect(() => ProfileVaultSchema.parse(vault)).toThrow(/Profile IDs must be unique/);
  });

  it('rejects invalid semver versions', () => {
    const vault = {
      profiles: [validProfile],
      encryptionAvailable: true,
      version: 'v1',
    };
    expect(() => ProfileVaultSchema.parse(vault)).toThrow(/semantic version/);
  });
});

describe('TestPromptResultSchema', () => {
  const baseResult = {
    profileId: validProfile.id,
    profileName: 'Local Model',
    providerType: 'llama.cpp' as const,
    success: true,
    promptText: 'Hello',
    responseText: 'Hi there',
    modelName: 'llama-7b',
    latencyMs: 123,
    totalTimeMs: 234,
    errorCode: null,
    errorMessage: null,
    timestamp: Date.now(),
  };

  it('accepts successful results with response text and latency', () => {
    expect(() => TestPromptResultSchema.parse(baseResult)).not.toThrow();
  });

  it('rejects successful results missing response text', () => {
    const result = { ...baseResult, responseText: null };
    expect(() => TestPromptResultSchema.parse(result)).toThrow(/must include responseText/);
  });

  it('rejects successful results missing latency', () => {
    const result = { ...baseResult, latencyMs: null };
    expect(() => TestPromptResultSchema.parse(result)).toThrow(/must include latencyMs/);
  });

  it('rejects successful results carrying error metadata', () => {
    const result = { ...baseResult, errorCode: '401', errorMessage: 'Oops' };
    expect(() => TestPromptResultSchema.parse(result)).toThrow(/cannot include errorCode/);
  });

  it('rejects failed results missing error code', () => {
    const result = {
      ...baseResult,
      success: false,
      responseText: null,
      latencyMs: null,
      errorCode: null,
      errorMessage: 'Timeout',
    };
    expect(() => TestPromptResultSchema.parse(result)).toThrow(/must include errorCode/);
  });

  it('rejects failed results missing error message', () => {
    const result = {
      ...baseResult,
      success: false,
      responseText: null,
      latencyMs: null,
      errorCode: 'TIMEOUT',
      errorMessage: null,
    };
    expect(() => TestPromptResultSchema.parse(result)).toThrow(/must include errorMessage/);
  });

  it('rejects failed results containing response text or latency', () => {
    const result = {
      ...baseResult,
      success: false,
      responseText: 'should not be here',
      latencyMs: 100,
      errorCode: 'TIMEOUT',
      errorMessage: 'Timeout',
    };
    expect(() => TestPromptResultSchema.parse(result)).toThrow(/must not include/);
  });
});

describe('ConsentRecordSchema', () => {
  const baseRecord = {
    profileId: validProfile.id,
    providerType: 'azure' as const,
    consentGranted: true,
    timestamp: Date.now(),
    ipAddress: '192.168.0.1',
  };

  it('validates valid consent records', () => {
    expect(() => ConsentRecordSchema.parse(baseRecord)).not.toThrow();
  });

  it('allows null IP addresses', () => {
    const record = { ...baseRecord, ipAddress: null };
    expect(() => ConsentRecordSchema.parse(record)).not.toThrow();
  });

  it('rejects consent records for llama.cpp providers', () => {
    const record = { ...baseRecord, providerType: 'llama.cpp' as const };
    expect(() => ConsentRecordSchema.parse(record)).toThrow(/remote providers/);
  });
});
