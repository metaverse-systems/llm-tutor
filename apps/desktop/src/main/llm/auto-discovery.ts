import type { DiscoveryScope } from "../../../../../packages/shared/src/contracts/llm-profile-ipc";
import type { LLMProfile, ProviderType } from "../../../../../packages/shared/src/llm/schemas";

const DEFAULT_PORTS = [8080, 8000, 11434] as const;
const DEFAULT_TIMEOUT_MS = 2_000;
const DEFAULT_CACHE_DURATION_MS = 5 * 60 * 1_000;
const DEFAULT_HOSTNAME = "localhost";
const DEFAULT_PROFILE_NAME = "Local llama.cpp";
const HEALTH_CHECK_PATH = "/health";

export interface AutoDiscoveryDiagnosticsEvent {
	type: "llm_autodiscovery";
	timestamp: number;
	discovered: boolean;
	discoveredUrl: string | null;
	profileCreated: boolean;
	profileId: string | null;
	probedPorts: number[];
	force?: boolean;
	durationMs?: number;
	error?: {
		name: string;
		message: string;
	};
}

export interface AutoDiscoveryDiagnosticsRecorder {
	record(event: AutoDiscoveryDiagnosticsEvent): Promise<void> | void;
}

export interface RedactedProfile extends Omit<LLMProfile, "apiKey"> {
	apiKey: string;
}

export interface ListProfilesResult {
	profiles: RedactedProfile[];
	encryptionAvailable: boolean;
	activeProfileId: string | null;
}

export interface CreateProfilePayload {
	name: string;
	providerType: ProviderType;
	endpointUrl: string;
	apiKey: string;
	modelId: string | null;
	consentTimestamp: number | null;
}

export interface CreateProfileResult {
	profile: RedactedProfile;
	warning?: string;
}

export interface AutoDiscoveryProfileService {
	listProfiles(): Promise<ListProfilesResult>;
	createProfile(payload: CreateProfilePayload): Promise<CreateProfileResult>;
}

export interface AutoDiscoveryServiceOptions {
	profileService: AutoDiscoveryProfileService;
	diagnosticsRecorder?: AutoDiscoveryDiagnosticsRecorder | null;
	fetchImpl?: typeof fetch;
	ports?: number[];
	timeoutMs?: number;
	cacheDurationMs?: number;
	hostname?: string;
	healthPath?: string;
	logger?: Pick<Console, "info" | "warn" | "error">;
	now?: () => number;
}

export interface DiscoveryResult {
	discovered: boolean;
	discoveredUrl: string | null;
	profileCreated: boolean;
	profileId: string | null;
	probedPorts: number[];
}

type ProbeResult =
	| {
		port: number;
		ok: true;
		endpointUrl: string;
	}
	| {
		port: number;
		ok: false;
		reason?: unknown;
		status?: number;
	};

export class AutoDiscoveryService {
	private readonly profileService: AutoDiscoveryProfileService;
	private readonly diagnosticsRecorder?: AutoDiscoveryDiagnosticsRecorder | null;
	private readonly fetchImpl: typeof fetch;
	private readonly ports: number[];
	private readonly timeoutMs: number;
	private readonly cacheDurationMs: number;
	private readonly hostname: string;
	private readonly healthPath: string;
	private readonly logger: Pick<Console, "info" | "warn" | "error">;
	private readonly now: () => number;
	private lastResult: { result: DiscoveryResult; timestamp: number } | null = null;
	private pendingDiscovery: Promise<DiscoveryResult> | null = null;

	constructor(options: AutoDiscoveryServiceOptions) {
		if (!options?.profileService) {
			throw new TypeError("AutoDiscoveryService requires a profileService instance");
		}

		this.profileService = options.profileService;
		this.diagnosticsRecorder = options.diagnosticsRecorder ?? null;
		const fetchCandidate = options.fetchImpl ?? (globalThis.fetch as typeof fetch | undefined);
		if (!fetchCandidate) {
			throw new TypeError("AutoDiscoveryService requires a fetch implementation");
		}
		this.fetchImpl = fetchCandidate;
		this.ports = Array.isArray(options.ports) && options.ports.length > 0 ? [...options.ports] : [...DEFAULT_PORTS];
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.cacheDurationMs = options.cacheDurationMs ?? DEFAULT_CACHE_DURATION_MS;
		this.hostname = options.hostname?.trim() || DEFAULT_HOSTNAME;
		this.healthPath = options.healthPath ?? HEALTH_CHECK_PATH;
		this.logger = options.logger ?? console;
		this.now = options.now ?? (() => Date.now());
	}

	async discover(scopeOrForce?: DiscoveryScope | boolean): Promise<DiscoveryResult> {
		// Support legacy boolean parameter for backward compatibility
		const scope: DiscoveryScope | null = typeof scopeOrForce === "boolean" 
			? null 
			: scopeOrForce ?? null;
		const force = typeof scopeOrForce === "boolean" ? scopeOrForce : false;

		if (!force) {
			const cached = this.getCachedResult();
			if (cached) {
				return cached;
			}
		}

		if (this.pendingDiscovery) {
			return this.pendingDiscovery;
		}

		this.pendingDiscovery = this.executeDiscovery({ force, scope }).finally(() => {
			this.pendingDiscovery = null;
		});

		const result = await this.pendingDiscovery;
		return result;
	}

	private getCachedResult(): DiscoveryResult | null {
		if (!this.lastResult) {
			return null;
		}

		const age = this.now() - this.lastResult.timestamp;
		if (age > this.cacheDurationMs) {
			return null;
		}

		return { ...this.lastResult.result };
	}

	private async executeDiscovery(options: { force: boolean; scope: DiscoveryScope | null }): Promise<DiscoveryResult> {
		const startedAt = this.now();
		
		// Use scope timeout if provided, otherwise use default
		const effectiveTimeout = options.scope?.timeoutMs ?? this.timeoutMs;
		
		// For now, we only support local discovery (llama.cpp/Ollama probing)
		// Remote discovery (Azure) could be implemented in the future
		const strategy = options.scope?.strategy ?? "local";
		if (strategy === "remote") {
			this.logger.warn?.("Remote discovery strategy not yet implemented, falling back to local");
		}
		
		const results = await Promise.allSettled(
			this.ports.map((port) => this.probePort(port, effectiveTimeout))
		);

		const successfulProbe = results
			.filter((entry): entry is PromiseFulfilledResult<ProbeResult> => entry.status === "fulfilled")
			.map((entry) => entry.value)
			.find((probe) => probe.ok);

		if (successfulProbe && successfulProbe.ok) {
			try {
				const ensured = await this.ensureDefaultProfile(successfulProbe.endpointUrl);
				const discoveryResult: DiscoveryResult = {
					discovered: true,
					discoveredUrl: successfulProbe.endpointUrl,
					profileCreated: ensured.profileCreated,
					profileId: ensured.profileId,
					probedPorts: [...this.ports]
				};

				this.setCache(discoveryResult);
				await this.recordDiagnostics({
					discoveryResult,
					force: options.force,
					startedAt
				});
				return discoveryResult;
			} catch (error) {
				await this.recordDiagnostics({
					discoveryResult: {
						discovered: true,
						discoveredUrl: successfulProbe.endpointUrl,
						profileCreated: false,
						profileId: null,
						probedPorts: [...this.ports]
					},
					force: options.force,
					startedAt,
					error
				});
				throw error;
			}
		}

		const discoveryResult: DiscoveryResult = {
			discovered: false,
			discoveredUrl: null,
			profileCreated: false,
			profileId: null,
			probedPorts: [...this.ports]
		};

		this.setCache(discoveryResult);
		await this.recordDiagnostics({ discoveryResult, force: options.force, startedAt });
		return discoveryResult;
	}

	private setCache(result: DiscoveryResult): void {
		this.lastResult = { result: { ...result }, timestamp: this.now() };
	}

	private async ensureDefaultProfile(endpointUrl: string): Promise<{
		profileCreated: boolean;
		profileId: string | null;
	}> {
		const normalizedEndpoint = normalizeEndpoint(endpointUrl);
		const state = await this.profileService.listProfiles();

		const existing = state.profiles.find((profile) => {
			if (profile.providerType !== "llama.cpp") {
				return false;
			}
			return normalizeEndpoint(profile.endpointUrl) === normalizedEndpoint;
		});

		if (existing) {
			return {
				profileCreated: false,
				profileId: existing.id
			};
		}

		const created = await this.profileService.createProfile({
			name: DEFAULT_PROFILE_NAME,
			providerType: "llama.cpp",
			endpointUrl: normalizedEndpoint,
			apiKey: "",
			modelId: null,
			consentTimestamp: null
		});

		return {
			profileCreated: true,
			profileId: created.profile.id
		};
	}

	private async probePort(port: number, timeoutMs?: number): Promise<ProbeResult> {
		const controller = new AbortController();
		const effectiveTimeout = timeoutMs ?? this.timeoutMs;
		const timeout = setTimeout(() => controller.abort(), effectiveTimeout);
		const url = buildProbeUrl({ hostname: this.hostname, port, path: this.healthPath });

		try {
			const response = await this.fetchImpl(url, { method: "GET", signal: controller.signal });
			if (response.ok) {
				return {
					port,
					ok: true,
					endpointUrl: buildEndpointUrl({ hostname: this.hostname, port })
				};
			}

			return { port, ok: false, status: response.status };
		} catch (error) {
			return { port, ok: false, reason: error };
		} finally {
			clearTimeout(timeout);
		}
	}

	private async recordDiagnostics(input: {
		discoveryResult: DiscoveryResult;
		force: boolean;
		startedAt: number;
		error?: unknown;
	}): Promise<void> {
		if (!this.diagnosticsRecorder) {
			return;
		}

		const event: AutoDiscoveryDiagnosticsEvent = {
			type: "llm_autodiscovery",
			timestamp: this.now(),
			discovered: input.discoveryResult.discovered,
			discoveredUrl: input.discoveryResult.discoveredUrl,
			profileCreated: input.discoveryResult.profileCreated,
			profileId: input.discoveryResult.profileId,
			probedPorts: [...input.discoveryResult.probedPorts],
			force: input.force,
			durationMs: Math.max(0, this.now() - input.startedAt)
		};

		if (input.error instanceof Error) {
			event.error = {
				name: input.error.name,
				message: input.error.message
			};
		} else if (input.error) {
			event.error = {
				name: "UnknownError",
				message: typeof input.error === "string" ? input.error : JSON.stringify(input.error)
			};
		}

		try {
			await Promise.resolve(this.diagnosticsRecorder.record(event));
		} catch (error) {
			this.logger.warn?.("Failed to record auto-discovery diagnostics event", error);
		}
	}
}

function buildProbeUrl(options: { hostname: string; port: number; path: string }): string {
	const url = new URL(`http://${options.hostname}:${options.port}`);
	url.pathname = options.path.startsWith("/") ? options.path : `/${options.path}`;
	return url.toString();
}

function buildEndpointUrl(options: { hostname: string; port: number }): string {
	const url = new URL(`http://${options.hostname}:${options.port}`);
	url.pathname = "";
	url.hash = "";
	url.search = "";
	return url.toString().replace(/\/$/, "");
}

function normalizeEndpoint(raw: string): string {
	try {
		const url = new URL(raw);
		url.hash = "";
		url.search = "";
		if (url.pathname === "/") {
			url.pathname = "";
		}
		return url.toString().replace(/\/$/, "");
	} catch {
		return raw.trim();
	}
}
