import type { Config } from "tailwindcss";
import type { PluginAPI } from "tailwindcss/types/config";

import { buildTailwindTheme } from "./packages/shared/src/styles/generateThemeAssets.js";
import { themeTokens } from "./packages/shared/src/styles/tokens.js";

const sharedTheme = buildTailwindTheme(themeTokens);

const config: Config = {
  content: [
    "./apps/frontend/src/**/*.{ts,tsx,js,jsx,html}",
    "./apps/frontend/tests/**/*.{ts,tsx,js,jsx,html}",
    "./apps/desktop/src/**/*.{ts,tsx,js,jsx,html}",
    "./apps/backend/src/**/*.{ts,tsx,js,jsx,html}",
    "./packages/shared/src/**/*.{ts,tsx,js,jsx,html}",
    "./docs/**/*.{md,mdx}"
  ],
  safelist: [
    { pattern: /^contrast:/ },
    { pattern: /^motion-reduced:/ }
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
    ({ addVariant }: PluginAPI) => {
      addVariant("contrast", '[data-theme="contrast"] &');
      addVariant("motion-reduced", '[data-motion="reduced"] &');
    }
  ],
  future: {
    hoverOnlyWhenSupported: true
  }
};

export default config;
