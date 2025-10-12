import type { BrowserWindow } from "electron";

interface NavigationState {
	previousFocusTarget?: string;
	currentRoute?: string;
}

const navigationState: NavigationState = {};

/**
 * Navigate to the Settings page
 * Stores the prior focus target for restoration when leaving Settings
 */
export async function navigateToSettings(window: BrowserWindow): Promise<void> {
	if (!window) {
		throw new Error("No browser window available for navigation");
	}

	// Get current route before navigation
	const currentUrl = window.webContents.getURL();
	navigationState.currentRoute = currentUrl;

	// Store focus target (would ideally query the renderer, but for now just store route)
	navigationState.previousFocusTarget = currentUrl;

	// Load the settings route
	const baseUrl = currentUrl.split(/[?#]/)[0].replace(/\/[^/]*$/, "");
	await window.loadURL(`${baseUrl}/settings`);
}

/**
 * Get the stored previous focus target
 */
export function getPreviousFocusTarget(): string | undefined {
	return navigationState.previousFocusTarget;
}

/**
 * Clear the navigation state
 */
export function clearNavigationState(): void {
	navigationState.previousFocusTarget = undefined;
	navigationState.currentRoute = undefined;
}

/**
 * Navigate back to the previous route
 */
export async function navigateBack(window: BrowserWindow): Promise<void> {
	if (!window) {
		throw new Error("No browser window available for navigation");
	}

	if (navigationState.previousFocusTarget) {
		await window.loadURL(navigationState.previousFocusTarget);
		clearNavigationState();
	} else {
		// Fallback to browser back
		if (window.webContents.canGoBack()) {
			window.webContents.goBack();
		}
	}
}
