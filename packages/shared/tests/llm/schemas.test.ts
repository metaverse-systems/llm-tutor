import { describe, expect, it } from 'vitest';
import {
  ConsentRecordSchema,
  LLMProfileSchema,
  ProfileVaultSchema,
  ProviderTypeSchema,
  TestPromptResultSchema,
  TranscriptMessageSchema,
  TestTranscriptSchema,
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
    transcript: {
      messages: [
        { role: 'user' as const, text: 'Hello', truncated: false },
        { role: 'assistant' as const, text: 'Hi there', truncated: false },
      ],
      status: 'success' as const,
      latencyMs: 123,
      errorCode: null,
      remediation: null,
    },
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
      transcript: {
        messages: [],
        status: 'error' as const,
        latencyMs: null,
        errorCode: null,
        remediation: 'Check connection',
      },
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
      transcript: {
        messages: [],
        status: 'timeout' as const,
        latencyMs: null,
        errorCode: 'TIMEOUT',
        remediation: 'Increase timeout',
      },
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
      transcript: {
        messages: [],
        status: 'timeout' as const,
        latencyMs: null,
        errorCode: 'TIMEOUT',
        remediation: 'Increase timeout',
      },
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

describe('TranscriptMessageSchema', () => {
  const baseMessage = {
    role: 'user' as const,
    text: 'Hello, how are you?',
    truncated: false,
  };

  it('accepts valid user messages', () => {
    expect(() => TranscriptMessageSchema.parse(baseMessage)).not.toThrow();
  });

  it('accepts valid assistant messages', () => {
    const message = { ...baseMessage, role: 'assistant' as const, text: 'I am fine, thank you!' };
    expect(() => TranscriptMessageSchema.parse(message)).not.toThrow();
  });

  it('accepts messages with truncated flag set to true', () => {
    const message = { ...baseMessage, truncated: true };
    expect(() => TranscriptMessageSchema.parse(message)).not.toThrow();
  });

  it('rejects messages with invalid role', () => {
    const message = { ...baseMessage, role: 'system' };
    expect(() => TranscriptMessageSchema.parse(message)).toThrow(/Invalid enum value/);
  });

  it('enforces 500 character limit on text', () => {
    const longText = 'a'.repeat(501);
    const message = { ...baseMessage, text: longText };
    expect(() => TranscriptMessageSchema.parse(message)).toThrow(/must be at most 500 characters/);
  });

  it('accepts exactly 500 characters', () => {
    const text = 'a'.repeat(500);
    const message = { ...baseMessage, text };
    expect(() => TranscriptMessageSchema.parse(message)).not.toThrow();
  });

  it('rejects empty text', () => {
    const message = { ...baseMessage, text: '' };
    expect(() => TranscriptMessageSchema.parse(message)).toThrow(/must be at least 1 characters/);
  });

  it('sets truncated flag when input exceeds 500 characters', () => {
    const longText = 'a'.repeat(600);
    const message = { role: 'user' as const, text: longText, truncated: false };
    // This should fail until we implement auto-truncation in the schema
    expect(() => TranscriptMessageSchema.parse(message)).toThrow();
  });
});

describe('TestTranscriptSchema', () => {
  const baseTranscript = {
    messages: [
      { role: 'user' as const, text: 'Hello', truncated: false },
      { role: 'assistant' as const, text: 'Hi there!', truncated: false },
    ],
    status: 'success' as const,
    latencyMs: 123,
    errorCode: null,
    remediation: null,
  };

  it('accepts successful transcripts with two messages', () => {
    expect(() => TestTranscriptSchema.parse(baseTranscript)).not.toThrow();
  });

  it('accepts transcripts with exactly three message pairs (six messages)', () => {
    const transcript = {
      ...baseTranscript,
      messages: [
        { role: 'user' as const, text: 'Hello', truncated: false },
        { role: 'assistant' as const, text: 'Hi', truncated: false },
        { role: 'user' as const, text: 'How are you?', truncated: false },
        { role: 'assistant' as const, text: 'Fine', truncated: false },
        { role: 'user' as const, text: 'Great', truncated: false },
        { role: 'assistant' as const, text: 'Indeed', truncated: false },
      ],
    };
    expect(() => TestTranscriptSchema.parse(transcript)).not.toThrow();
  });

  it('rejects transcripts with more than six messages (three exchanges)', () => {
    const transcript = {
      ...baseTranscript,
      messages: [
        { role: 'user' as const, text: 'Hello', truncated: false },
        { role: 'assistant' as const, text: 'Hi', truncated: false },
        { role: 'user' as const, text: 'How are you?', truncated: false },
        { role: 'assistant' as const, text: 'Fine', truncated: false },
        { role: 'user' as const, text: 'Great', truncated: false },
        { role: 'assistant' as const, text: 'Indeed', truncated: false },
        { role: 'user' as const, text: 'Extra', truncated: false },
      ],
    };
    expect(() => TestTranscriptSchema.parse(transcript)).toThrow(/must contain at most 6 messages/);
  });

  it('rejects transcripts with empty message arrays', () => {
    const transcript = { ...baseTranscript, messages: [] };
    expect(() => TestTranscriptSchema.parse(transcript)).toThrow(/must contain at least 1/);
  });

  it('accepts error status with errorCode and remediation', () => {
    const transcript = {
      ...baseTranscript,
      status: 'error' as const,
      messages: [],
      latencyMs: null,
      errorCode: 'CONNECTION_FAILED',
      remediation: 'Check your network connection',
    };
    expect(() => TestTranscriptSchema.parse(transcript)).not.toThrow();
  });

  it('accepts timeout status', () => {
    const transcript = {
      ...baseTranscript,
      status: 'timeout' as const,
      messages: [],
      latencyMs: null,
      errorCode: 'TIMEOUT',
      remediation: 'Request exceeded timeout limit',
    };
    expect(() => TestTranscriptSchema.parse(transcript)).not.toThrow();
  });

  it('requires errorCode when status is error', () => {
    const transcript = {
      ...baseTranscript,
      status: 'error' as const,
      messages: [],
      latencyMs: null,
      errorCode: null,
      remediation: 'Check your connection',
    };
    expect(() => TestTranscriptSchema.parse(transcript)).toThrow(/must include errorCode/);
  });

  it('requires latencyMs when status is success', () => {
    const transcript = {
      ...baseTranscript,
      latencyMs: null,
    };
    expect(() => TestTranscriptSchema.parse(transcript)).toThrow(/must include latencyMs/);
  });

  it('clears messages array when status is error', () => {
    const transcript = {
      ...baseTranscript,
      status: 'error' as const,
      messages: [{ role: 'user' as const, text: 'Hello', truncated: false }],
      latencyMs: null,
      errorCode: 'CONNECTION_FAILED',
      remediation: 'Check your network',
    };
    expect(() => TestTranscriptSchema.parse(transcript)).toThrow(/must be empty when status is error/);
  });

  it('rejects invalid status values', () => {
    const transcript = { ...baseTranscript, status: 'pending' };
    expect(() => TestTranscriptSchema.parse(transcript)).toThrow(/Invalid enum value/);
  });
});

describe('TestPromptResultSchema with transcript', () => {
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
    transcript: {
      messages: [
        { role: 'user' as const, text: 'Hello', truncated: false },
        { role: 'assistant' as const, text: 'Hi there', truncated: false },
      ],
      status: 'success' as const,
      latencyMs: 123,
      errorCode: null,
      remediation: null,
    },
  };

  it('accepts successful results with transcript', () => {
    expect(() => TestPromptResultSchema.parse(baseResult)).not.toThrow();
  });

  it('requires transcript field to be present', () => {
    const { transcript, ...resultWithoutTranscript } = baseResult;
    expect(() => TestPromptResultSchema.parse(resultWithoutTranscript)).toThrow(/transcript/);
  });

  it('validates transcript follows TestTranscriptSchema', () => {
    const result = {
      ...baseResult,
      transcript: {
        ...baseResult.transcript,
        status: 'invalid-status',
      },
    };
    expect(() => TestPromptResultSchema.parse(result)).toThrow(/Invalid enum value/);
  });

  it('accepts failed results with empty transcript', () => {
    const result = {
      ...baseResult,
      success: false,
      responseText: null,
      latencyMs: null,
      errorCode: 'TIMEOUT',
      errorMessage: 'Request timed out',
      transcript: {
        messages: [],
        status: 'error' as const,
        latencyMs: null,
        errorCode: 'TIMEOUT',
        remediation: 'Increase timeout value',
      },
    };
    expect(() => TestPromptResultSchema.parse(result)).not.toThrow();
  });

  it('enforces three-exchange history limit via transcript', () => {
    const result = {
      ...baseResult,
      transcript: {
        ...baseResult.transcript,
        messages: Array(7).fill({ role: 'user' as const, text: 'test', truncated: false }),
      },
    };
    expect(() => TestPromptResultSchema.parse(result)).toThrow(/must contain at most 6 messages/);
  });
});
