# Feature Specification: LLM Profile Test Transcript

**Feature Branch**: `011-enhance-llm-profiles`  
**Created**: 2025-10-12  
**Status**: Draft  
**Input**: User description: "Enhance LLM profiles Test connection flow to show conversation transcript\n- Goal: When a user presses \"Test connection\" on the LLM Profiles settings page (apps/frontend/src/pages/settings/LLMProfiles.tsx), display an inline transcript showing the prompt sent and the provider's response.\n- UI: Reuse the existing test prompt input; after invoking the test, surface a collapsible conversation panel beneath the profile row. Show both user prompt and model response, support multi-line text, include latency + status pill, and clear the transcript when the dialog or row is closed.\n- IPC/API: Extend llmProfile:test/llm:profiles:test responses to include message pairs [{ role: 'user' | 'assistant', text }], truncating to 500 chars per log. Ensure backend Fastify endpoint POST /api/llm/profiles/:profileId/test returns the same structure and that diagnostics redact sensitive content.\n- Error states: If the test fails, display the error code and remediation, keep the prompt visible for editing, and hide any stale transcript.\n- Accessibility: New transcript region must be keyboard-focusable, announced via aria-live, and covered by frontend accessibility tests.\n- Tests: Update shared contract tests for the enriched response shape, add backend contract/integration coverage for the new payload, and expand frontend component tests to assert rendering of conversation messages."

## Execution Flow (main)
```
1. Learner opens Settings → LLM Profiles to review available model connections.
2. Learner enters a prompt in the Test connection field for a chosen profile.
3. Learner activates "Test connection" to request a validation exchange with the model.
4. System returns success or failure details, including a conversation transcript when available.
5. Learner reviews transcript, status, and latency to decide on next steps (keep, revise, or troubleshoot the profile).
6. Transcript clears automatically when the profile view closes or another profile becomes active.
7. Accessibility notifications confirm transcript availability and error guidance for assistive technology users.
8. Diagnostics capture prompt/response summaries while honoring privacy safeguards.
```

---

## ⚡ Quick Guidelines
- Focus on conveying why a transcript improves trust in remote LLM connections.
- Keep data handling local-first; only minimal prompt excerpts leave the device when testing remote providers.
- Provide troubleshooting guidance that empowers non-technical learners to resolve connection issues.

### Constitutional Anchors
- **Learner-First Accessibility**: Transcript must be fully keyboard navigable, announced to screen readers, and respect reduced motion settings.
- **Curriculum Integrity & Assessment**: Connection confirmation ensures curricula using that profile can rely on prompt delivery without hidden failures.
- **Local-First Privacy & Data Stewardship**: Only the test prompt and returned text participate in the exchange; transcripts stay local and are cleared on demand.
- **Transparent & Controllable AI Operations**: Learners can inspect exactly what the model returned and understand latency and status metadata before trusting the profile.
- **Quality-Driven TypeScript Web Delivery**: Experience should remain performant, with UI fallbacks if transcript rendering fails and coverage in automated accessibility checks.

## Clarifications

### Session 2025-10-12
- Q: Which behavior should the transcript follow after multiple “Test connection” runs for the same profile? → A: Keep the last three exchanges, dropping older ones automatically.

## User Scenarios & Testing *(mandatory)*

### Primary User Story
As a self-directed learner evaluating LLM Tutor on a new device, I want to see the prompt I sent and the model's response directly within the profile when I run a connection test, so I can decide whether the profile is ready for study sessions without opening developer tools.

### Acceptance Scenarios
1. **Given** a saved LLM profile and an entered test prompt, **When** I press "Test connection", **Then** I see a collapsible transcript showing my prompt, the model’s response, status, and latency beneath that profile.
2. **Given** the same context but the provider returns an error, **When** the test completes, **Then** I see the error code with remediation guidance and no lingering transcript content.

### Edge Cases
- What happens when a transcript exceeds the display limit? → Transcript truncates to the stated character limit while informing the learner that content was shortened.
- How does system handle a profile test with no response body (e.g., timeout)? → UI surfaces the timeout status with remediation tips and keeps the prompt available for retry.
- How does system behave when the learner collapses the transcript and reopens it? → Transcript retains the most recent exchange until the profile view closes or another test replaces it.
- What happens after multiple rapid retries? → Transcript keeps the latest three exchanges and automatically removes older ones so the panel never exceeds the history limit.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: Platform MUST present the latest test prompt and model reply within an inline transcript linked to the selected profile immediately after a test completes, maintaining a rolling history of up to three exchanges per profile.
- **FR-002**: Transcript display MUST include latency, overall status, and a clear indicator of success or failure to aid quick assessment.
- **FR-003**: System MUST suppress transcript content when a test ends in error and instead surface human-readable remediation tied to the error code.
- **FR-004**: Transcript region MUST meet WCAG 2.1 AA criteria, including keyboard focus order, screen reader announcements, and respect for reduced motion.
- **FR-005**: Platform MUST ensure transcripts stay local to the device, apply character truncation at 500 characters per message, and redact sensitive data in diagnostics exports.
- **FR-006**: Platform MUST clear stored transcript content when the learner closes the profile view, switches profiles, or manually dismisses the transcript.
- **FR-007**: Learners MUST be able to retest using the existing prompt without re-entering text, regardless of prior success or failure state.

### Key Entities *(include if feature involves data)*
- **LLM Profile**: Represents a saved connection configuration, including display name, provider type, consent status, and current health indicators used in the settings experience.
- **Test Transcript**: Captures up to the three most recent prompt and response pairings, along with status, latency, and truncation metadata; scoped to a single profile and cleared on session end.
- **Troubleshooting Guidance**: Set of user-facing error explanations and recommended actions derived from test outcomes; mapped to profile error codes for consistency.

---

## Review & Acceptance Checklist
*GATE: Automated checks run during main() execution*

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous  
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---

## Execution Status
*Updated by main() during processing*

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [x] Review checklist passed

---
