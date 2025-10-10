const path = require("node:path");

const { buildTailwindTheme } = require("./packages/shared/dist/styles/generateThemeAssets.js");
const { themeTokens } = require("./packages/shared/dist/styles/tokens.js");

const sharedTheme = buildTailwindTheme(themeTokens);

/** @type {import('tailwindcss').Config} */
const config = {
	content: [
		path.resolve(__dirname, "apps/frontend/src/**/*.{ts,tsx,js,jsx,html}"),
		path.resolve(__dirname, "apps/frontend/tests/**/*.{ts,tsx,js,jsx,html}"),
		path.resolve(__dirname, "apps/desktop/src/**/*.{ts,tsx,js,jsx,html}"),
		path.resolve(__dirname, "apps/backend/src/**/*.{ts,tsx,js,jsx,html}"),
		path.resolve(__dirname, "packages/shared/src/**/*.{ts,tsx,js,jsx,html}"),
		path.resolve(__dirname, "docs/**/*.{md,mdx}")
	],
	theme: {
		extend: {
			colors: {
				...sharedTheme.colors,
				brand: {
					50: "#f5f7ff",
					100: "#e7ecff",
					200: "#c5d2ff",
					300: "#9ab0ff",
					400: "#6b86ff",
					500: "#3f5dff",
					600: "#2340e6",
					700: "#1a30aa",
					800: "#131f73",
					900: "#0b1240"
				}
			},
			fontFamily: {
				...sharedTheme.fontFamily
			},
			fontSize: {
				...sharedTheme.fontSize
			},
			spacing: {
				...sharedTheme.spacing
			},
			borderRadius: {
				...sharedTheme.borderRadius,
				xl: "1.25rem"
			},
			boxShadow: {
				...sharedTheme.boxShadow
			},
			transitionDuration: {
				...sharedTheme.transitionDuration
			},
			transitionTimingFunction: {
				...sharedTheme.transitionTimingFunction
			}
		}
	},
	plugins: [
		({ addVariant }) => {
			addVariant("contrast", '[data-theme="contrast"] &');
			addVariant("motion-reduced", '[data-motion="reduced"] &');
		}
	],
	future: {
		hoverOnlyWhenSupported: true
	}
};

module.exports = config;
