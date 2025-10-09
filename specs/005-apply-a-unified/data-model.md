# Data Model: Unified Theme Tokens

_Last updated: 2025-10-09_

## 1. Overview
The unified theme introduces a set of strongly-typed tokens consumed by Tailwind config, React frontend, and Electron renderer. Tokens live in TypeScript for type safety and are exported as JSON for runtime tooling. High-contrast variants are mandatory per clarification FR-003a.

## 2. Token Schema
```ts
interface ThemeToken {
  id: string; // kebab-case unique key, e.g., "surface-primary"
  role: TokenRole; // semantic grouping (surface, text, border, accent, state, motion)
  value: TokenValue; // type-specific configuration (color hex, font stack, spacing scale, etc.)
  contrast: {
    high: TokenValue; // required alternative for high-contrast mode
  };
  metadata?: {
    description?: string;
    minContrastRatio?: number; // e.g., 4.5 or 3.0
    references?: string[]; // design spec, figma links
  };
}

type TokenRole =
  | "surface"
  | "text"
  | "border"
  | "accent"
  | "state"
  | "shadow"
  | "motion"
  | "spacing"
  | "radius";

type TokenValue =
  | { type: "color"; hex: `#${string}`; alpha?: number }
  | { type: "typography"; fontFamily: string; fontSize: string; lineHeight: string; fontWeight?: number }
  | { type: "spacing"; rem: number }
  | { type: "radius"; rem: number }
  | { type: "shadow"; value: string }
  | { type: "motion"; durationMs: number; easing: string }
  | { type: "opacity"; value: number };
```

## 3. Collections
- `ThemeToken[]` is grouped into semantic maps when exported:
  - `colors.surface`, `colors.text`, `colors.border`, `colors.state`
  - `typography.heading`, `typography.body`, `typography.code`
  - `spacing.scale`, `radius.scale`, `shadow.levels`, `motion.transitions`
- Collections are transformed into Tailwind theme extensions (`theme.extend.colors`, `fontFamily`, `spacing`, `borderRadius`, etc.).

## 4. Derived Assets
- **JSON snapshot**: Generated during build under `packages/shared/dist/theme.tokens.json` to feed tests and Electron bundler.
- **CSS variables**: `:root { --surface-primary: #... }` plus `[data-theme="contrast"]` overrides using `contrast.high` values.
- **TypeScript helper**: `resolveToken(role: TokenRole, id: string)` to ensure consumers reference tokens via enumerated keys.

## 5. State Management Hooks
Shared hook `useThemeMode()` will expose:
```ts
interface ThemeModeState {
  appearance: "standard" | "high-contrast";
  motion: "full" | "reduced";
  toggleAppearance(mode?: ThemeModeState["appearance"]): void;
  toggleMotion(mode?: ThemeModeState["motion"]): void;
}
```
- Settings stored via existing electron-store in desktop and localStorage in frontend, synced with system preferences.

## 6. Validation Rules
1. Every token must define `contrast.high` with contrast ≥ 7:1 for text, ≥ 4.5:1 for surfaces.
2. Hex values must be uppercase and 6-digit; optional alpha expressed via separate field.
3. Generated Tailwind config must include safelist entries for `[data-theme="contrast"]` selectors.
4. Token arrays validated through Zod schema mirrored after interfaces above.

## 7. Future Extensions
- Support optional dark mode via `appearance: "dark"` variant.
- Introduce motion curves library once animations defined in product spec.
