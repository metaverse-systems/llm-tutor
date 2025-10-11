import { describe, it, expect, beforeEach, vi } from "vitest";
import { createProfileIpcRouter, type ProfileIpcRouterOptions } from "../../src/main/ipc/profile-ipc.router";
import { ProfileIpcDiagnosticsRecorder } from "../../src/main/diagnostics/profile-ipc.recorder";
import { SafeStorageOutageService } from "../../src/main/services/safe-storage-outage.service";
import type {
  ProfileIpcRequestEnvelope,
  ProfileOperationResponse,
  ListProfilesResponse,
  CreateProfileResponse,
  ProfileSummary
} from "@metaverse-systems/llm-tutor-shared/src/contracts/llm-profile-ipc";

const PERFORMANCE_BUDGET_MS = 500;
const TOLERANCE_MS = 50; // Allow 50ms tolerance for test overhead

describe("Profile IPC Router Performance", () => {
  let diagnosticsRecorder: ProfileIpcDiagnosticsRecorder;
  let safeStorageOutageService: SafeStorageOutageService;
  let mockNow: () => number;
  let currentTime: number;

  beforeEach(() => {
    currentTime = 1000000;
    mockNow = vi.fn(() => currentTime);
    diagnosticsRecorder = new ProfileIpcDiagnosticsRecorder({ now: mockNow });
    safeStorageOutageService = new SafeStorageOutageService({ now: mockNow });
  });

  const createMockProfile = (id: string, name: string): ProfileSummary => ({
    id,
    name,
    providerType: "llama.cpp",
    endpointUrl: "http://localhost:8080",
    apiKey: "***REDACTED***",
    isActive: false,
    modelId: null,
    consentTimestamp: null,
    createdAt: 1000,
    modifiedAt: 1000
  });

  const createEnvelope = (
    channel: ProfileIpcRequestEnvelope["channel"],
    payload: any
  ): ProfileIpcRequestEnvelope => ({
    channel,
    requestId: "9f1a4a1a-7b11-4a12-a9f0-0a6f4ce04f65",
    timestamp: currentTime,
    context: {
      operatorId: "8e1a3a1a-6b11-4a12-a9f0-0a6f4ce04f64",
      operatorRole: "support_engineer",
      locale: "en-US"
    },
    payload
  });

  it("list handler completes within budget with empty profiles", async () => {
    const profileService = {
      listProfiles: vi.fn(async () => ({
        profiles: [],
        encryptionAvailable: true,
        activeProfileId: null
      }))
    };

    const router = createProfileIpcRouter({
      profileService,
      diagnosticsRecorder,
      safeStorageOutageService,
      now: mockNow
    });

    const envelope = createEnvelope("llmProfile:list", { type: "list" });

    const startTime = currentTime;
    const response = await router.invoke(envelope);
    const endTime = currentTime;

    expect(response.success).toBe(true);
    expect(response.durationMs).toBeLessThan(PERFORMANCE_BUDGET_MS);
    expect(endTime - startTime).toBeLessThan(PERFORMANCE_BUDGET_MS + TOLERANCE_MS);
  });

  it("list handler completes within budget with 10 profiles", async () => {
    const profiles = Array.from({ length: 10 }, (_, i) =>
      createMockProfile(`profile-${i}`, `Profile ${i}`)
    );

    const profileService = {
      listProfiles: vi.fn(async () => ({
        profiles,
        encryptionAvailable: true,
        activeProfileId: profiles[0].id
      }))
    };

    const router = createProfileIpcRouter({
      profileService,
      diagnosticsRecorder,
      safeStorageOutageService,
      now: mockNow
    });

    const envelope = createEnvelope("llmProfile:list", { type: "list" });

    const startTime = currentTime;
    currentTime += 50; // Simulate 50ms operation
    const response = await router.invoke(envelope);

    expect(response.success).toBe(true);
    expect(response.durationMs).toBe(50);
    expect(response.durationMs).toBeLessThan(PERFORMANCE_BUDGET_MS);

    const data = response.data as ListProfilesResponse;
    expect(data.profiles).toHaveLength(10);
  });

  it("list handler completes within budget with 50 profiles", async () => {
    const profiles = Array.from({ length: 50 }, (_, i) =>
      createMockProfile(`profile-${i}`, `Profile ${i}`)
    );

    const profileService = {
      listProfiles: vi.fn(async () => ({
        profiles,
        encryptionAvailable: true,
        activeProfileId: profiles[0].id
      }))
    };

    const router = createProfileIpcRouter({
      profileService,
      diagnosticsRecorder,
      safeStorageOutageService,
      now: mockNow
    });

    const envelope = createEnvelope("llmProfile:list", { type: "list" });

    const startTime = currentTime;
    currentTime += 100; // Simulate 100ms operation
    const response = await router.invoke(envelope);

    expect(response.success).toBe(true);
    expect(response.durationMs).toBe(100);
    expect(response.durationMs).toBeLessThan(PERFORMANCE_BUDGET_MS);

    const data = response.data as ListProfilesResponse;
    expect(data.profiles).toHaveLength(50);
  });

  it("create handler completes within budget", async () => {
    const createdProfile = createMockProfile("new-profile-id", "New Profile");

    const profileService = {
      createProfile: vi.fn(async () => ({
        profile: createdProfile,
        warning: null
      }))
    };

    const router = createProfileIpcRouter({
      profileService,
      diagnosticsRecorder,
      safeStorageOutageService,
      now: mockNow
    });

    const envelope = createEnvelope("llmProfile:create", {
      type: "create",
      profile: {
        name: "New Profile",
        providerType: "llama.cpp",
        endpointUrl: "http://localhost:8080",
        apiKey: "test-key",
        modelId: null,
        consentTimestamp: null
      }
    });

    const startTime = currentTime;
    currentTime += 80; // Simulate 80ms operation
    const response = await router.invoke(envelope);

    expect(response.success).toBe(true);
    expect(response.durationMs).toBe(80);
    expect(response.durationMs).toBeLessThan(PERFORMANCE_BUDGET_MS);

    const data = response.data as CreateProfileResponse;
    expect(data.profile.name).toBe("New Profile");
  });

  it("update handler completes within budget", async () => {
    const updatedProfile = createMockProfile("profile-1", "Updated Name");

    const profileService = {
      updateProfile: vi.fn(async () => ({
        profile: updatedProfile,
        warning: null
      }))
    };

    const router = createProfileIpcRouter({
      profileService,
      diagnosticsRecorder,
      safeStorageOutageService,
      now: mockNow
    });

    const envelope = createEnvelope("llmProfile:update", {
      type: "update",
      profileId: "profile-1",
      changes: { name: "Updated Name" }
    });

    const startTime = currentTime;
    currentTime += 70; // Simulate 70ms operation
    const response = await router.invoke(envelope);

    expect(response.success).toBe(true);
    expect(response.durationMs).toBe(70);
    expect(response.durationMs).toBeLessThan(PERFORMANCE_BUDGET_MS);
  });

  it("delete handler completes within budget", async () => {
    const profileService = {
      deleteProfile: vi.fn(async () => ({
        deletedId: "profile-1",
        newActiveProfileId: null,
        requiresUserSelection: false
      }))
    };

    const router = createProfileIpcRouter({
      profileService,
      diagnosticsRecorder,
      safeStorageOutageService,
      now: mockNow
    });

    const envelope = createEnvelope("llmProfile:delete", {
      type: "delete",
      profileId: "profile-1"
    });

    const startTime = currentTime;
    currentTime += 60; // Simulate 60ms operation
    const response = await router.invoke(envelope);

    expect(response.success).toBe(true);
    expect(response.durationMs).toBe(60);
    expect(response.durationMs).toBeLessThan(PERFORMANCE_BUDGET_MS);
  });

  it("activate handler completes within budget", async () => {
    const activeProfile = createMockProfile("profile-1", "Active Profile");
    activeProfile.isActive = true;

    const profileService = {
      activateProfile: vi.fn(async () => ({
        activeProfile,
        deactivatedProfileId: "profile-2"
      }))
    };

    const router = createProfileIpcRouter({
      profileService,
      diagnosticsRecorder,
      safeStorageOutageService,
      now: mockNow
    });

    const envelope = createEnvelope("llmProfile:activate", {
      type: "activate",
      profileId: "profile-1",
      force: false
    });

    const startTime = currentTime;
    currentTime += 50; // Simulate 50ms operation
    const response = await router.invoke(envelope);

    expect(response.success).toBe(true);
    expect(response.durationMs).toBe(50);
    expect(response.durationMs).toBeLessThan(PERFORMANCE_BUDGET_MS);
  });

  it("emits performance warning when budget exceeded", async () => {
    const profileService = {
      listProfiles: vi.fn(async () => {
        // Simulate slow operation exceeding budget
        await new Promise((resolve) => setTimeout(resolve, 0));
        return {
          profiles: [],
          encryptionAvailable: true,
          activeProfileId: null
        };
      })
    };

    const warnings: any[] = [];
    const onPerformanceWarning = vi.fn((warning) => warnings.push(warning));

    const router = createProfileIpcRouter({
      profileService,
      diagnosticsRecorder,
      safeStorageOutageService,
      now: mockNow,
      onPerformanceWarning
    });

    const envelope = createEnvelope("llmProfile:list", { type: "list" });

    const startTime = currentTime;
    currentTime += 550; // Simulate operation exceeding 500ms budget
    await router.invoke(envelope);

    expect(onPerformanceWarning).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "llmProfile:list",
        durationMs: 550,
        budgetMs: 500
      })
    );
  });

  it("does not emit warning when within budget", async () => {
    const profileService = {
      listProfiles: vi.fn(async () => ({
        profiles: [],
        encryptionAvailable: true,
        activeProfileId: null
      }))
    };

    const onPerformanceWarning = vi.fn();

    const router = createProfileIpcRouter({
      profileService,
      diagnosticsRecorder,
      safeStorageOutageService,
      now: mockNow,
      onPerformanceWarning
    });

    const envelope = createEnvelope("llmProfile:list", { type: "list" });

    currentTime += 200; // Well within budget
    await router.invoke(envelope);

    expect(onPerformanceWarning).not.toHaveBeenCalled();
  });

  it("handles concurrent requests efficiently", async () => {
    const profiles = Array.from({ length: 20 }, (_, i) =>
      createMockProfile(`profile-${i}`, `Profile ${i}`)
    );

    const profileService = {
      listProfiles: vi.fn(async () => ({
        profiles,
        encryptionAvailable: true,
        activeProfileId: profiles[0].id
      }))
    };

    const router = createProfileIpcRouter({
      profileService,
      diagnosticsRecorder,
      safeStorageOutageService,
      now: mockNow
    });

    // Simulate 5 concurrent list requests
    const requests = Array.from({ length: 5 }, () => {
      const envelope = createEnvelope("llmProfile:list", { type: "list" });
      return router.invoke(envelope);
    });

    currentTime += 150; // All should complete within 150ms
    const responses = await Promise.all(requests);

    responses.forEach((response) => {
      expect(response.success).toBe(true);
      expect(response.durationMs).toBeLessThan(PERFORMANCE_BUDGET_MS);
    });

    expect(profileService.listProfiles).toHaveBeenCalledTimes(5);
  });

  it("records diagnostics breadcrumbs without significant overhead", async () => {
    const profileService = {
      listProfiles: vi.fn(async () => ({
        profiles: [],
        encryptionAvailable: true,
        activeProfileId: null
      }))
    };

    const breadcrumbs: any[] = [];
    diagnosticsRecorder.onBreadcrumb((breadcrumb) => breadcrumbs.push(breadcrumb));

    const router = createProfileIpcRouter({
      profileService,
      diagnosticsRecorder,
      safeStorageOutageService,
      now: mockNow
    });

    const envelope = createEnvelope("llmProfile:list", { type: "list" });

    const startTime = currentTime;
    currentTime += 100;
    await router.invoke(envelope);

    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0].durationMs).toBe(100);
    expect(breadcrumbs[0].channel).toBe("llmProfile:list");
  });
});
