import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./apps/frontend/src/**/*.{ts,tsx,js,jsx,html}",
    "./apps/frontend/tests/**/*.{ts,tsx,js,jsx,html}",
    "./apps/desktop/src/**/*.{ts,tsx,js,jsx,html}",
    "./apps/backend/src/**/*.{ts,tsx,js,jsx,html}",
    "./packages/shared/src/**/*.{ts,tsx,js,jsx,html}",
    "./docs/**/*.{md,mdx}"
  ],
  theme: {
    extend: {
      colors: {
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
        display: ["'InterVariable'", "'Inter'", "system-ui", "sans-serif"],
        body: ["'InterVariable'", "'Inter'", "system-ui", "sans-serif"]
      },
      borderRadius: {
        xl: "1.25rem"
      }
    }
  },
  plugins: [],
  future: {
    hoverOnlyWhenSupported: true
  }
};

export default config;
