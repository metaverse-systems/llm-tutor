import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  LLMProfileSchema,
  type LLMProfile
} from "@metaverse-systems/llm-tutor-shared/llm";
import {
  ProfileService,
  type CreateProfilePayload,
  type UpdateProfilePayload,
  type DeleteProfilePayload,
  type ActivateProfilePayload,
  API_KEY_PLACEHOLDER
} from "../../services/llm/profile.service.js";
import { TestPromptService } from "../../services/llm/test-prompt.service.js";
import { ProfileVaultService } from "../../services/llm/profile-vault.js";
import { EncryptionService } from "../../infra/encryption/index.js";
import { Buffer } from "node:buffer";
import * as http from "node:http";
import * as https from "node:https";
import type { DiagnosticsLogger } from "../../infra/logging/diagnostics-logger.js";

// Request/Response schemas
const createProfileRequestSchema = z.object({
  profile: z.object({
    name: z.string().min(1).max(100),
    providerType: z.enum(["llama.cpp", "azure", "custom"]),
    endpointUrl: z.string().min(1),
    apiKey: z.string().max(500),
    modelId: z.union([z.string().max(200), z.null()]),
    consentTimestamp: z.number().int().nonnegative().nullable()
  }),
  context: z.object({
    operatorId: z.string().optional()
  }).optional()
});

const updateProfileRequestSchema = z.object({
  changes: z.object({
    name: z.string().min(1).max(100).optional(),
    providerType: z.enum(["llama.cpp", "azure", "custom"]).optional(),
    endpointUrl: z.string().min(1).optional(),
    apiKey: z.string().max(500).optional(),
    modelId: z.union([z.string().max(200), z.null()]).optional(),
    consentTimestamp: z.number().int().nonnegative().nullable().optional()
  })
});

const deleteProfileRequestSchema = z.object({
  successorProfileId: z.string().uuid().optional()
});

const activateProfileRequestSchema = z.object({
  force: z.boolean().optional()
});

const testPromptRequestSchema = z.object({
  promptOverride: z.string().optional(),
  timeoutMs: z.number().int().positive().optional()
});

const discoverRequestSchema = z.object({
  scope: z.object({
    strategy: z.enum(["local", "remote"]),
    timeoutMs: z.number().int().positive().optional(),
    includeExisting: z.boolean().optional()
  })
});

// Discovery ports for local llama.cpp/Ollama
const LOCAL_DISCOVERY_PORTS = [8080, 8000, 11434];

// Simple fetch wrapper using http/https module for nock compatibility
function createHttpFetch(): typeof fetch {
  return async function httpFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(input.url);
    const protocol = url.protocol === "https:" ? https : http;
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method: init?.method || "GET",
        headers: init?.headers as Record<string, string> || {},
        signal: init?.signal
      };
      
      const req = protocol.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          resolve(new Response(data, {
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: res.headers as any
          }));
        });
      });
      
      req.on("error", reject);
      
      if (init?.signal) {
        init.signal.addEventListener("abort", () => {
          req.destroy();
          reject(new Error("Request aborted"));
        });
      }
      
      if (init?.body) {
        req.write(init.body);
      }
      
      req.end();
    });
  };
}

export interface RegisterProfileRoutesOptions {
  profileService?: ProfileService;
  testPromptService?: TestPromptService;
  vaultService?: ProfileVaultService;
  encryptionService?: EncryptionService;
  fetchImpl?: typeof fetch;
  diagnosticsLogger?: DiagnosticsLogger | null;
}

/**
 * Register LLM profile HTTP routes
 */
export async function registerProfileRoutes(
  app: FastifyInstance,
  options: RegisterProfileRoutesOptions = {}
): Promise<void> {
  // Initialize services (use provided or create defaults)
  let profileService = options.profileService;
  let testPromptService = options.testPromptService;
  const diagnosticsLogger = options.diagnosticsLogger ?? null;
  
  if (!profileService || !testPromptService) {
    const inMemoryVaultStore = {
      data: null as any,
      get() { return this.data; },
      set(value: any) { this.data = value; },
      clear() { this.data = null; }
    };

    const vaultService = options.vaultService || new ProfileVaultService({ store: inMemoryVaultStore });
    
    const encryptionService = options.encryptionService || new EncryptionService({
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (plaintext: string) => Buffer.from(plaintext, "utf8"),
        decryptString: (buffer: Buffer) => buffer.toString("utf8")
      }
    });

    if (!profileService) {
      profileService = new ProfileService({
        vaultService,
        encryptionService,
        diagnosticsRecorder: null
      });
    }

    if (!testPromptService) {
      testPromptService = new TestPromptService({
        vaultService,
        encryptionService,
        fetchImpl: options.fetchImpl || createHttpFetch(),
        timeoutMs: 30000,
        diagnosticsRecorder: null
      });
    }
  }
  
  const fetchImpl = options.fetchImpl || createHttpFetch();

  // GET /api/llm/profiles - List all profiles
  app.get("/", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await profileService.listProfiles();
      
      return reply.code(200).send({
        success: true,
        data: {
          profiles: result.profiles,
          encryptionAvailable: result.encryptionAvailable,
          activeProfileId: result.activeProfileId
        },
        timestamp: Date.now()
      });
    } catch (error: any) {
      if (error.code === "VAULT_READ_ERROR") {
        return reply.code(500).send({
          success: false,
          error: "VAULT_READ_ERROR",
          message: error.message,
          timestamp: Date.now()
        });
      }
      
      return reply.code(500).send({
        success: false,
        error: "INTERNAL_ERROR",
        message: error.message || "Internal server error",
        timestamp: Date.now()
      });
    }
  });

  // POST /api/llm/profiles - Create a new profile
  app.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = createProfileRequestSchema.parse(request.body);
      
      const payload: CreateProfilePayload = {
        name: body.profile.name,
        providerType: body.profile.providerType,
        endpointUrl: body.profile.endpointUrl,
        apiKey: body.profile.apiKey,
        modelId: body.profile.modelId,
        consentTimestamp: body.profile.consentTimestamp
      };
      
      const result = await profileService.createProfile(payload);
      
      return reply.code(201).send({
        success: true,
        data: {
          profile: result.profile,
          warning: result.warning
        },
        timestamp: Date.now()
      });
    } catch (error: any) {
      if (error.code === "VALIDATION_ERROR") {
        return reply.code(400).send({
          success: false,
          error: "VALIDATION_ERROR",
          message: error.message,
          details: error.details,
          timestamp: Date.now()
        });
      }
      
      if (error.code === "VAULT_WRITE_ERROR") {
        return reply.code(500).send({
          success: false,
          error: "VAULT_WRITE_ERROR",
          message: error.message,
          timestamp: Date.now()
        });
      }
      
      return reply.code(500).send({
        success: false,
        error: "INTERNAL_ERROR",
        message: error.message || "Internal server error",
        timestamp: Date.now()
      });
    }
  });

  // PATCH /api/llm/profiles/:profileId - Update a profile
  app.patch("/:profileId", async (request: FastifyRequest<{
    Params: { profileId: string }
  }>, reply: FastifyReply) => {
    try {
      const { profileId } = request.params;
      const body = updateProfileRequestSchema.parse(request.body);
      
      const payload: UpdateProfilePayload = {
        id: profileId,
        ...body.changes
      };
      
      const result = await profileService.updateProfile(payload);
      
      return reply.code(200).send({
        success: true,
        data: {
          profile: result.profile,
          warning: result.warning
        },
        timestamp: Date.now()
      });
    } catch (error: any) {
      if (error.code === "PROFILE_NOT_FOUND") {
        return reply.code(404).send({
          success: false,
          error: "PROFILE_NOT_FOUND",
          message: error.message,
          timestamp: Date.now()
        });
      }
      
      if (error.code === "VALIDATION_ERROR") {
        return reply.code(400).send({
          success: false,
          error: "VALIDATION_ERROR",
          message: error.message,
          details: error.details,
          timestamp: Date.now()
        });
      }
      
      if (error.code === "VAULT_WRITE_ERROR") {
        return reply.code(500).send({
          success: false,
          error: "VAULT_WRITE_ERROR",
          message: error.message,
          timestamp: Date.now()
        });
      }
      
      return reply.code(500).send({
        success: false,
        error: "INTERNAL_ERROR",
        message: error.message || "Internal server error",
        timestamp: Date.now()
      });
    }
  });

  // DELETE /api/llm/profiles/:profileId - Delete a profile
  app.delete("/:profileId", async (request: FastifyRequest<{
    Params: { profileId: string }
  }>, reply: FastifyReply) => {
    try {
      const { profileId } = request.params;
      const body = deleteProfileRequestSchema.parse(request.body || {});
      
      const payload: DeleteProfilePayload = {
        id: profileId,
        activateAlternateId: body.successorProfileId
      };
      
      const result = await profileService.deleteProfile(payload);
      
      return reply.code(200).send({
        success: true,
        data: {
          deletedId: result.deletedId,
          newActiveProfileId: result.newActiveProfileId,
          requiresUserSelection: result.requiresUserSelection
        },
        timestamp: Date.now()
      });
    } catch (error: any) {
      if (error.code === "PROFILE_NOT_FOUND") {
        return reply.code(404).send({
          success: false,
          error: "PROFILE_NOT_FOUND",
          message: error.message,
          timestamp: Date.now()
        });
      }
      
      if (error.code === "ALTERNATE_NOT_FOUND") {
        return reply.code(409).send({
          success: false,
          error: "ALTERNATE_NOT_FOUND",
          message: error.message,
          timestamp: Date.now()
        });
      }
      
      if (error.code === "VAULT_WRITE_ERROR") {
        return reply.code(500).send({
          success: false,
          error: "VAULT_WRITE_ERROR",
          message: error.message,
          timestamp: Date.now()
        });
      }
      
      return reply.code(500).send({
        success: false,
        error: "INTERNAL_ERROR",
        message: error.message || "Internal server error",
        timestamp: Date.now()
      });
    }
  });

  // POST /api/llm/profiles/:profileId/activate - Activate a profile
  app.post("/:profileId/activate", async (request: FastifyRequest<{
    Params: { profileId: string }
  }>, reply: FastifyReply) => {
    try {
      const { profileId } = request.params;
      activateProfileRequestSchema.parse(request.body || {});
      
      const payload: ActivateProfilePayload = {
        id: profileId
      };
      
      const result = await profileService.activateProfile(payload);
      
      return reply.code(200).send({
        success: true,
        data: {
          activeProfile: result.activeProfile,
          deactivatedProfileId: result.deactivatedProfileId
        },
        timestamp: Date.now()
      });
    } catch (error: any) {
      if (error.code === "PROFILE_NOT_FOUND") {
        return reply.code(404).send({
          success: false,
          error: "PROFILE_NOT_FOUND",
          message: error.message,
          timestamp: Date.now()
        });
      }
      
      if (error.code === "VAULT_WRITE_ERROR") {
        return reply.code(500).send({
          success: false,
          error: "VAULT_WRITE_ERROR",
          message: error.message,
          timestamp: Date.now()
        });
      }
      
      return reply.code(500).send({
        success: false,
        error: "INTERNAL_ERROR",
        message: error.message || "Internal server error",
        timestamp: Date.now()
      });
    }
  });

  // POST /api/llm/profiles/:profileId/test - Test a prompt with a profile
  app.post("/:profileId/test", async (request: FastifyRequest<{
    Params: { profileId: string }
  }>, reply: FastifyReply) => {
    try {
      const { profileId } = request.params;
      const body = testPromptRequestSchema.parse(request.body || {});
      
      const result = await testPromptService.testPrompt({
        profileId,
        promptText: body.promptOverride || "Hello, this is a test prompt.",
        timeoutMs: body.timeoutMs
      });
      
      return reply.code(200).send({
        success: true,
        data: result,
        timestamp: Date.now()
      });
    } catch (error: any) {
      if (error.code === "PROFILE_NOT_FOUND") {
        return reply.code(404).send({
          success: false,
          error: "PROFILE_NOT_FOUND",
          message: error.message,
          timestamp: Date.now()
        });
      }
      
      if (error.code === "NO_ACTIVE_PROFILE") {
        return reply.code(409).send({
          success: false,
          error: "NO_ACTIVE_PROFILE",
          message: error.message,
          timestamp: Date.now()
        });
      }
      
      if (error.code === "TIMEOUT") {
        return reply.code(504).send({
          success: false,
          error: "TIMEOUT",
          message: error.message,
          timestamp: Date.now()
        });
      }
      
      return reply.code(500).send({
        success: false,
        error: "INTERNAL_ERROR",
        message: error.message || "Internal server error",
        timestamp: Date.now()
      });
    }
  });

  // POST /api/llm/profiles/discover - Auto-discover local LLM servers
  app.post("/discover", async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    try {
      const body = discoverRequestSchema.parse(request.body);
      
      // Simple discovery implementation - probe common ports
      let discoveredUrl: string | null = null;
      let profileCreated = false;
      let profileId: string | null = null;
      const probedPorts: number[] = [];
      
      if (body.scope.strategy === "local") {
        // Probe common local ports for llama.cpp/Ollama
        for (const port of LOCAL_DISCOVERY_PORTS) {
          probedPorts.push(port);
          const url = `http://localhost:${port}`;
          
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), body.scope.timeoutMs || 3000);
            
            const response = await fetchImpl(`${url}/health`, {
              method: "GET",
              signal: controller.signal
            });
            
            clearTimeout(timeout);
            
            if (response.ok && !discoveredUrl) {
              discoveredUrl = url;
              
              // Check if profile already exists (unless includeExisting is true)
              if (!body.scope.includeExisting) {
                const existingProfiles = await profileService.listProfiles();
                const alreadyExists = existingProfiles.profiles.some(
                  p => p.endpointUrl === url
                );
                
                if (!alreadyExists) {
                  // Create a new profile
                  const createResult = await profileService.createProfile({
                    name: "Local llama.cpp",
                    providerType: "llama.cpp",
                    endpointUrl: url,
                    apiKey: "",
                    modelId: null,
                    consentTimestamp: null
                  });
                  
                  profileCreated = true;
                  profileId = createResult.profile.id;
                }
              }
              // Don't break - continue probing all ports
            }
          } catch (error) {
            // Continue to next port
            continue;
          }
        }
      }
      
      // Record diagnostics event
      if (diagnosticsLogger) {
        await diagnosticsLogger.record({
          type: "llm_autodiscovery",
          timestamp: Date.now(),
          discovered: discoveredUrl !== null,
          discoveredUrl,
          profileCreated,
          profileId,
          probedPorts,
          durationMs: Date.now() - startTime
        });
      }
      
      return reply.code(200).send({
        success: true,
        data: {
          discovered: discoveredUrl !== null,
          discoveredUrl,
          profileCreated,
          profileId,
          probedPorts
        },
        timestamp: Date.now()
      });
    } catch (error: any) {
      // Record error diagnostics event
      if (diagnosticsLogger) {
        await diagnosticsLogger.record({
          type: "llm_autodiscovery",
          timestamp: Date.now(),
          discovered: false,
          discoveredUrl: null,
          profileCreated: false,
          profileId: null,
          probedPorts: [],
          durationMs: Date.now() - startTime,
          error: {
            name: error.name || "Error",
            message: error.message || "Discovery failed"
          }
        });
      }
      
      return reply.code(500).send({
        success: false,
        error: "DISCOVERY_ERROR",
        message: error.message || "Discovery failed",
        timestamp: Date.now()
      });
    }
  });
}
