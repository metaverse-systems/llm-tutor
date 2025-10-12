import { useState } from "react";

export function DiagnosticsSection() {
	const [isExporting, setIsExporting] = useState(false);
	const [exportStatus, setExportStatus] = useState<string | null>(null);

	const handleExport = async () => {
		setIsExporting(true);
		setExportStatus(null);

		try {
			// Check if diagnostics API is available
			if (window.llmTutor?.diagnostics?.exportSnapshot) {
				const result = await window.llmTutor.diagnostics.exportSnapshot();
				if (result.success) {
					setExportStatus(`Diagnostics exported successfully${result.filename ? `: ${result.filename}` : ""}`);
				} else {
					setExportStatus("Export failed. Please try again.");
				}
			} else {
				setExportStatus("Diagnostics export is not available in this environment.");
			}
		} catch (error) {
			console.error("Failed to export diagnostics:", error);
			setExportStatus("An error occurred during export.");
		} finally {
			setIsExporting(false);
		}
	};

	const handleOpenLogDirectory = async () => {
		try {
			if (window.llmTutor?.diagnostics?.openLogDirectory) {
				await window.llmTutor.diagnostics.openLogDirectory();
			}
		} catch (error) {
			console.error("Failed to open log directory:", error);
		}
	};

	const isDiagnosticsAvailable = Boolean(window.llmTutor?.diagnostics);

	return (
		<section
			aria-labelledby="settings-diagnostics-heading"
			className="mb-8 bg-white dark:bg-gray-800 rounded-lg shadow p-6"
		>
			<h2
				id="settings-diagnostics-heading"
				className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4"
			>
				Diagnostics
			</h2>

			<div className="space-y-4">
				<p className="text-sm text-gray-700 dark:text-gray-300">
					Export diagnostic logs for troubleshooting or sharing with support.{" "}
					<strong>All data stays local</strong> — exports are saved to your device.
				</p>

				{!isDiagnosticsAvailable && (
					<div
						className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-md p-4"
						role="alert"
					>
						<p className="text-sm text-yellow-800 dark:text-yellow-200">
							Diagnostics features are not available in this environment.
						</p>
					</div>
				)}

				<div className="flex gap-4">
					<button
						onClick={handleExport}
						disabled={!isDiagnosticsAvailable || isExporting}
						className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
					>
						{isExporting ? "Exporting..." : "Export Diagnostics"}
					</button>

					<button
						onClick={handleOpenLogDirectory}
						disabled={!isDiagnosticsAvailable}
						className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
					>
						Open Log Directory
					</button>
				</div>

				{exportStatus && (
					<div
						className={`p-4 rounded-md ${
							exportStatus.includes("success")
								? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700"
								: "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700"
						}`}
						role="status"
					>
						<p
							className={`text-sm ${
								exportStatus.includes("success")
									? "text-green-800 dark:text-green-200"
									: "text-red-800 dark:text-red-200"
							}`}
						>
							{exportStatus}
						</p>
					</div>
				)}

				<div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
					<h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
						Retention Information
					</h3>
					<p className="text-sm text-gray-600 dark:text-gray-400">
						Diagnostic logs are retained locally for 30 days by default. You can adjust retention
						settings or manually clear logs at any time.
					</p>
				</div>
			</div>
		</section>
	);
}
