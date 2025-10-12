import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DiagnosticsSection } from "../../../src/pages/settings/DiagnosticsSection";

describe("DiagnosticsSection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset window.llmTutor mock
		(window as any).llmTutor = undefined;
	});

	afterEach(() => {
		cleanup();
	});

	it("renders the Diagnostics section", () => {
		render(<DiagnosticsSection />);

		expect(screen.getByRole("heading", { name: /diagnostics/i })).toBeInTheDocument();
		expect(screen.getByText(/export diagnostic logs/i)).toBeInTheDocument();
		expect(screen.getByText(/data stays local/i)).toBeInTheDocument();
	});

	it("renders export and open directory buttons", () => {
		render(<DiagnosticsSection />);

		expect(screen.getByRole("button", { name: /export diagnostics/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /open log directory/i })).toBeInTheDocument();
	});

	it("displays disabled state warning when diagnostics unavailable", () => {
		// No window.llmTutor means diagnostics unavailable
		render(<DiagnosticsSection />);

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(screen.getByText(/diagnostics features are not available/i)).toBeInTheDocument();
	});

	it("disables buttons when diagnostics unavailable", () => {
		render(<DiagnosticsSection />);

		const exportButton = screen.getByRole("button", { name: /export diagnostics/i });
		const openDirButton = screen.getByRole("button", { name: /open log directory/i });

		expect(exportButton).toBeDisabled();
		expect(openDirButton).toBeDisabled();
	});

	it("enables buttons when diagnostics API is available", () => {
		(window as any).llmTutor = {
			diagnostics: {
				exportSnapshot: vi.fn(),
				openLogDirectory: vi.fn()
			}
		};

		render(<DiagnosticsSection />);

		const exportButton = screen.getByRole("button", { name: /export diagnostics/i });
		const openDirButton = screen.getByRole("button", { name: /open log directory/i });

		expect(exportButton).not.toBeDisabled();
		expect(openDirButton).not.toBeDisabled();
	});

	it("calls exportSnapshot when export button clicked", async () => {
		const mockExportSnapshot = vi.fn().mockResolvedValue({ 
			success: true, 
			filename: "diagnostics-2025-10-11.jsonl" 
		});

		(window as any).llmTutor = {
			diagnostics: {
				exportSnapshot: mockExportSnapshot,
				openLogDirectory: vi.fn()
			}
		};

		render(<DiagnosticsSection />);

		const exportButton = screen.getByRole("button", { name: /export diagnostics/i });
		fireEvent.click(exportButton);

		await waitFor(() => {
			expect(mockExportSnapshot).toHaveBeenCalled();
		});
	});

	it("displays success message after successful export", async () => {
		const mockExportSnapshot = vi.fn().mockResolvedValue({ 
			success: true, 
			filename: "diagnostics-2025-10-11.jsonl" 
		});

		(window as any).llmTutor = {
			diagnostics: {
				exportSnapshot: mockExportSnapshot,
				openLogDirectory: vi.fn()
			}
		};

		render(<DiagnosticsSection />);

		const exportButton = screen.getByRole("button", { name: /export diagnostics/i });
		fireEvent.click(exportButton);

		await waitFor(() => {
			expect(screen.getByRole("status")).toBeInTheDocument();
			expect(screen.getByText(/exported successfully/i)).toBeInTheDocument();
		});
	});

	it("displays error message after failed export", async () => {
		const mockExportSnapshot = vi.fn().mockResolvedValue({ 
			success: false
		});

		(window as any).llmTutor = {
			diagnostics: {
				exportSnapshot: mockExportSnapshot,
				openLogDirectory: vi.fn()
			}
		};

		render(<DiagnosticsSection />);

		const exportButton = screen.getByRole("button", { name: /export diagnostics/i });
		fireEvent.click(exportButton);

		await waitFor(() => {
			expect(screen.getByRole("status")).toBeInTheDocument();
			expect(screen.getByText(/export failed/i)).toBeInTheDocument();
		});
	});

	it("handles export errors gracefully", async () => {
		const mockExportSnapshot = vi.fn().mockRejectedValue(new Error("Export error"));

		(window as any).llmTutor = {
			diagnostics: {
				exportSnapshot: mockExportSnapshot,
				openLogDirectory: vi.fn()
			}
		};

		render(<DiagnosticsSection />);

		const exportButton = screen.getByRole("button", { name: /export diagnostics/i });
		fireEvent.click(exportButton);

		await waitFor(() => {
			expect(screen.getByRole("status")).toBeInTheDocument();
			expect(screen.getByText(/error occurred/i)).toBeInTheDocument();
		});
	});

	it("calls openLogDirectory when open directory button clicked", async () => {
		const mockOpenLogDirectory = vi.fn().mockResolvedValue(true);

		(window as any).llmTutor = {
			diagnostics: {
				exportSnapshot: vi.fn(),
				openLogDirectory: mockOpenLogDirectory
			}
		};

		render(<DiagnosticsSection />);

		const openDirButton = screen.getByRole("button", { name: /open log directory/i });
		fireEvent.click(openDirButton);

		await waitFor(() => {
			expect(mockOpenLogDirectory).toHaveBeenCalled();
		});
	});

	it("shows loading state during export", async () => {
		const mockExportSnapshot = vi.fn().mockImplementation(() => 
			new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
		);

		(window as any).llmTutor = {
			diagnostics: {
				exportSnapshot: mockExportSnapshot,
				openLogDirectory: vi.fn()
			}
		};

		render(<DiagnosticsSection />);

		const exportButton = screen.getByRole("button", { name: /export diagnostics/i });
		fireEvent.click(exportButton);

		// Should show "Exporting..." text
		expect(screen.getByRole("button", { name: /exporting/i })).toBeInTheDocument();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /export diagnostics/i })).toBeInTheDocument();
		}, { timeout: 200 });
	});

	it("displays retention information", () => {
		render(<DiagnosticsSection />);

		expect(screen.getByText(/retention information/i)).toBeInTheDocument();
		expect(screen.getByText(/30 days/i)).toBeInTheDocument();
	});
});
