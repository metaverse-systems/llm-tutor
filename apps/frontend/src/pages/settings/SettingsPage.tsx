import { useEffect, useRef } from "react";
import type { MouseEvent } from "react";

import { DiagnosticsSection } from "./DiagnosticsSection";
import { GeneralSection } from "./GeneralSection";
import { LLMProfilesSection } from "./LLMProfilesSection";
import { Header } from "../../components/Header/Header";

export function SettingsPage() {
	const headingRef = useRef<HTMLHeadingElement>(null);

	// Auto-focus the heading on mount
	useEffect(() => {
		if (headingRef.current) {
			headingRef.current.focus();
		}
	}, []);

	const handleReturnToPrevious = (event: MouseEvent<HTMLButtonElement>) => {
		event.preventDefault();
		// Navigate back to previous view
		if (window.history.length > 1) {
			window.history.back();
		} else {
			// Fallback to landing page
			window.location.href = "/";
		}
	};

	return (
		<>
			<Header />
			<main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
				<div className="max-w-4xl mx-auto">
					{/* Skip control for returning to previous view */}
					<button
						type="button"
						onClick={handleReturnToPrevious}
						className="inline-flex items-center mb-4 text-blue-600 dark:text-blue-400 underline focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						<span aria-hidden="true" className="mr-1">
							←
						</span>
						Return to previous view
					</button>

					{/* Main heading with auto-focus */}
					<h1
						id="settings-heading"
						ref={headingRef}
						tabIndex={-1}
						className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8 focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						Settings
					</h1>

					{/* General Section */}
					<GeneralSection />

					{/* LLM Profiles Section */}
					<LLMProfilesSection />

					{/* Diagnostics Section */}
					<DiagnosticsSection />
				</div>
			</main>
		</>
	);
}
