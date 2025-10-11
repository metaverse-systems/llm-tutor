import type { AutoDiscoveryService } from "./auto-discovery";

export interface FirstLaunchStateStore {
  get(): Promise<boolean>;
  set(value: boolean): Promise<void>;
}

export interface FirstLaunchAutoDiscoveryCoordinatorOptions {
  autoDiscoveryService: Pick<AutoDiscoveryService, "discover">;
  store: FirstLaunchStateStore;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

export class FirstLaunchAutoDiscoveryCoordinator {
  private pending: Promise<void> | null = null;
  private readonly service: Pick<AutoDiscoveryService, "discover">;
  private readonly store: FirstLaunchStateStore;
  private readonly logger?: Pick<Console, "info" | "warn" | "error">;

  constructor(options: FirstLaunchAutoDiscoveryCoordinatorOptions) {
    if (!options?.autoDiscoveryService) {
      throw new TypeError("autoDiscoveryService is required");
    }
    if (!options?.store) {
      throw new TypeError("store is required");
    }

    this.service = options.autoDiscoveryService;
    this.store = options.store;
    this.logger = options.logger ?? console;
  }

  async maybeRun(): Promise<void> {
    if (this.pending) {
      return this.pending;
    }

    const task = (async () => {
      const shouldRun = await this.store.get();
      if (!shouldRun) {
        return;
      }

      await this.runDiscovery();
    })();

    this.pending = task.finally(() => {
      this.pending = null;
    });

    return this.pending;
  }

  private async runDiscovery(): Promise<void> {
    try {
      const result = await this.service.discover(false);
      if (result.profileCreated) {
        this.logger?.info?.("[llm:auto-discovery] Created default profile", {
          profileId: result.profileId,
          endpointUrl: result.discoveredUrl
        });
      } else {
        this.logger?.info?.("[llm:auto-discovery] Completed without creating profile", {
          discovered: result.discovered,
          endpointUrl: result.discoveredUrl
        });
      }
    } catch (error) {
      this.logger?.warn?.("[llm:auto-discovery] First launch discovery failed", error);
    } finally {
      try {
        await this.store.set(false);
      } catch (error) {
        this.logger?.warn?.("[llm:auto-discovery] Failed to persist first-launch flag", error);
      }
    }
  }
}

export function createMemoryFirstLaunchStore(initialFirstLaunch = true): FirstLaunchStateStore {
  let flag = initialFirstLaunch;
  return {
    get(): Promise<boolean> {
      return Promise.resolve(flag);
    },
    set(value: boolean): Promise<void> {
      flag = value;
      return Promise.resolve();
    }
  };
}

export async function createElectronFirstLaunchStore(): Promise<FirstLaunchStateStore> {
  const [{ default: Store }, { app }] = await Promise.all([
    import("electron-store"),
    import("electron")
  ]);

  const store = new Store<{ firstLaunch: boolean }>({
    name: "llm-lifecycle",
    cwd: app.getPath("userData"),
    defaults: {
      firstLaunch: true
    }
  });

  const accessor = store as unknown as {
    get(key: string, defaultValue: boolean): boolean;
    set(key: string, value: boolean): void;
  };

  return {
    get(): Promise<boolean> {
      return Promise.resolve(accessor.get("firstLaunch", true));
    },
    set(value: boolean): Promise<void> {
      accessor.set("firstLaunch", value);
      return Promise.resolve();
    }
  };
}
