# Profile IPC Accessibility Suite

Accessibility specs pair Playwright with axe-core to confirm renderer messaging remains perceivable when IPC failures occur.

## Harness & Mocks
- Reuse the Playwright Electron launch harness configured for screen reader emulation and reduced-motion preferences.
- Stub IPC responses to surface `VALIDATION_ERROR`, `SAFE_STORAGE_UNAVAILABLE`, and `DISCOVERY_CONFLICT` banners without touching live services.
- Provide localized copy fixtures so tests can assert ARIA labels, region announcements, and focus management for error modals.
- Capture axe-core violation reports and pipe them into the diagnostics helper for later review.
