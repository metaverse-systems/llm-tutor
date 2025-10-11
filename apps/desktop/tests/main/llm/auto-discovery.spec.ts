import { once } from "node:events";
import http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	AutoDiscoveryService,
	type AutoDiscoveryDiagnosticsEvent,
	type AutoDiscoveryDiagnosticsRecorder,
	type AutoDiscoveryProfileService,
	type CreateProfilePayload,
	type CreateProfileResult,
	type ListProfilesResult,
	type RedactedProfile
} from "../../../src/main/llm/auto-discovery";

function createProfileServiceMock(seed?: { profiles?: RedactedProfile[]; activeProfileId?: string | null }) {
	const listProfilesImpl = (): Promise<ListProfilesResult> =>
		Promise.resolve({
			profiles: seed?.profiles ?? [],
			encryptionAvailable: true,
			activeProfileId: seed?.activeProfileId ?? null
		});
	const createProfileImpl = (payload: CreateProfilePayload): Promise<CreateProfileResult> =>
		Promise.resolve({
			profile: {
				id: "3f1a8f02-7a60-4c5f-96f3-e3538a0a18d7",
				name: payload.name,
				providerType: payload.providerType,
				endpointUrl: payload.endpointUrl,
				apiKey: "***REDACTED***",
				modelId: payload.modelId,
				isActive: true,
				consentTimestamp: payload.consentTimestamp,
				createdAt: Date.now(),
				modifiedAt: Date.now()
			}
		});

	const listProfiles = vi.fn(listProfilesImpl);
	const createProfile = vi.fn(createProfileImpl);

	return {
		service: {
			listProfiles: listProfiles as AutoDiscoveryProfileService["listProfiles"],
			createProfile: createProfile as AutoDiscoveryProfileService["createProfile"]
		},
		listProfiles,
		createProfile
	};
}

async function startHealthServer(handler: (request: http.IncomingMessage, response: http.ServerResponse) => void) {
	const server = http.createServer(handler);
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (!address || typeof address !== "object" || typeof address.port !== "number") {
		throw new Error("Failed to determine mock server port");
	}
	return { server, port: address.port };
}

async function stopServer(server: http.Server | null): Promise<void> {
	if (!server?.listening) {
		return;
	}

	await new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}

describe("AutoDiscoveryService", () => {
	let currentTime = 0;
	const now = () => currentTime;
	let recordSpy: ReturnType<typeof vi.fn> & ((event: AutoDiscoveryDiagnosticsEvent) => void);
	let diagnosticsRecorder: AutoDiscoveryDiagnosticsRecorder;
	let activeServer: http.Server | null = null;

	beforeEach(() => {
		currentTime = 17_000;
		recordSpy = vi.fn((event: AutoDiscoveryDiagnosticsEvent) => {
			void event;
		});
		diagnosticsRecorder = {
			record: recordSpy
		};
	});

	afterEach(async () => {
		await stopServer(activeServer);
		activeServer = null;
		vi.restoreAllMocks();
	});

	it("creates a default profile when a llama.cpp server is discovered", async () => {
		const { server, port } = await startHealthServer((req, res) => {
			if (req.method === "GET" && req.url?.startsWith("/health")) {
				res.writeHead(200, { "content-type": "application/json" });
				res.end(JSON.stringify({ status: "ok" }));
				return;
			}

			res.writeHead(404);
			res.end();
		});
		activeServer = server;

		const profileService = createProfileServiceMock();
		const fetchSpy = vi.fn<typeof fetch>((input, init) => fetch(input, init));

		const service = new AutoDiscoveryService({
			profileService: profileService.service,
			diagnosticsRecorder,
			fetchImpl: fetchSpy,
			ports: [port, port + 1],
			timeoutMs: 500,
			cacheDurationMs: 60_000,
			hostname: "127.0.0.1",
			now
		});

		const result = await service.discover();

		expect(result).toEqual({
			discovered: true,
			discoveredUrl: `http://127.0.0.1:${port}`,
			profileCreated: true,
			profileId: "3f1a8f02-7a60-4c5f-96f3-e3538a0a18d7",
			probedPorts: [port, port + 1]
		});

		expect(profileService.listProfiles).toHaveBeenCalledTimes(1);
		expect(profileService.createProfile).toHaveBeenCalledTimes(1);
		expect(profileService.createProfile).toHaveBeenCalledWith({
			name: "Local llama.cpp",
			providerType: "llama.cpp",
			endpointUrl: `http://127.0.0.1:${port}`,
			apiKey: "",
			modelId: null,
			consentTimestamp: null
		});

		expect(fetchSpy).toHaveBeenCalled();
		expect(recordSpy).toHaveBeenCalledTimes(1);
		const lastCall = recordSpy.mock.calls.at(-1) as [AutoDiscoveryDiagnosticsEvent] | undefined;
		expect(lastCall).toBeDefined();
		const [event] = lastCall!;
		expect(event).toMatchObject({
			type: "llm_autodiscovery",
			discovered: true,
			discoveredUrl: `http://127.0.0.1:${port}`,
			profileCreated: true,
			probedPorts: [port, port + 1]
		});
	});

	it("returns cached discovery results within the cache window", async () => {
		const { server, port } = await startHealthServer((req, res) => {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ status: "ok" }));
		});
		activeServer = server;

		const profileService = createProfileServiceMock();
		const fetchSpy = vi.fn<typeof fetch>((input, init) => fetch(input, init));

		const service = new AutoDiscoveryService({
			profileService: profileService.service,
			diagnosticsRecorder,
			fetchImpl: fetchSpy,
			ports: [port],
			cacheDurationMs: 30_000,
			hostname: "127.0.0.1",
			now
		});

		const first = await service.discover();
		expect(first.discovered).toBe(true);
		expect(fetchSpy).toHaveBeenCalledTimes(1);

		profileService.listProfiles.mockClear();
		profileService.createProfile.mockClear();
		fetchSpy.mockClear();
		recordSpy.mockClear();

		currentTime += 1_000; // 1s later, still within cache window
		const second = await service.discover();

		expect(second).toEqual(first);
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(profileService.listProfiles).not.toHaveBeenCalled();
		expect(profileService.createProfile).not.toHaveBeenCalled();
		expect(recordSpy).not.toHaveBeenCalled();
	});

	it("forces a new discovery run when force=true", async () => {
		const { server, port } = await startHealthServer((req, res) => {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ status: "ok" }));
		});
		activeServer = server;

		const profileService = createProfileServiceMock();
		const fetchSpy = vi.fn<typeof fetch>((input, init) => fetch(input, init));

		const service = new AutoDiscoveryService({
			profileService: profileService.service,
			diagnosticsRecorder,
			fetchImpl: fetchSpy,
			ports: [port],
			cacheDurationMs: 30_000,
			hostname: "127.0.0.1",
			now
		});

		await service.discover();
		fetchSpy.mockClear();
		profileService.createProfile.mockClear();
		profileService.listProfiles.mockClear();
		recordSpy.mockClear();

		currentTime += 1_000;
		await service.discover(true);

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(profileService.listProfiles).toHaveBeenCalledTimes(1);
		expect(profileService.createProfile).toHaveBeenCalledTimes(1);
		expect(recordSpy).toHaveBeenCalledTimes(1);
	});

	it("returns a negative result when no servers respond", async () => {
		const profileService = createProfileServiceMock();
		const fetchSpy = vi.fn(() => Promise.reject(new Error("ECONNREFUSED")));

		const service = new AutoDiscoveryService({
			profileService: profileService.service,
			diagnosticsRecorder,
			fetchImpl: fetchSpy,
			ports: [17999, 18999],
			cacheDurationMs: 30_000,
			hostname: "127.0.0.1",
			now
		});

		const result = await service.discover();

		expect(result).toEqual({
			discovered: false,
			discoveredUrl: null,
			profileCreated: false,
			profileId: null,
			probedPorts: [17999, 18999]
		});

		expect(profileService.createProfile).not.toHaveBeenCalled();
		expect(recordSpy).toHaveBeenCalledTimes(1);
	});
});
