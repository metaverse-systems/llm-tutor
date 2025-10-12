import { useState, useEffect } from "react";

interface TelemetryState {
	enabled: boolean;
	consentTimestamp?: number;
}

export function GeneralSection() {
	const [telemetryState, setTelemetryState] = useState<TelemetryState>({ enabled: false });
	const [isLoading, setIsLoading] = useState(true);

	// Load telemetry state on mount
	useEffect(() => {
		const loadTelemetryState = async () => {
			try {
				// Check if we're in Electron environment
				if (window.llmTutor?.settings?.telemetry?.getState) {
					const state = await window.llmTutor.settings.telemetry.getState();
					setTelemetryState(state);
				} else {
					// Web fallback - read from localStorage
					const stored = localStorage.getItem("telemetry-preference");
					if (stored) {
						setTelemetryState(JSON.parse(stored));
					}
				}
			} catch (error) {
				console.error("Failed to load telemetry state:", error);
			} finally {
				setIsLoading(false);
			}
		};

		loadTelemetryState();
	}, []);

	const handleTelemetryToggle = async () => {
		const newEnabled = !telemetryState.enabled;
		setIsLoading(true);

		try {
			let newState: TelemetryState;

			// Check if we're in Electron environment
			if (window.llmTutor?.settings?.telemetry?.setState) {
				newState = await window.llmTutor.settings.telemetry.setState({ enabled: newEnabled });
			} else {
				// Web fallback - save to localStorage
				newState = {
					enabled: newEnabled,
					consentTimestamp: newEnabled ? Date.now() : undefined
				};
				localStorage.setItem("telemetry-preference", JSON.stringify(newState));
			}

			setTelemetryState(newState);
		} catch (error) {
			console.error("Failed to update telemetry state:", error);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<section
			aria-labelledby="settings-general-heading"
			className="mb-8 bg-white dark:bg-gray-800 rounded-lg shadow p-6"
		>
			<h2
				id="settings-general-heading"
				className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4"
			>
				General
			</h2>

			<div className="space-y-6">
				{/* Theme selector placeholder */}
				<div>
					<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
						Theme
					</label>
					<select
						className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
						defaultValue="system"
					>
						<option value="system">System</option>
						<option value="light">Light</option>
						<option value="dark">Dark</option>
					</select>
				</div>

				{/* Telemetry toggle */}
				<div className="border-t border-gray-200 dark:border-gray-700 pt-6">
					<div className="flex items-start justify-between">
						<div className="flex-1">
							<label
								htmlFor="telemetry-toggle"
								className="block text-sm font-medium text-gray-700 dark:text-gray-300"
							>
								Telemetry
							</label>
							<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
								Help improve llm-tutor by sharing usage data. Telemetry is{" "}
								<strong>opt-out by default</strong> — all data stays local unless you explicitly enable it.
								Your privacy is paramount.
							</p>
							{telemetryState.enabled && telemetryState.consentTimestamp && (
								<p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
									Opted in on: {new Date(telemetryState.consentTimestamp).toLocaleDateString()}
								</p>
							)}
						</div>
						<button
							id="telemetry-toggle"
							role="switch"
							aria-checked={telemetryState.enabled}
							aria-label={`Telemetry ${telemetryState.enabled ? "enabled" : "disabled"}`}
							onClick={handleTelemetryToggle}
							disabled={isLoading}
							className={`ml-4 relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
								telemetryState.enabled
									? "bg-blue-600"
									: "bg-gray-200 dark:bg-gray-700"
							}`}
						>
							<span
								aria-hidden="true"
								className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
									telemetryState.enabled ? "translate-x-5" : "translate-x-0"
								}`}
							/>
						</button>
					</div>
				</div>
			</div>
		</section>
	);
}
