import { describe, expect, it, vi } from "vitest";

import type { AutoDiscoveryService, DiscoveryResult } from "../../src/main/llm/auto-discovery";
import {
  FirstLaunchAutoDiscoveryCoordinator,
  createMemoryFirstLaunchStore
} from "../../src/main/llm/first-launch";

describe("FirstLaunchAutoDiscoveryCoordinator", () => {
  it("triggers auto-discovery exactly once on first launch", async () => {
    const store = createMemoryFirstLaunchStore(true);
    const discoveryResult: DiscoveryResult = {
      discovered: true,
      discoveredUrl: "http://localhost:8080",
      profileCreated: true,
      profileId: "11111111-2222-3333-4444-555555555555",
      probedPorts: [8080, 8000, 11434]
    };

    const discover = vi.fn<AutoDiscoveryService["discover"]>().mockResolvedValue(discoveryResult);
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    } satisfies Pick<Console, "info" | "warn" | "error">;

    const coordinator = new FirstLaunchAutoDiscoveryCoordinator({
      autoDiscoveryService: { discover } as Pick<AutoDiscoveryService, "discover">,
      store,
      logger
    });

    await coordinator.maybeRun();

    expect(discover).toHaveBeenCalledTimes(1);
    expect(await store.get()).toBe(false);
    expect(logger.info).toHaveBeenCalledTimes(1);
    const infoCall = logger.info.mock.calls.at(0);
    expect(infoCall).toBeDefined();
    const [message, payload] = infoCall as [string, Record<string, unknown>];
    expect(message).toContain("Created default profile");
    expect(payload).toMatchObject({
      profileId: discoveryResult.profileId,
      endpointUrl: discoveryResult.discoveredUrl
    });

    discover.mockClear();
    logger.info.mockClear();

    await coordinator.maybeRun();
    expect(discover).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("does not launch a second discovery while the first is pending", async () => {
    const store = createMemoryFirstLaunchStore(true);
    let resolveDiscovery: ((result: DiscoveryResult) => void) | undefined;
    const deferred = new Promise<DiscoveryResult>((resolve: (value: DiscoveryResult) => void) => {
      resolveDiscovery = resolve;
    });

    const discover = vi.fn<AutoDiscoveryService["discover"]>(() => deferred);
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    } satisfies Pick<Console, "info" | "warn" | "error">;

    const coordinator = new FirstLaunchAutoDiscoveryCoordinator({
      autoDiscoveryService: { discover } as Pick<AutoDiscoveryService, "discover">,
      store,
      logger
    });

    const firstRun = coordinator.maybeRun();
    const secondRun = coordinator.maybeRun();

    await Promise.resolve();

    expect(discover).toHaveBeenCalledTimes(1);

    resolveDiscovery?.({
      discovered: false,
      discoveredUrl: null,
      profileCreated: false,
      profileId: null,
      probedPorts: [8080, 8000, 11434]
    });

    await Promise.all([firstRun, secondRun]);

    discover.mockClear();

    await coordinator.maybeRun();
    expect(discover).not.toHaveBeenCalled();
  });

  it("swallows discovery errors but marks the first-launch flag as complete", async () => {
    const store = createMemoryFirstLaunchStore(true);
    const discover = vi.fn<AutoDiscoveryService["discover"]>().mockRejectedValue(new Error("boom"));
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    } satisfies Pick<Console, "info" | "warn" | "error">;

    const coordinator = new FirstLaunchAutoDiscoveryCoordinator({
      autoDiscoveryService: { discover } as Pick<AutoDiscoveryService, "discover">,
      store,
      logger
    });

    await coordinator.maybeRun();

    expect(discover).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith("[llm:auto-discovery] First launch discovery failed", expect.any(Error));
    expect(await store.get()).toBe(false);
  });
});
