import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GeneralSection } from "../../../src/pages/settings/GeneralSection";

describe("GeneralSection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Clear localStorage before each test
		localStorage.clear();
		// Reset window.llmTutor mock
		(window as any).llmTutor = undefined;
	});

	afterEach(() => {
		cleanup();
	});

	it("renders the General section with telemetry toggle", () => {
		render(<GeneralSection />);

		expect(screen.getByRole("heading", { name: /general/i })).toBeInTheDocument();
		expect(screen.getByRole("switch", { name: /telemetry/i })).toBeInTheDocument();
	});

	it("telemetry toggle defaults to off (aria-checked=false)", async () => {
		render(<GeneralSection />);

		const toggle = screen.getByRole("switch", { name: /telemetry/i });
		
		await waitFor(() => {
			expect(toggle).toHaveAttribute("aria-checked", "false");
		});
	});

	it("displays opt-out default messaging", () => {
		render(<GeneralSection />);

		expect(screen.getByText(/opt-out by default/i)).toBeInTheDocument();
		expect(screen.getByText(/data stays local/i)).toBeInTheDocument();
	});

	it("toggles telemetry state when clicked (web mode)", async () => {
		render(<GeneralSection />);

		const toggle = screen.getByRole("switch", { name: /telemetry/i });
		
		// Initially off
		await waitFor(() => {
			expect(toggle).toHaveAttribute("aria-checked", "false");
		});

		// Click to enable
		fireEvent.click(toggle);

		await waitFor(() => {
			expect(toggle).toHaveAttribute("aria-checked", "true");
		});

		// Check localStorage was updated
		const stored = localStorage.getItem("telemetry-preference");
		expect(stored).toBeTruthy();
		const parsed = JSON.parse(stored!);
		expect(parsed.enabled).toBe(true);
		expect(parsed.consentTimestamp).toBeDefined();
	});

	it("displays consent timestamp when telemetry is enabled", async () => {
		const consentTimestamp = Date.now();
		localStorage.setItem("telemetry-preference", JSON.stringify({
			enabled: true,
			consentTimestamp
		}));

		render(<GeneralSection />);

		await waitFor(() => {
			const toggle = screen.getByRole("switch", { name: /telemetry/i });
			expect(toggle).toHaveAttribute("aria-checked", "true");
		});

		expect(screen.getByText(/opted in on:/i)).toBeInTheDocument();
	});

	it("uses preload bridge when available (Electron mode)", async () => {
		const mockGetState = vi.fn().mockResolvedValue({ enabled: false });
		const mockSetState = vi.fn().mockResolvedValue({ 
			enabled: true, 
			consentTimestamp: Date.now() 
		});

		// Mock Electron environment
		(window as any).llmTutor = {
			settings: {
				telemetry: {
					getState: mockGetState,
					setState: mockSetState
				}
			}
		};

		render(<GeneralSection />);

		// Should call getState on mount
		await waitFor(() => {
			expect(mockGetState).toHaveBeenCalled();
		});

		const toggle = screen.getByRole("switch", { name: /telemetry/i });
		fireEvent.click(toggle);

		// Should call setState when toggled
		await waitFor(() => {
			expect(mockSetState).toHaveBeenCalledWith({ enabled: true });
		});
	});

	it("handles errors gracefully when loading state fails", async () => {
		const mockGetState = vi.fn().mockRejectedValue(new Error("Failed to load"));

		(window as any).llmTutor = {
			settings: {
				telemetry: {
					getState: mockGetState,
					setState: vi.fn()
				}
			}
		};

		// Should not crash
		render(<GeneralSection />);

		await waitFor(() => {
			const toggle = screen.getByRole("switch", { name: /telemetry/i });
			// Should default to off on error
			expect(toggle).toHaveAttribute("aria-checked", "false");
		});
	});

	it("shows loading state while updating telemetry preference", async () => {
		const mockSetState = vi.fn().mockImplementation(() => 
			new Promise(resolve => setTimeout(() => resolve({ enabled: true, consentTimestamp: Date.now() }), 100))
		);

		(window as any).llmTutor = {
			settings: {
				telemetry: {
					getState: vi.fn().mockResolvedValue({ enabled: false }),
					setState: mockSetState
				}
			}
		};

		render(<GeneralSection />);

		await waitFor(() => {
			const toggle = screen.getByRole("switch", { name: /telemetry/i });
			expect(toggle).not.toBeDisabled();
		});

		const toggle = screen.getByRole("switch", { name: /telemetry/i });
		fireEvent.click(toggle);

		// Should be disabled while loading
		expect(toggle).toBeDisabled();

		// Should re-enable after update
		await waitFor(() => {
			expect(toggle).not.toBeDisabled();
		}, { timeout: 200 });
	});
});
