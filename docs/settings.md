# Settings Page Documentation

## Overview

The Settings page provides a centralized location for managing application preferences, LLM profiles, and diagnostics in llm-tutor. It's accessible via a persistent gear icon in the global header and follows strict accessibility and privacy-first principles.

## Accessing Settings

### Web Application
- Click the gear icon in the top-right header
- Press `Tab` to focus the gear icon, then press `Enter` or `Space`
- Navigate directly to `/settings` route

### Desktop Application (Electron)
- Same as web - the gear icon in the header
- Uses the same frontend routing system
- Additional IPC bridge for native telemetry persistence

## Settings Sections

### General

**Theme Selection**
- System (follows OS preference)
- Light
- Dark

**Telemetry Preference**
- **Default: Opt-out (disabled)**
- Telemetry is OFF by default - you must explicitly enable it
- When enabled, records a consent timestamp for audit purposes
- All diagnostic data stays local unless telemetry is explicitly enabled
- Toggle is fully keyboard operable (`Space` or `Enter` to toggle)

**Privacy Note:** llm-tutor is privacy-first. Your data never leaves your device without explicit consent. Even with telemetry enabled, data remains local-first and is only used to improve the application.

### LLM Profiles

Embedded LLM profile management panel allows you to:
- View all configured LLM providers
- Add new profiles (llama.cpp, OpenAI, Azure, Anthropic)
- Test connections to verify provider availability
- Edit and delete existing profiles
- Set active profile

See [LLM Profiles Documentation](./llm-profiles.md) for detailed usage.

### Diagnostics

**Export Diagnostics**
- Export diagnostic logs as JSONL files
- Useful for troubleshooting or sharing with support
- Files saved locally to your device
- Default retention: 30 days

**Log Directory**
- Quick access to open the diagnostics log directory
- View raw log files and snapshots

See [Diagnostics Documentation](./diagnostics.md) for detailed information.

## Accessibility Features

### Keyboard Navigation
- **Tab**: Navigate through interactive elements
- **Enter/Space**: Activate buttons, links, and toggles
- **Escape**: Close dialogs and return focus (where applicable)

### Focus Management
- Focus automatically moves to Settings heading on page load
- "Return to previous view" skip link at the top of the page
- Focus returns to gear icon when navigating away from Settings

### Screen Reader Support
- All sections have proper ARIA labels and roles
- Section headings use proper hierarchy (h1 for page, h2 for sections)
- Toggle states announced correctly (e.g., "Telemetry enabled" or "Telemetry disabled")
- Status messages for async operations (export results, loading states)

### WCAG 2.1 AA Compliance
- Proper color contrast ratios
- Keyboard-only operation supported
- Focus indicators clearly visible
- No time-based restrictions

## Telemetry Consent Model

### Opt-Out Default
Telemetry is **disabled by default**. This means:
- No usage data collected without your explicit consent
- First launch: telemetry is OFF
- You must actively toggle it ON to enable data collection

### What's Tracked (When Enabled)
When you opt in to telemetry:
- Application usage patterns (anonymized)
- Feature utilization metrics
- Error reports and crash logs
- Performance metrics

### What's NOT Tracked
- Personal information
- File contents or paths
- API keys or credentials
- LLM conversation content
- Any sensitive data

### Consent Timestamp
When you enable telemetry, the application records:
- Timestamp of opt-in action
- Visible in Settings > General section
- Used for audit and compliance purposes

### Revoking Consent
To disable telemetry:
1. Navigate to Settings > General
2. Toggle "Telemetry" to OFF
3. Consent timestamp is cleared
4. Data collection stops immediately

## Developer Notes

### Focus Restoration Pattern
The Settings page implements a focus restoration pattern:
1. Store previous focus target when navigating to Settings
2. Auto-focus the Settings h1 heading on mount
3. Restore focus to gear icon when navigating away

This ensures:
- Screen reader users don't lose context
- Keyboard-only users can navigate efficiently
- Focus state is predictable and consistent

### Implementation Details
- **Frontend**: Shared React components (works in both web and Electron)
- **Backend**: Telemetry service tracks opt-in/opt-out state
- **Desktop**: IPC bridge syncs preferences via electron-store
- **Storage**: Web uses localStorage, Desktop uses electron-store

### Test Coverage
- Unit tests for GeneralSection and DiagnosticsSection components
- Playwright E2E tests for navigation and accessibility
- Vitest preload tests for Electron IPC bridge

See test files in:
- `apps/frontend/tests/pages/settings/`
- `apps/frontend/tests/components/settings/`
- `apps/desktop/tests/e2e/settings/`
- `apps/desktop/tests/preload/settings-bridge.spec.ts`

## Troubleshooting

### Settings page doesn't load
- Ensure frontend dev server is running
- Check browser console for routing errors
- Verify `/settings` route is registered

### Telemetry toggle doesn't persist
- **Web**: Check browser localStorage is enabled
- **Desktop**: Verify electron-store has write permissions to userData directory
- Check console for errors from preload bridge

### Gear icon not visible
- Verify Header component is rendered
- Check if route detection is working (active state styling)
- Ensure proper import/export of Header component

### Focus not landing on heading
- Check if auto-focus useEffect is running
- Verify heading has `tabIndex={-1}` attribute
- Ensure ref is properly attached to h1 element

## Related Documentation

- [Architecture Overview](./architecture.md)
- [LLM Profiles](./llm-profiles.md)
- [Diagnostics System](./diagnostics.md)
- [Testing Guide](./testing-log.md)

## Changelog

### 2025-10-11 - Initial Release
- Settings page with General, LLM Profiles, and Diagnostics sections
- Telemetry opt-out default with consent tracking
- Full keyboard accessibility and WCAG 2.1 AA compliance
- Cross-platform support (web and Electron desktop)
