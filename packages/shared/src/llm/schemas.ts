import { z } from 'zod';

export const ProviderTypeSchema = z.enum(['llama.cpp', 'azure', 'custom']);
export type ProviderType = z.infer<typeof ProviderTypeSchema>;

const semverRegex = /^\d+\.\d+\.\d+$/;
const localHostnames = new Set(['localhost', '127.0.0.1', '::1']);

const trimmedString = (min: number, max: number, field: string) =>
  z
    .string({ required_error: `${field} is required` })
    .trim()
    .min(min, `${field} must be at least ${min} characters`)
    .max(max, `${field} must be at most ${max} characters`);

const positiveInt = (field: string) =>
  z
    .number({ required_error: `${field} is required` })
    .int(`${field} must be an integer`)
    .positive(`${field} must be greater than 0`);

export const LLMProfileSchema = z
  .object({
    id: z.string().uuid({ message: 'id must be a UUID v4 string' }),
    name: trimmedString(1, 100, 'name'),
    providerType: ProviderTypeSchema,
    endpointUrl: z.string().url({ message: 'endpointUrl must be a valid URL' }),
    apiKey: z
      .string({ required_error: 'apiKey is required' })
      .max(500, 'apiKey must be at most 500 characters'),
    modelId: trimmedString(1, 200, 'modelId').nullable(),
    isActive: z.boolean({ required_error: 'isActive is required' }),
    consentTimestamp: positiveInt('consentTimestamp').nullable(),
    createdAt: positiveInt('createdAt'),
    modifiedAt: positiveInt('modifiedAt'),
  })
  .superRefine((data, ctx) => {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(data.endpointUrl);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endpointUrl must be a valid URL',
        path: ['endpointUrl'],
      });
      return;
    }

    if (data.modifiedAt < data.createdAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'modifiedAt must be greater than or equal to createdAt',
        path: ['modifiedAt'],
      });
    }

    const isRemoteProvider = data.providerType !== 'llama.cpp';

    if (isRemoteProvider) {
      if (parsedUrl.protocol !== 'https:') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Remote providers must use https:// endpoints',
          path: ['endpointUrl'],
        });
      }

      if (data.consentTimestamp === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Remote providers require consentTimestamp',
          path: ['consentTimestamp'],
        });
      }
    } else {
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Local providers must use http:// or https://',
          path: ['endpointUrl'],
        });
      }

      if (!localHostnames.has(parsedUrl.hostname)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'llama.cpp endpoints must point to localhost or 127.0.0.1',
          path: ['endpointUrl'],
        });
      }
    }

    if (isRemoteProvider && data.apiKey.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Remote providers require an API key',
        path: ['apiKey'],
      });
    }

    if (data.providerType === 'azure') {
      if (!parsedUrl.hostname.endsWith('.openai.azure.com')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Azure profiles must use a *.openai.azure.com endpoint',
          path: ['endpointUrl'],
        });
      }

      if (data.modelId === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Azure profiles require modelId',
          path: ['modelId'],
        });
      }
    }

    if (data.providerType !== 'azure' && data.modelId === null) {
      // For non-Azure providers modelId can be null, but ensure empty strings are not allowed when provided
      return;
    }

    if (data.modelId !== null && data.modelId.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'modelId cannot be blank when provided',
        path: ['modelId'],
      });
    }
  });

export type LLMProfile = z.infer<typeof LLMProfileSchema>;

export const ProfileVaultSchema = z
  .object({
    profiles: z.array(LLMProfileSchema),
    encryptionAvailable: z.boolean({ required_error: 'encryptionAvailable is required' }),
    version: z
      .string({ required_error: 'version is required' })
      .regex(semverRegex, 'version must be a semantic version string (e.g., 1.0.0)'),
  })
  .superRefine((data, ctx) => {
    const activeProfiles = data.profiles.reduce((count, profile) => (profile.isActive ? count + 1 : count), 0);

    if (activeProfiles > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At most one profile can be active',
        path: ['profiles'],
      });
    }

    const ids = new Set<string>();

    data.profiles.forEach((profile, index) => {
      if (ids.has(profile.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Profile IDs must be unique',
          path: ['profiles', index, 'id'],
        });
      } else {
        ids.add(profile.id);
      }
    });
  });

export type ProfileVault = z.infer<typeof ProfileVaultSchema>;

export const TestPromptResultSchema = z
  .object({
    profileId: z.string().uuid({ message: 'profileId must be a UUID v4 string' }),
    profileName: trimmedString(1, 100, 'profileName'),
    providerType: ProviderTypeSchema,
    success: z.boolean({ required_error: 'success is required' }),
    promptText: trimmedString(1, 4000, 'promptText'),
    responseText: z
      .string({ invalid_type_error: 'responseText must be a string or null' })
      .max(500, 'responseText must be at most 500 characters')
      .nullable(),
    modelName: trimmedString(1, 200, 'modelName').nullable(),
    latencyMs: positiveInt('latencyMs').nullable(),
    totalTimeMs: positiveInt('totalTimeMs'),
    errorCode: trimmedString(1, 100, 'errorCode').nullable(),
    errorMessage: trimmedString(1, 1000, 'errorMessage').nullable(),
    timestamp: positiveInt('timestamp'),
  })
  .superRefine((data, ctx) => {
    if (data.success) {
      if (data.responseText === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Successful test prompts must include responseText',
          path: ['responseText'],
        });
      }

      if (data.latencyMs === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Successful test prompts must include latencyMs',
          path: ['latencyMs'],
        });
      }

      if (data.errorCode !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Successful test prompts cannot include errorCode',
          path: ['errorCode'],
        });
      }

      if (data.errorMessage !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Successful test prompts cannot include errorMessage',
          path: ['errorMessage'],
        });
      }
    } else {
      if (data.responseText !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Failed test prompts must not include responseText',
          path: ['responseText'],
        });
      }

      if (data.latencyMs !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Failed test prompts must not include latencyMs',
          path: ['latencyMs'],
        });
      }

      if (data.errorCode === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Failed test prompts must include errorCode',
          path: ['errorCode'],
        });
      }

      if (data.errorMessage === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Failed test prompts must include errorMessage',
          path: ['errorMessage'],
        });
      }
    }
  });

export type TestPromptResult = z.infer<typeof TestPromptResultSchema>;

export const ConsentRecordSchema = z
  .object({
    profileId: z.string().uuid({ message: 'profileId must be a UUID v4 string' }),
    providerType: ProviderTypeSchema,
    consentGranted: z.boolean({ required_error: 'consentGranted is required' }),
    timestamp: positiveInt('timestamp'),
    ipAddress: z
      .string({ invalid_type_error: 'ipAddress must be a string or null' })
      .ip({ message: 'ipAddress must be a valid IPv4 or IPv6 address' })
      .nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.providerType === 'llama.cpp') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Consent records are only applicable to remote providers',
        path: ['providerType'],
      });
    }
  });

export type ConsentRecord = z.infer<typeof ConsentRecordSchema>;
