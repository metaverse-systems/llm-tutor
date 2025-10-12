import { useEffect, useRef } from "react";
import { Header } from "../../components/Header/Header";
import { GeneralSection } from "./GeneralSection";
import { LLMProfilesSection } from "./LLMProfilesSection";
import { DiagnosticsSection } from "./DiagnosticsSection";

export function SettingsPage() {
	const headingRef = useRef<HTMLHeadingElement>(null);

	// Auto-focus the heading on mount
	useEffect(() => {
		if (headingRef.current) {
			headingRef.current.focus();
		}
	}, []);

	const handleReturnToPrevious = (e: React.MouseEvent | React.KeyboardEvent) => {
		e.preventDefault();
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
					{/* Skip link for returning to previous view */}
					<a
						href="#"
						onClick={handleReturnToPrevious}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								handleReturnToPrevious(e);
							}
						}}
						className="inline-block mb-4 text-blue-600 dark:text-blue-400 underline focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						← Return to previous view
					</a>

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
