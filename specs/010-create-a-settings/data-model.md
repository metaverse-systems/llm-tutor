# Data Model – Settings Page Accessible from Global Header

## Entities

### SettingsEntryPoint
- **Purpose**: Represents the persistent gear icon in the global header.
- **Attributes**:
  - `id`: string (`"settings-gear"`)
  - `ariaLabel`: string ("Open settings")
  - `route`: string (`"/settings"`)
  - `isActive`: boolean (derived from current route)
  - `isVisible`: boolean (true in desktop and web contexts)
  - `keyboardShortcut`: optional string (future enhancement placeholder)
- **Behavior**:
  - Must remain keyboard operable (Tab/Enter/Space) and clickable via pointer.
  - Reflects active styling when `route` matches current location.
  - Transfers focus to `SettingsPage.headingId` on activation and stores a reference for returning focus when closing.

### SettingsSection
- **Purpose**: Logical grouping displayed on the Settings page.
- **Instances**: `General`, `LLMProfiles`, `Diagnostics`.
- **Shared Attributes**:
  - `id`: string (e.g., `"settings-general"`)
  - `title`: string
  - `description`: localized string summarising section purpose.
  - `contentRef`: pointer to nested component/render function.
  - `ariaRole`: string (`"region"`) with `aria-labelledby` referencing heading.
- **Section-Specific Notes**:
  - **General**: Hosts `PreferenceControl` entries for theme and telemetry.
  - **LLMProfiles**: Embeds existing profile management component; maintains compatibility with IPC contracts (`llmProfile:*`).
  - **Diagnostics**: Links to diagnostics export triggers and retention guidance; no direct data mutation.

### PreferenceControl
- **Purpose**: Individual toggle or selection exposed within the General section.
- **Attributes**:
  - `id`: string (`"theme"`, `"telemetry"`)
  - `label`: string (visible text)
  - `description`: string (contextual help and privacy messaging)
  - `controlType`: enum (`"toggle" | "select"`)
  - `value`: union (`"light" | "dark" | "system"` for theme; boolean for telemetry)
  - `defaultValue`: matches clarified opt-out requirement (`false` for telemetry)
  - `onChangeAction`: IPC/HTTP reference or shared hook callback
  - `requiresConsent`: boolean (true for telemetry to gate opt-in copy)
  - `telemetryState`: object `{ enabled: boolean, consentTimestamp?: number }`

### DiagnosticsLink
- **Purpose**: Represents actionable links in the Diagnostics section.
- **Attributes**:
  - `id`: string (`"export-diagnostics"`, `"retention-info"`)
  - `label`: string
  - `description`: string emphasising local-only handling
  - `destination`: function reference (Electron dialog or frontend route)
  - `isEnabled`: boolean (respects feature availability)

## Relationships & State
- `SettingsEntryPoint` activates `SettingsSection[]` and coordinates focus hand-off.
- `SettingsSection` composes `PreferenceControl[]` or `DiagnosticsLink[]` as appropriate.
- `PreferenceControl.telemetryState` persists via existing electron-store vault (no schema changes required but default must be validated on first run).
- `DiagnosticsLink` triggers existing diagnostics services; no new persistence added.

## Validation Rules
- Exactly one `SettingsEntryPoint` may be rendered in the header.
- `SettingsSection` headings must be unique and map to accessible `aria-labelledby` references.
- `PreferenceControl.telemetryState.enabled` defaults to `false` until explicit opt-in; if `true`, `consentTimestamp` must be recorded.
- `PreferenceControl.controlType === "toggle"` implies keyboard activation via Space/Enter and state announcement for assistive tech.
- `DiagnosticsLink.isEnabled === false` must provide disabled messaging to avoid dead-end navigation.

## State Transitions
- `SettingsEntryPoint.isActive`: `false → true` when route becomes `/settings`; revert when navigating away.
- `PreferenceControl.telemetryState.enabled`: `false → true` only after learner confirmation; storing `consentTimestamp` ensures auditability.
- `PreferenceControl.theme.value`: changes reflect immediately in renderer theme context and propagate to desktop shell preferences.
- `DiagnosticsLink`: no persistent state change; triggers asynchronous operations with success/failure messaging handled by diagnostics module.
