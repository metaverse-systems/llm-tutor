import { LLMProfiles } from "./LLMProfiles";

export function LLMProfilesSection() {
	return (
		<section
			aria-labelledby="settings-llm-profiles-heading"
			className="mb-8"
		>
			<h2
				id="settings-llm-profiles-heading"
				className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4"
			>
				LLM Profiles
			</h2>
			<div className="bg-white dark:bg-gray-800 rounded-lg shadow">
				<LLMProfiles />
			</div>
		</section>
	);
}
